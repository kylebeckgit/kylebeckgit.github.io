# Object library sources

Generated from objects.js. Every entry states what its pitch ratios, levels and decays rest on.

Reading the labels:

- measured: read from a published measurement table.
- published tuning: an interval set that the cited work reports as the tuning.
- physics: computed from a standard model; the model is named under the entry.
- approximation: designed by ear. No data behind it.

Levels (GainDb) are approximations for every entry. Decays are approximations except the church bell, whose decay times are the values printed in the cited table.

Honesty notes:

- I could only read these papers through search excerpts, not the full texts. Where a volume or page is not shown below, I did not confirm it.
- Nothing in an approximation entry is presented as a measurement.
- Search found no published modal data for brake drum, cowbell, waterphone, hubcap, cymbal or slit log.

## Church bell (church-bell)

Family bell, material metal, shape shell.

Ratios: measured. Levels: approximation. Decays: measured as printed.

A tuned minor-third church or carillon bell of the Dutch (Hemony) tradition. Ratios and decay times are the values printed for one measured bell; the hum is ratio 1 here, so the prime is an octave up. Hum decay is capped at the page limit of 30 s (printed: 52 s). Levels are approximations, and the top row of the printed table (8.215) is left out.

Sources:

- Rossing, T. D. and Perrin, R., "Vibrations of bells", Applied Acoustics (1987; volume and pages from memory, unverified), Table 5: ratios 0.500 to 6.796 and decay times for the bell in its Fig. 7. Read from a text extract of the table; the decay-time definition was not confirmed against the original.
- Rossing, T. D., "Acoustics of Eastern and Western bells, old and new", J. Acoust. Soc. Jpn (E) 10 (1989) 241, from its J-STAGE address: bell founders tune the lowest five modes to 1 : 2 : 2.4 : 3 : 4 relative to the hum, and the Hemony brothers led this tuning.
- Carvalho, Debut and Antunes, "A Review of Bell Design and Tuning Techniques from Magic to Science", ISMA 2017: first five partials at 0.5 : 1 : 1.2 : 1.5 : 2.

## Tibetan singing bowl (singing-bowl)

Family glass, material metal, shape bowl.

Ratios: measured. Levels: approximation. Decays: approximation.

Each mode is two orthogonal modes a fraction of a hertz to ten hertz apart, so every partial beats. Frequencies are the two measured sets for Bowl 1 (mass 934 g, 180 mm). Levels and decays are approximations: the paper reports very low damping but the decay times here are chosen, not measured.

Sources:

- Inacio, O. and Henrique, L. (Instituto Politecnico do Porto), "The Dynamics of Tibetan Singing Bowls", PDF at projects.itn.pt/BellTune/File3.pdf, Table I: Bowl 1 modal frequencies A and B for (2,0) to (8,0), ratios 1, 2.8, 5.2, 8.1, 11.6, 15.6, 19.9. A journal version with Antunes exists; its volume and pages are not verified here.

## Wine glass (wine-glass)

Family glass, material glass, shape bowl.

Ratios: physics. Levels: approximation. Decays: approximation.

Ratios come from the inextensional ring formula f ~ n(n^2-1)/sqrt(n^2+1) for the (n,0) modes, which gives 1, 2.83, 5.42, 8.77, 12.87, matching the measured singing-bowl series (1, 2.8, 5.2, 8.1, 11.6) to a few percent. No wine glass was measured here. Levels and decays are approximations. The pair split used in rolls is an approximation of the slight asymmetry in real glass.

Sources:

- Thin ring bending-mode formula (Lord Rayleigh, The Theory of Sound, inextensional vibrations of a ring). Applied here as an idealization of a wine glass.
- Cross-check: Inacio and Henrique, singing-bowl Table I (see Tibetan singing bowl).

## Gamelan bonang (bonang)

Family bell, material metal, shape shell.

Ratios: published tuning. Levels: approximation. Decays: approximation.

The ratios are a generic bonang spectrum of four partials. Real instruments differ from one to the next, so the roll jitter is wide. Slendro and pelog are scale systems, not partial sets: use Tune or transpose in Zebra to place a bonang on a scale step. Levels and decays are approximations.

Sources:

- A generic bonang spectrum of 1 : 1.52 : 3.46 : 3.92, attributed to Sethares (Tuning, Timbre, Spectrum, Scale) in the paper "The Effect of Inharmonic and Harmonic Spectra In Javanese Gamelan Tuning (1): A Theory of the Sléndro" (WSEAS conference, 2006). Quoted from a search summary; not checked against either source.
- Slendro and pelog step sizes: ranges reported in the same search summary, which also cites "Comparative acoustical and psychoacoustical analyses of gamelan instrument tones" (J. Acoust. Soc. Jpn (E) 14, no. 6) and "Puzzling Origin of Javanese Tuning Systems" (J. Acoust. Soc. Am. 35, 1963 supplement). Not read in full.

## Steel pan note (steel-pan)

Family metal, material metal, shape plate.

Ratios: published tuning. Levels: approximation. Decays: approximation.

The first three ratios are the tuning the published work reports for a tenor pan note (some notes tune the third mode to two octaves instead). Partials 4 to 6 and all levels and decays are approximations: measured higher partials of real notes are often not harmonic.

Sources:

- Rossing, T. D., Hansen, U. J. and Hampton, D. S., "Vibrational mode shapes in Caribbean steelpans. I. Tenor and double second", J. Acoust. Soc. Am. 108 (2000) 803-812: tuners tune one mode an octave above the fundamental and, where possible, a third mode a twelfth or two octaves above.
- Stockholm Steel Band, "Steel Pan Tuning", tone-generation chapter: strong harmonic partials, with higher partials not always explained by the third mode.

## Handpan tone field (handpan)

Family metal, material metal, shape plate.

Ratios: published tuning. Levels: approximation. Decays: approximation.

The three tuned modes are the published fundamental, octave and compound fifth. The fourth partial is an approximation I added so the profile has four rows, and all levels and decays are approximations.

Sources:

- PANart, "History, Development and Tuning of the Hang" (2007), hangblog.org/panart/Paper-Hang-2007.pdf (authors not confirmed): the tone field is tuned so (0,1), (1,1)a and (1,1)b sit at 1 : 2 : 3.
- Physics Today, "The extraordinary sound of the hang"; Archives of Acoustics, "Modes of vibration and sound radiation from the Hang". Both seen as search excerpts only.

## Slinky or tension spring (slinky)

Family metal, material metal, shape string.

Ratios: physics. Levels: approximation. Decays: approximation.

For the relation omega = c k^2 r, the modes of a spring of fixed length sit at k = n pi / L, so frequency goes as n squared. That gives 1, 4, 9, 16, 25. This is an idealization of a published approximate relation. A modal profile cannot reproduce the downward chirp, which is a time-domain effect; it only gives the stretched, bright ladder. Levels and decays are approximations.

Sources:

- Crawford, F. S., "Slinky-whistler dispersion relation from scaling", Am. J. Phys. 58 (1990) 916-917: approximate dispersion relation omega = c k^2 r.
- "The Sound of a Laser Blaster: Acoustic Dispersion in Metal Springs Analyzed with Mobile Devices and Open-Source PC Audio Software", The Physics Teacher 60 (issue 1), p. 28. Describes the high-to-low chirp and quotes Crawford.

## Granite or slate lithophone bar (lithophone)

Family wood, material stone, shape bar.

Ratios: physics. Levels: approximation. Decays: approximation.

The ratios are the exact free-free uniform-bar series. A real stone bar is thick, so the upper modes sit lower than this, and tuning notches change the series; the roll jitter covers some of that. Levels and decays are approximations, with a short decay chosen for stone.

Sources:

- Euler-Bernoulli free-free bar: roots of cos(bL) cosh(bL) = 1 at bL = 4.730, 7.853, 10.996, 14.137, 17.279 (standard result; see Fletcher and Rossing, The Physics of Musical Instruments, chapter on bars). Computed here; not copied from a table.

## Kalimba with imperfect tines (kalimba)

Family metal, material metal, shape bar.

Ratios: physics. Levels: approximation. Decays: approximation.

The ratios are the exact clamped-free (cantilever) series, which is far from harmonic, so the second partial is more than two octaves up. Real kalimba tines are held on a bridge and shaped, so their upper partials differ; the "imperfect" part is a wide ratio and level jitter in the roll range, an approximation and not a measurement. Levels and decays are approximations.

Sources:

- Euler-Bernoulli clamped-free bar: roots of cos(bL) cosh(bL) = -1 at bL = 1.875, 4.694, 7.855, 10.996, 14.137 (standard result; see Fletcher and Rossing, The Physics of Musical Instruments). Computed here.

## Daxophone tongue (daxophone)

Family wood, material wood, shape bar.

Ratios: physics. Levels: approximation. Decays: approximation.

The tongue is modeled as a uniform cantilever, so the ratios are the same as the kalimba tine. The real tongue is shaped and held against a fulcrum, and the voice-like quality comes from bowing and from formant-like shaping that a modal list does not capture. Levels and decays are approximations, set longer than the kalimba to suggest a bowed, sustained sound.

Sources:

- Euler-Bernoulli clamped-free bar series (see Kalimba). No daxophone measurement was found; this is an idealization.

## Circular saw blade (saw-blade)

Family metal, material metal, shape plate.

Ratios: physics. Levels: approximation. Decays: approximation.

Ratios were computed for a thin flat free-edge disk with Poisson ratio 0.33: (2,0), (0,1), (3,0), (1,1), (4,0), (5,0), (2,1) and so on. Teeth, the center hole and any clamp are ignored, which shifts real blades. Real disks also split each pair of nodal-diameter modes slightly, which the pair split in rolls imitates. Levels and decays are approximations.

Sources:

- Kirchhoff thin-plate theory, free edge; see Leissa, Vibration of Plates (NASA SP-160, 1969), for the equation. The ratios are computed by the script src/tools/modal-preview/objects-tools/disk_modes.py and agree with the values I recall from Leissa, but I did not check them against the table.

## Cymbal (cymbal)

Family metal, material metal, shape plate.

Ratios: approximation. Levels: approximation. Decays: approximation.

Approximation. The ratios start from the free-disk series (see Circular saw blade) and are stretched by a power of 1.12 by ear. Real cymbals have hundreds of strongly coupled modes and a shaped bell, so this is a thin outline of one. Levels and decays are approximations.

Sources:

- No measurement used. Starting series from the free-disk computation described under Circular saw blade; stretch factor chosen by ear.

## Bowed cymbal (bowed-cymbal)

Family metal, material metal, shape plate.

Ratios: approximation. Levels: approximation. Decays: approximation.

Approximation. Bowing excites the same disk modes as striking, but sustains them, so the decays are long and levels fall off slowly. Ratios are the stretched disk series from the cymbal entry. Everything about levels and decays is by ear.

Sources:

- No measurement used. See Cymbal and Circular saw blade for the starting series.

## Car hubcap (hubcap)

Family metal, material metal, shape plate.

Ratios: approximation. Levels: approximation. Decays: approximation.

Approximation. A hubcap is a thin shallow dome with a stiff rim, not a flat disk. The ratios start from the free-disk series and are compressed by a power of 0.94 by ear. Levels and decays are by ear, with a short decay for thin pressed steel.

Sources:

- No measurement used. Starting series from the free-disk computation under Circular saw blade; exponent chosen by ear.

## Brake drum (brake-drum)

Family bell, material metal, shape shell.

Ratios: approximation. Levels: approximation. Decays: approximation.

Approximation, designed by ear. No measured modal frequencies for brake drums were found. A thick cast-iron drum rings like a heavy, rough bell; the partial list is a plausible bell-like cluster, not data.

Sources:

- None. Search found no published modal measurements for brake drums.

## Cowbell (cowbell)

Family bell, material metal, shape shell.

Ratios: approximation. Levels: approximation. Decays: approximation.

Approximation, designed by ear. Cowbells are described as having inharmonic spectra, but no measured partial list was found, so these ratios are a plausible cluster and not data. Short decay for a pressed steel box.

Sources:

- None. The qualitative description of cowbell spectra is from the Papador PAS article on spectral composition and percussion, seen as a search excerpt; it gives no numbers.

## Waterphone (waterphone)

Family glass, material metal, shape bar.

Ratios: approximation. Levels: approximation. Decays: approximation.

Approximation, designed by ear. A waterphone has a ring of tuned rods of different lengths on a bowl that holds water, and the water and the bowing bend the pitches. No modal data was found, so the pitches here are a cluster of near-twin pairs chosen to beat, not a measurement.

Sources:

- None. No published modal measurements were found.

## Bamboo slit log (slit-log)

Family wood, material wood, shape tube.

Ratios: approximation. Levels: approximation. Decays: approximation.

Approximation, designed by ear. A slit log couples an air cavity and two wooden tongues. No measured partial ratios were used. Short, dark and woody by design.

Sources:

- None. Ratios chosen by ear.

## Acoustic guitar body (guitar-body)

Family wood, material wood, shape box.

Ratios: published tuning. Levels: approximation. Decays: approximation.

The first three ratios are the typical body-resonance frequencies the cited sources give (air mode near 100 Hz, top plate near 190 to 200 Hz, back near 240 Hz), taken as 1, 1.9 and 2.4. Individual guitars vary widely, so the jitter is wide. Partials at 3.1 and 4.2, and all levels and decays, are approximations. Played at A4 the base lands as a high wooden knock; Tune it down for the low body tone.

Sources:

- A Proceedings of Meetings on Acoustics paper on steel-string guitar modes (hosted at goreguitars.com.au; title and authors not confirmed): T(1,1)1 near 100 Hz, T(1,1)2 near 190 Hz, T(1,1)3 near 240 Hz.
- Firth, I. M., "Physics of the guitar at the Helmholtz and first top-plate resonances", J. Acoust. Soc. Am. 61 (1977) 588: A0 about 90 Hz, T1 about 180 Hz, one guitar.
- Euphonics (euphonics.org) section 4.2.2 coupled model: 97 Hz and 200 Hz for a classical guitar.

