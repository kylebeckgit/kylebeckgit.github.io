# Modal Generator for Zebra 3: what it does, and three ways forward

This is a design note only. It does not change `/z3-webgpu.html`.

The page today is `public/z3-webgpu.html`, linked from the home page and from `/tools/`. It is a single HTML file. Nothing on the server generates a sound.

## What it does today

You open the page and press **Initialize AI Engine**. That downloads a local model, **Phi-3-mini-4k-instruct**, quantized for WebLLM (`Phi-3-mini-4k-instruct-q4f16_1-MLC`), from a public CDN (`esm.run`). The page says the download is about **2.3 GB** and that it stays in the browser cache. The model runs on the device GPU through WebGPU. There is no account and no API key.

Until that download finishes, the only control is the initialize button. After it is ready, a text box appears. The sample prompt in the box is “A rusted metal plate vibrating in a vacuum with unstable harmonics.” You type a description and press **Generate Profile**.

The model is not asked to write the sound. It is asked to return a small JSON object and nothing else:

- `topology`: one of harmonic, inharmonic, stiff string, membrane, tongue drum, major chord, minor chord
- `stiffness`, `detune`, and `clusterProb`: numbers in a short range
- `material`: metal, wood, glass, or standard
- `decayTime`: short, medium, or long
- `brightness`: dark, neutral, or bright

A fixed formula in the page then builds **64 partials** from those eight fields. The same numbers always produce the same partials (the random seed is hard-coded). The formula picks frequency ratios from a recipe for that topology, then sets a gain in decibels and a decay time from the material, brightness, and decay words.

## What a Zebra 3 modal profile is, in this file

Zebra’s modal section treats a sound as a set of modes: each mode is a frequency, a loudness, and how fast it dies. The file this page builds is a plain-text list of those modes, saved as `zebra3_ai_profile.csv`.

The first line is the header `Ratio;GainDB;Decay`. Columns are separated with semicolons. Each following line is one mode: frequency as a ratio against the first mode, gain in dB, and a decay number. There are 64 modes. One extra line is a comment, `// AI Params: {...}`, which is not a mode.

The page does not open Zebra and does not say which menu imports the file. You press **Download CSV**, and the browser saves that text. Getting it into Zebra is left to you.

## How the file reaches you

The whole path stays on your machine. The model download comes from the CDN. The prompt is not sent to kyle-beck.com. The CSV is built in the page and downloaded from a blob URL. If generation fails, the error is written into the same text box. There is no audio preview at any step.

## Weak points

- **Load time and size.** Nothing useful happens until a multi-gigabyte model has downloaded. A phone, which is how this site is actually being looked at, is a bad place for that.
- **Device support.** It needs WebGPU and a browser build of WebLLM that can run that model. A missing GPU, a blocked CDN, or an unsupported browser stops at “Error” on initialize. There is no second path.
- **The model is doing a small job.** Phi-3 only picks a category and a few knobs. The spectrum itself is a hand-written recipe. A description that does not match those category words falls through to a generic inharmonic pile. Temperature is 0.5, so the JSON can change between clicks, and it can also come back as text the page cannot parse.
- **Output quality.** Sixty-four partials from a keyword recipe will not reliably sound like the sentence you typed. You cannot hear them, and you cannot nudge one partial. The comment line in the file is easy for an importer to reject.
- **Failure cases in the page.** Empty prompt does nothing. Bad JSON is dumped into the box. A runtime error is appended as `[Error Generation Failed]`. There is no retry that skips the model and still gives you a file.

## Direction 1: a small model on Cloudflare Workers AI

The page stays a form. Generate sends the sentence to a Worker on Kyle’s Cloudflare account. The Worker calls Workers AI with the same short JSON schema, then either returns that JSON or runs the existing partial formula and returns the CSV. The browser never downloads a model.

**Experience.** Type, wait a second or two, see the partial list, download the CSV. First visit is the same as the second. Phones work. Still no sound unless a later version adds it.

**Build and host.** One Worker with an AI binding, the current formula moved server-side or kept in the page, and a static form where `z3-webgpu.html` is now. GitHub Pages can keep serving the form. The Worker is a separate route, for example `api.kyle-beck.com` or a `workers.dev` host. No GPU on the visitor’s machine.

**Cost.** Workers AI pricing, as published 20 October 2026, is **$0.011 per 1,000 neurons**, with **10,000 neurons per day free** on both the Free and Paid Workers plans. Past that, the Paid plan is required. Cloudflare’s July 2026 note puts the Paid plan at **$5 per month** before overage.

A sensible model for this job is a small instruct model, not a frontier one. `@cf/meta/llama-3.2-3b-instruct` is listed at **$0.051 per million input tokens** and **$0.335 per million output tokens** (about 4,600 neurons per million input tokens and 30,500 per million output tokens). A call of roughly 600 input tokens and 80 output tokens is on the order of **5 neurons and a fraction of a cent**. The free daily pool covers on the order of **a couple of thousand** of those calls. A larger 8B model on the same table is in the same neighborhood for a prompt this short. Frontier models are the wrong tool here and, for some of them, are capped at 20 requests per minute unless billed through AI Gateway credits.

**Abuse.** Text-generation models share an account limit of **300 requests per minute** (paid-only models are lower). That limit is for the whole account, not per visitor. At ~5 neurons a call, a script at that rate spends the free 10,000 neurons in a few minutes. After that, a Paid account keeps going and the bill follows the neuron price: a full-rate flood is on the order of a dollar an hour, not thousands, but it is still an open tap. The Worker should refuse calls that fail a Turnstile check, cap each IP (something like a handful per hour), and stop calling the model after a daily ceiling you choose. Do not expose the AI binding on a public URL with no check.

**Risks.** The sound is still the same keyword recipe, so quality does not jump just because the model moved. Vendor limits and the occasional “out of capacity” error move from the browser to Cloudflare. The prompt text does leave the device.

## Direction 2: a visual editor, no model

Drop the model. The page is a list or a drawing of partials: ratio, gain, decay. You drag bars, hear a rough preview made of ordinary Web Audio oscillators, and download the same kind of CSV. Presets for “string”, “bell”, “drum”, and “chord” can fill the bars using the formulas already in the file.

**Experience.** Open the page and it works. No download, no GPU, no account. You hear something immediately, then you shape it. The preview will not be Zebra’s resonators, but it will tell you if a partial is loud, dull, or out of tune. Download is the same button as today.

**Build and host.** A front-end page. GitHub Pages hosts it the way it hosts the rest of the site. No Worker, no model bill. The work is the editor: 64 rows is a lot for a phone, so the first version should show fewer partials, or a graph you can draw on, and still export 64 if Zebra wants them.

**Cost.** Ongoing cost is the site you already have, which is effectively nothing on Pages.

**Risks.** It will not turn a sentence into a sound. People who liked the prompt box lose that. A bad preview can teach the wrong lesson if it is too far from Zebra. The editor has to stay simple or it becomes a second synth.

## Direction 3: hybrid

The editor in direction 2 is the product. A **Describe** button is optional. It sends one sentence to the Worker from direction 1, fills the bars from the JSON, and then gets out of the way. You hear the preview, move a partial, and download. If the Worker is down, rate-limited, or you are offline, the editor and the preset buttons still work.

**Experience.** The page is useful on the first paint. The prompt is a shortcut into the bars, not a gate in front of them. Phones can edit and listen. The model call is a small extra, easy to skip.

**Build and host.** Direction 2, plus the small Worker from direction 1. They can ship separately: editor first, Describe when the limit and the Turnstile check are in place.

**Cost.** Same as direction 1 for the days someone uses Describe, and zero for everyone who only draws. The free neuron pool is enough for personal use and light sharing if the per-IP cap is real.

**Risks.** Two systems to keep, but each is small. The model can still misread a sentence; because the bars are visible and audible, that miss is editable instead of a mysterious CSV.

## Recommendation

Build the hybrid, editor first.

The current page spends a 2.3 GB download so a general chat model can pick eight labels. That is the outdated part. The useful part is already the formula that turns those labels into a partial list, and it does not need a model to run. A page where you see and hear the partials, with a cheap optional prompt behind a hard cap, matches how the site is actually opened (including on a phone) and keeps the ongoing cost inside the free daily neurons for normal use.

Do not start with a frontier model, and do not leave the Worker open. A small instruct model, Turnstile, a per-IP limit, and a daily ceiling are the whole abuse story. The CSV should drop the `// AI Params` comment before anyone relies on an importer.
