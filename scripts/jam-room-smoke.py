#!/usr/bin/env python3
"""Headless smoke test of /jam-room-preview.html in solo and room modes.
Room mode talks to the deployed workers.dev endpoint.
"""
import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
# Prefer the published root copy, then dist/.
for candidate in (ROOT / "jam-room-preview.html", ROOT / "dist" / "jam-room-preview.html"):
    if candidate.exists():
        PAGE_DIR = candidate.parent
        break
else:
    raise SystemExit("jam-room-preview.html is missing. Run npm run pages first.")

WS = "wss://jam-room.kbsound.workers.dev"
PORT = 4179


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PAGE_DIR), **kwargs)

    def log_message(self, *args):
        pass


def main():
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for name, query, expect in (
            ("room", "", "Connected to the room."),
            ("solo", "?ws=wss://127.0.0.1:1", "The room is offline. This is a solo jam."),
        ):
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            url = f"http://127.0.0.1:{PORT}/jam-room-preview.html{query}"
            page.goto(url, wait_until="networkidle", timeout=20_000)
            robots = page.locator("meta[name=robots]").get_attribute("content")
            if robots != "noindex, nofollow":
                failures.append(f"{name}: robots is {robots}")
            try:
                page.locator("[data-room]").wait_for(state="visible", timeout=8000)
                # Room may take a moment to connect.
                page.wait_for_timeout(3500)
                text = page.locator("[data-room]").inner_text()
                if expect not in text:
                    # Room mode can still fall back if the worker is down.
                    if name == "room":
                        failures.append(f"room: expected connected, got {text!r}")
                    else:
                        failures.append(f"solo: expected solo copy, got {text!r}")
                page.locator("[data-start]").click()
                page.wait_for_timeout(2000)
                disabled = page.locator("[data-start]").is_disabled()
                if not disabled:
                    failures.append(f"{name}: Start stayed enabled after click")
                err = page.locator("[data-play-error]").inner_text()
                # Silent-mode hint is acceptable; a thrown engine error is not.
                if err and "silent mode" not in err.lower() and "cannot play" not in err.lower():
                    failures.append(f"{name}: play error {err!r}")
                if errors:
                    failures.append(f"{name}: pageerror {errors}")
                title = page.title()
                if "Jam room" not in title:
                    failures.append(f"{name}: title is {title!r}")
            except Exception as exc:
                failures.append(f"{name}: {exc}")
            page.close()
        browser.close()
    httpd.shutdown()
    if failures:
        print("FAIL")
        for item in failures:
            print(item)
        sys.exit(1)
    print("ok: solo and room smoke passed")


if __name__ == "__main__":
    main()
