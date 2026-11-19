"""Concept marks for kyle-beck.com. Does not replace the live favicon.

Run: python3 art/logo-concepts/render.py
Needs the site's Archivo variable font and Pillow.
"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
FONT_SRC = os.path.join(ROOT, '..', '..', 'public', 'fonts', 'archivo', 'archivo-latin-wdth-normal.woff2')
CREAM = (242, 237, 227)
INK = (31, 29, 26)
ORANGE = (212, 66, 28)
CHROME = (232, 234, 237)
WHITE = (255, 255, 255)
MUTED = (106, 101, 92)

def cut(wght, wdth, dest):
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    font = TTFont(FONT_SRC)
    instantiateVariableFont(font, {'wght': wght, 'wdth': wdth}, inplace=True)
    font.save(dest)
    return dest

def fit(path, text, max_w, max_h):
    dummy = ImageDraw.Draw(Image.new('RGB', (8, 8)))
    lo, hi, best = 8, 900, 12
    while lo <= hi:
        mid = (lo + hi) // 2
        font = ImageFont.truetype(path, mid)
        b = dummy.textbbox((0, 0), text, font=font)
        if b[2] - b[0] <= max_w and b[3] - b[1] <= max_h:
            best = mid
            lo = mid + 1
        else:
            hi = mid - 1
    return ImageFont.truetype(path, best)

def draw_text(d, text, font, box, fill):
    x0, y0, x1, y1 = box
    b = d.textbbox((0, 0), text, font=font)
    w, h = b[2] - b[0], b[3] - b[1]
    x = x0 + (x1 - x0 - w) / 2 - b[0]
    y = y0 + (y1 - y0 - h) / 2 - b[1]
    d.text((x, y), text, font=font, fill=fill)
    return b, x, y

def mark_kb(size, font_path):
    # Archivo at the site's body width. Expanded (125) closes the B at 16px.
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    pad = int(size * 0.14)
    font = fit(font_path, 'KB', size - 2 * pad, int(size * 0.52))
    b, x, y = draw_text(d, 'KB', font, (0, int(size * 0.02), size, int(size * 0.78)), INK)
    tw = b[2] - b[0]
    bw = int(tw * 0.46)
    bh = max(1, round(size * 0.045))
    bx = (size - bw) // 2
    by = int(y + b[3] + size * 0.045)
    if by + bh < size - 2:
        d.rectangle([bx, by, bx + bw, by + bh], fill=ORANGE)
    return im

def mark_wave(size):
    im = Image.new('RGB', (size, size), CREAM)
    d = ImageDraw.Draw(im)
    amps = [0.05, 0.45, -0.25, 1.0, -0.55, 0.35, -0.15, 0.1]
    pts = []
    for i, amp in enumerate(amps):
        x = size * (0.08 + 0.84 * i / (len(amps) - 1))
        y = size * (0.52 - amp * 0.30)
        pts.append((x, y))
    width = max(2, round(size * 0.055))
    d.line(pts, fill=INK, width=width, joint='curve')
    d.line(pts[2:5], fill=ORANGE, width=width, joint='curve')
    return im

def mark_k(size, font_path):
    im = Image.new('RGB', (size, size), INK)
    d = ImageDraw.Draw(im)
    pad = int(size * 0.18)
    bar = max(2, round(size * 0.07))
    font = fit(font_path, 'K', size - 2 * pad, size - bar - int(size * 0.22))
    draw_text(d, 'K', font, (0, 0, size, size - bar), CREAM)
    d.rectangle([0, size - bar, size, size], fill=ORANGE)
    return im

def blow(im, factor):
    return im.resize((im.size[0] * factor, im.size[1] * factor), Image.Resampling.NEAREST)

def tab_mock(icon16, text_font):
    scale = 3
    w, h = 280 * scale, 86 * scale
    im = Image.new('RGB', (w, h), CHROME)
    d = ImageDraw.Draw(im)
    # active tab
    x, y, tw, th = 14 * scale, 28 * scale, 230 * scale, 46 * scale
    d.rounded_rectangle([x, y, x + tw, y + th], radius=10 * scale, fill=WHITE)
    icon = icon16.resize((16 * scale, 16 * scale), Image.Resampling.NEAREST)
    im.paste(icon, (x + 12 * scale, y + 15 * scale))
    d.text((x + 36 * scale, y + 12 * scale), 'Kyle Beck', font=text_font, fill=INK)
    return im

def link_preview(mark, title_font, body_font):
    w, h = 880, 360
    im = Image.new('RGB', (w, h), WHITE)
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w - 1, h - 1], outline=(216, 208, 193))
    thumb = mark.resize((h, h), Image.Resampling.LANCZOS)
    im.paste(thumb, (0, 0))
    x = h + 28
    d.text((x, 70), 'Kyle Beck', font=title_font, fill=INK)
    body = 'Musician and developer. Tonverk packs,\nguides, and a browser tool.'
    d.multiline_text((x, 140), body, font=body_font, fill=MUTED, spacing=6)
    d.text((x, 250), 'kyle-beck.com', font=body_font, fill=ORANGE)
    return im

def board(title, mark512, icon32, icon16, tab, preview, label_font):
    gap = 28
    left = 512
    right_w = 220
    top_h = 512
    w = left + gap + right_w + 36
    # sizes column
    col = Image.new('RGB', (right_w, top_h), CREAM)
    cd = ImageDraw.Draw(col)
    cd.text((8, 8), '32px', font=label_font, fill=MUTED)
    col.paste(blow(icon32, 4), (8, 36))
    cd.text((8, 180), '16px', font=label_font, fill=MUTED)
    col.paste(blow(icon16, 8), (8, 208))
    tab_s = tab.resize((w - 36, int(tab.size[1] * (w - 36) / tab.size[0])), Image.Resampling.LANCZOS)
    prev_s = preview.resize((w - 36, int(preview.size[1] * (w - 36) / preview.size[0])), Image.Resampling.LANCZOS)
    h = 48 + top_h + 24 + tab_s.size[1] + 16 + prev_s.size[1] + 24
    im = Image.new('RGB', (w, h), CREAM)
    d = ImageDraw.Draw(im)
    d.text((18, 12), title, font=label_font, fill=INK)
    im.paste(mark512, (18, 48))
    im.paste(col, (18 + left + gap, 48))
    y = 48 + top_h + 24
    im.paste(tab_s, (18, y))
    y += tab_s.size[1] + 16
    im.paste(prev_s, (18, y))
    return im

def main():
    kb_font = cut(700, 100, '/tmp/archivo-logo-kb.ttf')
    text_font_path = cut(650, 100, '/tmp/archivo-logo-text.ttf')
    small_label = ImageFont.truetype(text_font_path, 22)
    title_font = ImageFont.truetype(text_font_path, 42)
    body_font = ImageFont.truetype(text_font_path, 22)
    tab_font = ImageFont.truetype(text_font_path, 42)
    concepts = [
        ('01-kb', 'KB, Archivo, cream field', lambda s: mark_kb(s, kb_font)),
        ('02-wave', 'One wavetable line', lambda s: mark_wave(s)),
        ('03-k', 'K wordmark on near-black', lambda s: mark_k(s, kb_font)),
    ]
    for slug, title, fn in concepts:
        folder = os.path.join(ROOT, slug)
        os.makedirs(folder, exist_ok=True)
        mark = fn(512)
        icon32 = mark.resize((32, 32), Image.Resampling.LANCZOS)
        icon16 = mark.resize((16, 16), Image.Resampling.LANCZOS)
        mark.save(os.path.join(folder, '512.png'))
        icon32.save(os.path.join(folder, '32.png'))
        icon16.save(os.path.join(folder, '16.png'))
        tab = tab_mock(icon16, tab_font)
        preview = link_preview(mark, title_font, body_font)
        tab.save(os.path.join(folder, 'tab.png'))
        preview.save(os.path.join(folder, 'link-preview.png'))
        sheet = board(title, mark, icon32, icon16, tab, preview, small_label)
        sheet.save(os.path.join(folder, 'board.png'))
        print(slug)

if __name__ == '__main__':
    main()
