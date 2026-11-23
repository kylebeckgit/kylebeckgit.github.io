# Object library for the modal preview: plan

Status: local prototype on branch `modal-objects`. Nothing is deployed or pushed.
Scope: `src/pages/z3-describe-preview.astro` and `src/tools/modal-preview/` only. The public tool, `z3-webgpu.astro` and the repo-root `z3-webgpu.html` are untouched.

## What it does

The Wild roll used to bend five generic materials. Now a roll can start from a named real object (19 so far), keep that object's pitch series, and move the knobs inside ranges that suit it. A Feral switch skips the "playable" check for rolls that are meant to be strange.

## Architecture

| File | Role |
| --- | --- |
| `objects.js` | The data. Array of objects `{id, name, aliases[], family, material, shape, tuning, partials[], mutate{}, notes, basis{}, sources[]}`. Also `baseProfile`, `objectById`, `matchObjectText` (free text to nearest object) and `searchObjects` (typeahead). No imports, so it is cheap to load and easy to test. |
| `objects-randomize.js` | `loadObject` (the base, untouched), `rollObject` (one roll inside an object), `mutateProfile` (a different example of the same object), `assessObject`. |
| `randomize.js` | Small diff: a few helpers are now exported, `expandedRange` is split so any knob table can be widened by wildness, and `rollSound` takes `feral` plus a shared `safetyCheck`. A non-feral roll is unchanged (test covers this). |
| `ui.js`, `z3-describe-preview.astro` | An Object box next to Material: a text box with a typeahead over names and aliases (also takes a description such as "a rusty hubcap"), a plain Object select as the fallback, a Feral checkbox, and a Load object button. Choosing an object disables Material. |
| `objects.test.js` | 12 tests, added to `npm test`. |
| `objects-tools/` | `disk_modes.py` (computes the free-disk mode ratios) and `ui-smoke.html` (headless browser check). |

Profile shape is unchanged: `{ratio, gainDb, decay}`, at most 256 rows, gain floor -96 dB. Share links keep ratio 0.05 to 80 and decay 0.05 to 30 s, so every base profile fits, rolls never exceed ratio 80 (Tune is lowered if needed) and `material` and `shape` use values `share.js` already allows. The share and Zebra export code is reused as is, and a test round-trips every object through both.

### How a roll works

1. `mutateProfile` copies the base and applies a small ratio jitter (per-object cents), level jitter, a decay scale from the object's range, and, for objects that have it, a beating twin next to some partials (the pair split). Strength scales with wildness and Amount.
2. Knobs are sampled from the object's own `mutate` ranges, widened toward the hard limits as wildness rises, then blended with the current knobs by Amount. Locks work as before.
3. Density stays at the object's native row count, so the series is never resampled into invented rows. Wild and Feral may drop to a lower step.
4. Non-feral rolls must pass `assessQuality`, except the clump and merged-bar reasons, which do not apply to objects built from near-twin pairs.
5. Feral rolls widen jitter and reach, may bend the series (power law on the ratios), tilt the levels, or let the highs outlast the low, and then only need to load and be audible. Their description ends in "feral".

### Honesty about the data

Each object has `basis` for ratio, gain and decay, and `sources`. Of the 19:

- measured: church bell (Rossing and Perrin, table of one bell, ratios and decay times as printed), singing bowl (Inácio and Henrique, Bowl 1, both A and B mode frequencies).
- published tuning: Bonang (generic spectrum), steel pan, handpan, guitar body (first three modes).
- physics: wine glass (ring formula), slinky (n squared from Crawford's relation, idealized), lithophone (free-free bar), kalimba and daxophone (cantilever), saw blade (computed free-edge disk).
- approximation, by ear: cymbal, bowed cymbal, hubcap, brake drum, cowbell, waterphone, slit log. Each entry's notes begin with the word Approximation and its source line says none.

Levels are approximations for all 19. Only the church bell has decay times from a table, and its definition of decay time was not confirmed. See `OBJECTS-SOURCES.md` (generated from the data) for the per-entry text. I read the papers through search excerpts only; volume and page numbers I could not see are left out rather than guessed.

## Growing the library

1. Add an entry to `objects.js`. A new entry must say what each field rests on, and an approximation must say so. The tests enforce the field names, limits, labels and that an approximation cites nothing.
2. Prefer a measured table. Enter ratios to the lowest mode, keep near-twin pairs as two rows, and put the citation in `sources`.
3. Add aliases people actually type, then check `matchObjectText` on a few phrases.
4. Regenerate `OBJECTS-SOURCES.md` with the script in `/workspace/modal-profiles/objects-tools/write_sources.mjs` (or move it into the repo if Website wants it there).

### Users requesting objects (no network from the page)

- When the box text matches nothing, the page can say "Not in the library yet" and offer a link the user chooses to click (a prefilled message or issue). Nothing is sent automatically.
- Requests are collected by hand and triaged weekly: has anyone published modal data, can it be derived from a standard model (bar, plate, ring, tube, string), or does it need a recording. Anything that has neither goes in as an approximation, labeled.
- The page could also fall back to the nearest family (metal, wood, glass, skin, bell) with a plain line saying that no object matched.

### From a recorded impulse to modal data (objects with no published data)

`analyze.js` already turns a recording into partials on the page. The same path can produce an object entry:

1. Record 5 to 10 single strikes in a quiet room, mic near the object, objects hung or on foam. Use at least 4 s per strike so a 0.5 Hz beat can be told from one peak.
2. Estimate the root and every partial's frequency from a long-window spectrum, then each partial's decay from a log-envelope fit of its band-passed signal (or a matrix-pencil fit for dense clusters).
3. Keep pairs when two peaks sit within about 1 percent and both decay on their own. Take the median across strikes so a bad hit does not set the ratios.
4. Write the result as an entry with `basis.ratio: 'measured, own recording'` and `basis.decay: 'measured, own recording'`, the date, the object, and the strike count. Store only the derived numbers, never the audio.
5. The existing Analyze view can export the JSON so Kyle can drop it into `objects.js`.

## Known limits

- A modal profile has no time-domain behavior. The Slinky's downward chirp cannot be reproduced. Only the stretched ladder can.
- Zebra export keeps rows under 6 kHz at the played pitch. At A4, the kalimba and daxophone (ratio 17.5 and above) export 2 rows, and the slinky 3. These objects need a lower played pitch, or a per-object reference pitch field. That is a decision for the site, not something I changed.
- Real instruments differ from one to the next. Jitter ranges are by-ear approximations, not measured spreads.
- Slendro and pelog are scales, not partial sets. The Bonang entry gives the partials only. Pelog step sizes are not included because I have no verified figures.
- The levels of every entry are approximations, so two objects can sound closer or further apart than the real ones do.

## What needs Kyle's ear

- Singing bowl and church bell (the two measured): does the beating and hum sound right at A4?
- Each approximation (cymbal, bowed cymbal, hubcap, brake drum, cowbell, waterphone, slit log): is it recognizable, or should it be dropped until it is measured?
- Wine glass and saw blade: does the physics series sound like the object?
- Kalimba and daxophone: they are the same ratios, so is the difference in levels and decay enough?
- Feral: are the rolls interesting rather than only broken?
- Slinky: is the ladder useful without the chirp?

Renders for these are in `/workspace/modal-profiles/objects-2026-11-22/` (base, one Wild and one Feral per object, A4, 4 s, 48 kHz).

## Open questions

- Website: where should the Object box sit on narrow screens, and should the note under it link to the sources file?
- Website: is a per-object reference pitch acceptable for the 6 kHz export limit?
- Kyle: keep the approximation objects in the first release, or ship measured and physics-based ones only?
