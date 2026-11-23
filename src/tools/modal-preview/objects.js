// Object library for the preview page. Each entry is a real object with a
// base modal profile (ratio, gainDb, decay) and the ranges a roll may move it
// through. Pitch ratios start at 1 on the lowest mode, as everywhere else on
// this page.
//
// Provenance is stated per field in `basis`, and the full citation text for
// each entry is in `sources`. The levels (gainDb) and most decay times are
// approximations chosen by ear. Published frequency ratios are the part
// that carries the object's identity. Where a number is an approximation the
// entry says so; nothing here is a measurement of a specific instrument
// unless `basis.ratio` says "measured".
//
//   basis.ratio  'measured'          read from a published measurement table
//                'published tuning'  an interval set the cited work reports
//                'physics'           computed from a standard model (see notes)
//                'approximation'     designed by ear, not from data
//   basis.gain   always 'approximation'
//   basis.decay  'measured as printed' or 'approximation'
//
// Share links keep ratio 0.05–80, decay 0.05–30 s and gain −96–0 dB, so the
// base profiles stay inside those limits.

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
const round = (value, digits) => Number(value.toFixed(digits));

function rows(list) {
  return list.map(([ratio, gainDb, decay]) => ({
    ratio: round(ratio, 4),
    gainDb: round(clamp(gainDb, -96, 0), 2),
    decay: round(clamp(decay, 0.05, 30), 3),
  })).sort((a, b) => a.ratio - b.ratio);
}

// Level and decay rolled off with height. Used only where the entry's basis
// says the levels and decays are approximations.
function roll(ratios, { tilt = 4, first = 4, slope = 0.5, lead = 0 } = {}) {
  return ratios.map((ratio, i) => {
    const oct = Math.log2(ratio / ratios[0]);
    const gain = -tilt * oct - (i === 0 ? lead : 0);
    const decay = first / (1 + slope * (ratio - 1) ** 0.85);
    return [ratio, gain, decay];
  });
}

// Standard roots of the Euler-Bernoulli bar equations. A mode's frequency goes
// as (beta*L)^2, so the ratio to the lowest mode is (b/b1)^2.
const FREE_FREE = [4.73004, 7.85320, 10.99561, 14.13717, 17.27876, 20.42035];
const CANTILEVER = [1.87510, 4.69409, 7.85476, 10.99554, 14.13717];
const barRatios = (roots) => roots.map((b) => (b / roots[0]) ** 2);

// Inextensional ring model for the (n,0) modes of a thin round shell:
// f_n ~ n (n^2 - 1) / sqrt(n^2 + 1). Ratios are to the (2,0) mode.
const ringRatio = (n) => (n * (n * n - 1) / Math.sqrt(n * n + 1)) / (6 / Math.sqrt(5));

// Free-edge circular plate, Poisson ratio 0.33, computed numerically from the
// Kirchhoff plate equation with the free-edge conditions (see
// src/tools/modal-preview/objects-tools/disk_modes.py). Ratios to the (2,0) mode.
const DISK = [1, 1.7235, 2.3268, 3.8983, 4.0910, 6.2831, 6.6975, 7.3179, 8.8956, 10.0571, 11.3756, 11.9230];

const mutate = (extra = {}) => ({
  tune: [-3, 3],
  decay: [-0.3, 0.3],
  decayKf: [-0.2, 0.3],
  absorb: [-0.2, 0.3],
  disperse: [-0.05, 0.05],
  normalize: [-0.25, 0.25],
  position: [0.06, 0.3],
  ratioJitterCents: 6,
  gainJitterDb: 2,
  decayScale: [0.7, 1.4],
  pairSplitCents: null,
  ...extra,
});

const ONE_PAIR = [3, 14];

const bowlHz = [
  [219.6, 220.6], [609.1, 609.9], [1135.9, 1139.7], [1787.6, 1787.9],
  [2555.2, 2564.8], [3427.0, 3428.3], [4376.3, 4389.4],
];
const bowlRows = [];
bowlHz.forEach(([a, b], i) => {
  const gain = -3.5 * i;
  const decay = 14 / (1 + 0.35 * (a / 219.6 - 1) ** 0.85);
  bowlRows.push([a / 219.6, gain, decay]);
  bowlRows.push([b / 219.6, gain - 1.5, decay * 0.92]);
});

// Prime-referenced ratios from the printed table, then divided by the hum.
const BELL = [
  [0.500, -6, 52], [1.000, 0, 16], [1.183, -4, 16], [1.506, -8, 6], [2.000, -3, 3],
  [2.514, -9, 1.4], [2.662, -10, 3.6], [3.011, -12, 5], [4.166, -15, 12], [5.433, -18, 3],
  [6.796, -22, 2],
].map(([r, g, d]) => [r / 0.5, g, d]);

const ffRatios = barRatios(FREE_FREE).slice(0, 5);
const cantRatios = barRatios(CANTILEVER);
const glassRatios = [2, 3, 4, 5, 6, 7, 8].map(ringRatio);
const diskRows = (list, opts) => roll(list, opts);
const stretch = (list, power) => list.map((r) => r ** power);

export const OBJECTS = [
  {
    id: 'church-bell',
    name: 'Church bell',
    aliases: ['bell', 'carillon', 'carillon bell', 'hemony', 'hemony bell', 'minor third bell', 'tower bell'],
    family: 'bell',
    material: 'metal',
    shape: 'shell',
    tuning: 'Hum, prime, minor third, fifth and nominal at 0.5 : 1 : 1.2 : 1.5 : 2 relative to the prime',
    partials: rows(BELL),
    mutate: mutate({ tune: [-5, 5], decay: [-0.35, 0.3], disperse: [-0.03, 0.06], ratioJitterCents: 10, pairSplitCents: ONE_PAIR }),
    notes: 'A tuned minor-third church or carillon bell of the Dutch (Hemony) tradition. Ratios and decay times are the values printed for one measured bell; the hum is ratio 1 here, so the prime is an octave up. Hum decay is capped at the page limit of 30 s (printed: 52 s). Levels are approximations, and the top row of the printed table (8.215) is left out.',
    basis: { ratio: 'measured', gain: 'approximation', decay: 'measured as printed' },
    credit: 'Rossing and Perrin, 1987',
    sources: [
      'Rossing, T. D. and Perrin, R., "Vibrations of bells", Applied Acoustics (1987; volume and pages from memory, unverified), Table 5: ratios 0.500 to 6.796 and decay times for the bell in its Fig. 7. Read from a text extract of the table; the decay-time definition was not confirmed against the original.',
      'Rossing, T. D., "Acoustics of Eastern and Western bells, old and new", J. Acoust. Soc. Jpn (E) 10 (1989) 241, from its J-STAGE address: bell founders tune the lowest five modes to 1 : 2 : 2.4 : 3 : 4 relative to the hum, and the Hemony brothers led this tuning.',
      'Carvalho, Debut and Antunes, "A Review of Bell Design and Tuning Techniques from Magic to Science", ISMA 2017: first five partials at 0.5 : 1 : 1.2 : 1.5 : 2.',
    ],
  },
  {
    id: 'singing-bowl',
    name: 'Tibetan singing bowl',
    aliases: ['singing bowl', 'tibetan bowl', 'himalayan bowl', 'bowl', 'metal bowl', 'prayer bowl', 'puja bowl'],
    family: 'glass',
    material: 'metal',
    shape: 'bowl',
    tuning: 'Seven (j,0) modes, each a close pair that beats',
    partials: rows(bowlRows),
    mutate: mutate({ tune: [-6, 6], decay: [-0.2, 0.45], decayKf: [-0.2, 0.2], absorb: [-0.3, 0.15], normalize: [-0.1, 0.4], ratioJitterCents: 4, pairSplitCents: null, decayScale: [0.7, 1.6] }),
    notes: 'Each mode is two orthogonal modes a fraction of a hertz to ten hertz apart, so every partial beats. Frequencies are the two measured sets for Bowl 1 (mass 934 g, 180 mm). Levels and decays are approximations: the paper reports very low damping but the decay times here are chosen, not measured.',
    basis: { ratio: 'measured', gain: 'approximation', decay: 'approximation' },
    credit: 'Inácio and Henrique',
    sources: [
      'Inacio, O. and Henrique, L. (Instituto Politecnico do Porto), "The Dynamics of Tibetan Singing Bowls", PDF at projects.itn.pt/BellTune/File3.pdf, Table I: Bowl 1 modal frequencies A and B for (2,0) to (8,0), ratios 1, 2.8, 5.2, 8.1, 11.6, 15.6, 19.9. A journal version with Antunes exists; its volume and pages are not verified here.',
    ],
  },
  {
    id: 'wine-glass',
    name: 'Wine glass',
    aliases: ['glass', 'crystal glass', 'goblet', 'glass harmonica', 'drinking glass', 'musical glass', 'crystal'],
    family: 'glass',
    material: 'glass',
    shape: 'bowl',
    tuning: 'Flexural (n,0) modes of a thin round shell',
    partials: rows(roll(glassRatios, { tilt: 3.2, first: 7, slope: 0.3 })),
    mutate: mutate({ tune: [-5, 5], decay: [-0.2, 0.4], decayKf: [-0.3, 0.1], absorb: [-0.35, 0.1], normalize: [0, 0.45], ratioJitterCents: 5, pairSplitCents: [2, 10] }),
    notes: 'Ratios come from the inextensional ring formula f ~ n(n^2-1)/sqrt(n^2+1) for the (n,0) modes, which gives 1, 2.83, 5.42, 8.77, 12.87, matching the measured singing-bowl series (1, 2.8, 5.2, 8.1, 11.6) to a few percent. No wine glass was measured here. Levels and decays are approximations. The pair split used in rolls is an approximation of the slight asymmetry in real glass.',
    basis: { ratio: 'physics', gain: 'approximation', decay: 'approximation' },
    credit: 'Rayleigh, The Theory of Sound',
    refNote: 'B3',
    refHz: 246.941650628062,
    refReason: 'The (n,0) series would leave five rows under 6 kHz at A4.',
    sources: [
      'Thin ring bending-mode formula (Lord Rayleigh, The Theory of Sound, inextensional vibrations of a ring). Applied here as an idealization of a wine glass.',
      'Cross-check: Inacio and Henrique, singing-bowl Table I (see Tibetan singing bowl).',
    ],
  },
  {
    id: 'bonang',
    name: 'Gamelan bonang',
    aliases: ['gamelan', 'bonang', 'kettle gong', 'pot gong', 'kempul', 'javanese gamelan', 'slendro', 'pelog', 'gamelan gong'],
    family: 'bell',
    material: 'metal',
    shape: 'shell',
    tuning: 'Slendro is about five equal steps of 240 cents (measured scales run 214 to 275 cents). Pelog has seven unequal steps and varies by ensemble; no figures are included.',
    partials: rows(roll([1, 1.52, 3.46, 3.92], { tilt: 3, first: 3.2, slope: 0.12 })),
    mutate: mutate({ tune: [-7, 7], decay: [-0.3, 0.4], disperse: [-0.08, 0.1], normalize: [-0.1, 0.4], ratioJitterCents: 12, pairSplitCents: [4, 16] }),
    notes: 'The ratios are a generic bonang spectrum of four partials. Real instruments differ from one to the next, so the roll jitter is wide. Slendro and pelog are scale systems, not partial sets: use Tune or transpose in Zebra to place a bonang on a scale step. Levels and decays are approximations.',
    basis: { ratio: 'published tuning', gain: 'approximation', decay: 'approximation' },
    credit: 'Sethares, 2006',
    sources: [
      'A generic bonang spectrum of 1 : 1.52 : 3.46 : 3.92, attributed to Sethares (Tuning, Timbre, Spectrum, Scale) in the paper "The Effect of Inharmonic and Harmonic Spectra In Javanese Gamelan Tuning (1): A Theory of the Sl\u00e9ndro" (WSEAS conference, 2006). Quoted from a search summary; not checked against either source.',
      'Slendro and pelog step sizes: ranges reported in the same search summary, which also cites "Comparative acoustical and psychoacoustical analyses of gamelan instrument tones" (J. Acoust. Soc. Jpn (E) 14, no. 6) and "Puzzling Origin of Javanese Tuning Systems" (J. Acoust. Soc. Am. 35, 1963 supplement). Not read in full.',
    ],
  },
  {
    id: 'steel-pan',
    name: 'Steel pan note',
    aliases: ['steel drum', 'steelpan', 'steel pan', 'tenor pan', 'pan', 'caribbean steel drum', 'ping pong'],
    family: 'metal',
    material: 'metal',
    shape: 'plate',
    tuning: 'Fundamental, octave and twelfth tuned to about 1 : 2 : 3',
    partials: rows(roll([1, 2, 3, 4, 5, 6], { tilt: 4.5, first: 3.2, slope: 0.28 })),
    mutate: mutate({ tune: [-6, 6], decay: [-0.3, 0.3], decayKf: [0, 0.4], absorb: [-0.1, 0.3], normalize: [-0.2, 0.2], ratioJitterCents: 8, pairSplitCents: [3, 12] }),
    notes: 'The first three ratios are the tuning the published work reports for a tenor pan note (some notes tune the third mode to two octaves instead). Partials 4 to 6 and all levels and decays are approximations: measured higher partials of real notes are often not harmonic.',
    basis: { ratio: 'published tuning', gain: 'approximation', decay: 'approximation' },
    credit: 'Rossing, Hansen and Hampton, 2000',
    sources: [
      'Rossing, T. D., Hansen, U. J. and Hampton, D. S., "Vibrational mode shapes in Caribbean steelpans. I. Tenor and double second", J. Acoust. Soc. Am. 108 (2000) 803-812: tuners tune one mode an octave above the fundamental and, where possible, a third mode a twelfth or two octaves above.',
      'Stockholm Steel Band, "Steel Pan Tuning", tone-generation chapter: strong harmonic partials, with higher partials not always explained by the third mode.',
    ],
  },
  {
    id: 'handpan',
    name: 'Handpan tone field',
    aliases: ['hang', 'hang drum', 'handpan', 'tongue drum', 'hand pan', 'hank drum'],
    family: 'metal',
    material: 'metal',
    shape: 'plate',
    tuning: 'Three principal modes tuned 1 : 2 : 3',
    partials: rows(roll([1, 2, 3, 4], { tilt: 5, first: 6, slope: 0.3 })),
    mutate: mutate({ tune: [-6, 6], decay: [-0.2, 0.4], decayKf: [0, 0.35], absorb: [-0.1, 0.3], normalize: [-0.25, 0.2], ratioJitterCents: 7, pairSplitCents: [3, 12] }),
    notes: 'The three tuned modes are the published fundamental, octave and compound fifth. The fourth partial is an approximation I added so the profile has four rows, and all levels and decays are approximations.',
    basis: { ratio: 'published tuning', gain: 'approximation', decay: 'approximation' },
    credit: 'PANart, 2007',
    sources: [
      'PANart, "History, Development and Tuning of the Hang" (2007), hangblog.org/panart/Paper-Hang-2007.pdf (authors not confirmed): the tone field is tuned so (0,1), (1,1)a and (1,1)b sit at 1 : 2 : 3.',
      'Physics Today, "The extraordinary sound of the hang"; Archives of Acoustics, "Modes of vibration and sound radiation from the Hang". Both seen as search excerpts only.',
    ],
  },
  {
    id: 'slinky',
    name: 'Slinky or tension spring',
    aliases: ['slinky', 'spring', 'coil spring', 'metal spring', 'laser blaster', 'pew', 'spring reverb', 'whistler', 'toy spring'],
    family: 'metal',
    material: 'metal',
    shape: 'string',
    tuning: 'Dispersive series: mode n at about n squared',
    partials: rows(roll([1, 4, 9, 16, 25, 36, 49, 64], { tilt: 3, first: 2.4, slope: 0.04 })),
    mutate: mutate({ tune: [-8, 8], decay: [-0.4, 0.2], decayKf: [-0.3, 0.2], absorb: [-0.1, 0.35], disperse: [-0.12, 0.12], normalize: [-0.1, 0.4], ratioJitterCents: 14, decayScale: [0.6, 1.5], position: [0.04, 0.2] }),
    notes: 'For the relation omega = c k^2 r, the modes of a spring of fixed length sit at k = n pi / L, so frequency goes as n squared. That gives 1, 4, 9, 16, 25. This is an idealization of a published approximate relation. A modal profile cannot reproduce the downward chirp, which is a time-domain effect; it only gives the stretched, bright ladder. Levels and decays are approximations.',
    basis: { ratio: 'physics', gain: 'approximation', decay: 'approximation' },
    credit: 'Crawford, 1990',
    refNote: 'F#2',
    refHz: 92.498605677909,
    refReason: 'The n-squared series would leave three rows under 6 kHz at A4.',
    sources: [
      'Crawford, F. S., "Slinky-whistler dispersion relation from scaling", Am. J. Phys. 58 (1990) 916-917: approximate dispersion relation omega = c k^2 r.',
      '"The Sound of a Laser Blaster: Acoustic Dispersion in Metal Springs Analyzed with Mobile Devices and Open-Source PC Audio Software", The Physics Teacher 60 (issue 1), p. 28. Describes the high-to-low chirp and quotes Crawford.',
    ],
  },
  {
    id: 'lithophone',
    name: 'Granite or slate lithophone bar',
    aliases: ['lithophone', 'stone bar', 'granite', 'slate', 'stone chime', 'rock xylophone', 'stone', 'marble bar'],
    family: 'wood',
    material: 'stone',
    shape: 'bar',
    tuning: 'Free-free bar modes: 1, 2.76, 5.40, 8.93, 13.34',
    partials: rows(roll(ffRatios, { tilt: 5.5, first: 1.1, slope: 0.12 })),
    mutate: mutate({ tune: [-6, 6], decay: [-0.45, 0.25], decayKf: [0.1, 0.5], absorb: [0.05, 0.45], normalize: [-0.1, 0.35], ratioJitterCents: 14, decayScale: [0.6, 1.3] }),
    notes: 'The ratios are the exact free-free uniform-bar series. A real stone bar is thick, so the upper modes sit lower than this, and tuning notches change the series; the roll jitter covers some of that. Levels and decays are approximations, with a short decay chosen for stone.',
    basis: { ratio: 'physics', gain: 'approximation', decay: 'approximation' },
    credit: 'Fletcher and Rossing, The Physics of Musical Instruments',
    sources: [
      'Euler-Bernoulli free-free bar: roots of cos(bL) cosh(bL) = 1 at bL = 4.730, 7.853, 10.996, 14.137, 17.279 (standard result; see Fletcher and Rossing, The Physics of Musical Instruments, chapter on bars). Computed here; not copied from a table.',
    ],
  },
  {
    id: 'kalimba',
    name: 'Kalimba with imperfect tines',
    aliases: ['thumb piano', 'mbira', 'kalimba', 'likembe', 'sansa', 'fork tine', 'bottle cap kalimba', 'tine'],
    family: 'metal',
    material: 'metal',
    shape: 'bar',
    tuning: 'Clamped-free bar modes: 1, 6.27, 17.55, 34.39, 56.84',
    partials: rows(roll(cantRatios, { tilt: 5, first: 2.4, slope: 0.03 }).map(([r, g, d], i) => [r, g, d * (i === 0 ? 1 : 0.55 ** i)])),
    mutate: mutate({ tune: [-7, 7], decay: [-0.35, 0.25], decayKf: [0.15, 0.55], absorb: [0, 0.4], disperse: [-0.04, 0.04], normalize: [-0.2, 0.2], ratioJitterCents: 35, gainJitterDb: 4, decayScale: [0.6, 1.4] }),
    notes: 'The ratios are the exact clamped-free (cantilever) series, which is far from harmonic, so the second partial is more than two octaves up. Real kalimba tines are held on a bridge and shaped, so their upper partials differ; the "imperfect" part is a wide ratio and level jitter in the roll range, an approximation and not a measurement. Levels and decays are approximations.',
    basis: { ratio: 'physics', gain: 'approximation', decay: 'approximation' },
    credit: 'Fletcher and Rossing, The Physics of Musical Instruments',
    refNote: 'G#2',
    refHz: 103.826174394986,
    refReason: 'The cantilever series would leave only two rows under 6 kHz at A4.',
    sources: [
      'Euler-Bernoulli clamped-free bar: roots of cos(bL) cosh(bL) = -1 at bL = 1.875, 4.694, 7.855, 10.996, 14.137 (standard result; see Fletcher and Rossing, The Physics of Musical Instruments). Computed here.',
    ],
  },
  {
    id: 'daxophone',
    name: 'Daxophone tongue',
    aliases: ['daxophone', 'bowed wood', 'wood tongue', 'hans reichel', 'bowed tongue', 'dax'],
    family: 'wood',
    material: 'wood',
    shape: 'bar',
    tuning: 'Clamped-free bar modes, with a free length that can be changed by hand',
    partials: rows(roll(cantRatios, { tilt: 3.5, first: 3.5, slope: 0.015 }).map(([r, g, d]) => [r, g, d])),
    mutate: mutate({ tune: [-9, 9], decay: [-0.2, 0.4], decayKf: [0.1, 0.5], absorb: [0, 0.45], disperse: [-0.06, 0.08], normalize: [-0.1, 0.45], ratioJitterCents: 20, gainJitterDb: 4, decayScale: [0.7, 1.6] }),
    notes: 'The tongue is modeled as a uniform cantilever, so the ratios are the same as the kalimba tine. The real tongue is shaped and held against a fulcrum, and the voice-like quality comes from bowing and from formant-like shaping that a modal list does not capture. Levels and decays are approximations, set longer than the kalimba to suggest a bowed, sustained sound.',
    basis: { ratio: 'physics', gain: 'approximation', decay: 'approximation' },
    credit: 'Fletcher and Rossing, The Physics of Musical Instruments',
    refNote: 'G#2',
    refHz: 103.826174394986,
    refReason: 'The cantilever series would leave only two rows under 6 kHz at A4.',
    sources: [
      'Euler-Bernoulli clamped-free bar series (see Kalimba). No daxophone measurement was found; this is an idealization.',
    ],
  },
  {
    id: 'saw-blade',
    name: 'Circular saw blade',
    aliases: ['saw', 'saw blade', 'musical saw', 'circular saw', 'metal disk', 'disc', 'blade', 'plate disk'],
    family: 'metal',
    material: 'metal',
    shape: 'plate',
    tuning: 'Free-edge circular plate, mode (2,0) as the lowest',
    partials: rows(diskRows(DISK, { tilt: 2.6, first: 4.5, slope: 0.07 })),
    mutate: mutate({ tune: [-6, 6], decay: [-0.25, 0.4], decayKf: [-0.1, 0.35], absorb: [-0.15, 0.3], disperse: [-0.06, 0.1], normalize: [-0.1, 0.45], ratioJitterCents: 10, pairSplitCents: [2, 12] }),
    notes: 'Ratios were computed for a thin flat free-edge disk with Poisson ratio 0.33: (2,0), (0,1), (3,0), (1,1), (4,0), (5,0), (2,1) and so on. Teeth, the center hole and any clamp are ignored, which shifts real blades. Real disks also split each pair of nodal-diameter modes slightly, which the pair split in rolls imitates. Levels and decays are approximations.',
    basis: { ratio: 'physics', gain: 'approximation', decay: 'approximation' },
    credit: 'Leissa, 1969',
    sources: [
      'Kirchhoff thin-plate theory, free edge; see Leissa, Vibration of Plates (NASA SP-160, 1969), for the equation. The ratios are computed by the script src/tools/modal-preview/objects-tools/disk_modes.py and agree with the values I recall from Leissa, but I did not check them against the table.',
    ],
  },
  {
    id: 'cymbal',
    name: 'Cymbal',
    aliases: ['crash cymbal', 'ride cymbal', 'hi-hat', 'hihat', 'cymbals', 'china cymbal', 'splash'],
    family: 'metal',
    material: 'metal',
    shape: 'plate',
    tuning: 'Dense inharmonic cluster',
    partials: rows(roll(stretch(DISK, 1.12), { tilt: 2, first: 3, slope: 0.05 })),
    mutate: mutate({ tune: [-6, 6], decay: [-0.4, 0.3], decayKf: [-0.2, 0.3], absorb: [-0.2, 0.2], disperse: [-0.1, 0.12], normalize: [0, 0.55], ratioJitterCents: 25, gainJitterDb: 4, decayScale: [0.6, 1.5], pairSplitCents: [3, 25] }),
    notes: 'Approximation. The ratios start from the free-disk series (see Circular saw blade) and are stretched by a power of 1.12 by ear. Real cymbals have hundreds of strongly coupled modes and a shaped bell, so this is a thin outline of one. Levels and decays are approximations.',
    basis: { ratio: 'approximation', gain: 'approximation', decay: 'approximation' },
    sources: ['No measurement used. Starting series from the free-disk computation described under Circular saw blade; stretch factor chosen by ear.'],
  },
  {
    id: 'bowed-cymbal',
    name: 'Bowed cymbal',
    aliases: ['bowed cymbal', 'cymbal bow', 'bowed gong', 'bowed plate', 'bowed metal'],
    family: 'metal',
    material: 'metal',
    shape: 'plate',
    tuning: 'Cymbal cluster with long, even decays',
    partials: rows(roll(stretch(DISK, 1.09), { tilt: 1.2, first: 9, slope: 0.02 })),
    mutate: mutate({ tune: [-6, 6], decay: [0, 0.5], decayKf: [-0.3, 0.1], absorb: [-0.3, 0.1], disperse: [-0.08, 0.1], normalize: [0.05, 0.5], ratioJitterCents: 22, gainJitterDb: 4, decayScale: [0.8, 1.6], pairSplitCents: [2, 20] }),
    notes: 'Approximation. Bowing excites the same disk modes as striking, but sustains them, so the decays are long and levels fall off slowly. Ratios are the stretched disk series from the cymbal entry. Everything about levels and decays is by ear.',
    basis: { ratio: 'approximation', gain: 'approximation', decay: 'approximation' },
    sources: ['No measurement used. See Cymbal and Circular saw blade for the starting series.'],
  },
  {
    id: 'hubcap',
    name: 'Car hubcap',
    aliases: ['hubcap', 'hub cap', 'wheel cover', 'car wheel', 'car part', 'steel dish', 'dish', 'metal lid'],
    family: 'metal',
    material: 'metal',
    shape: 'plate',
    tuning: 'Shallow dish: free-disk series, compressed',
    partials: rows(roll(stretch(DISK, 0.94), { tilt: 2.8, first: 2.4, slope: 0.1 })),
    mutate: mutate({ tune: [-7, 7], decay: [-0.4, 0.2], decayKf: [0, 0.45], absorb: [0, 0.4], disperse: [-0.1, 0.1], normalize: [-0.2, 0.35], ratioJitterCents: 25, gainJitterDb: 4, decayScale: [0.5, 1.3], pairSplitCents: [4, 28] }),
    notes: 'Approximation. A hubcap is a thin shallow dome with a stiff rim, not a flat disk. The ratios start from the free-disk series and are compressed by a power of 0.94 by ear. Levels and decays are by ear, with a short decay for thin pressed steel.',
    basis: { ratio: 'approximation', gain: 'approximation', decay: 'approximation' },
    sources: ['No measurement used. Starting series from the free-disk computation under Circular saw blade; exponent chosen by ear.'],
  },
  {
    id: 'brake-drum',
    name: 'Brake drum',
    aliases: ['brake drum', 'car brake', 'drum brake', 'junk metal', 'found metal', 'metal drum', 'scrap metal'],
    family: 'bell',
    material: 'metal',
    shape: 'shell',
    tuning: 'Bell-like, unpitched-leaning',
    partials: rows(roll([1, 1.6, 2.4, 3.9, 5.2, 7.1], { tilt: 2.6, first: 6, slope: 0.1 })),
    mutate: mutate({ tune: [-7, 7], decay: [-0.3, 0.35], decayKf: [-0.1, 0.35], absorb: [-0.1, 0.3], disperse: [-0.08, 0.1], normalize: [-0.1, 0.4], ratioJitterCents: 20, gainJitterDb: 3, decayScale: [0.6, 1.4], pairSplitCents: [3, 20] }),
    notes: 'Approximation, designed by ear. No measured modal frequencies for brake drums were found. A thick cast-iron drum rings like a heavy, rough bell; the partial list is a plausible bell-like cluster, not data.',
    basis: { ratio: 'approximation', gain: 'approximation', decay: 'approximation' },
    sources: ['None. Search found no published modal measurements for brake drums.'],
  },
  {
    id: 'cowbell',
    name: 'Cowbell',
    aliases: ['cowbell', 'cow bell', 'agogo', 'bell block', 'clank', 'farm bell'],
    family: 'bell',
    material: 'metal',
    shape: 'shell',
    tuning: 'Two main tones plus inharmonic partials',
    partials: rows(roll([1, 1.52, 2.28, 3.1, 4.4, 5.9], { tilt: 3.2, first: 1.6, slope: 0.25 })),
    mutate: mutate({ tune: [-6, 6], decay: [-0.4, 0.2], decayKf: [0.05, 0.5], absorb: [0, 0.35], disperse: [-0.08, 0.1], normalize: [-0.1, 0.35], ratioJitterCents: 25, gainJitterDb: 3, decayScale: [0.5, 1.3], pairSplitCents: [3, 20] }),
    notes: 'Approximation, designed by ear. Cowbells are described as having inharmonic spectra, but no measured partial list was found, so these ratios are a plausible cluster and not data. Short decay for a pressed steel box.',
    basis: { ratio: 'approximation', gain: 'approximation', decay: 'approximation' },
    sources: ['None. The qualitative description of cowbell spectra is from the Papador PAS article on spectral composition and percussion, seen as a search excerpt; it gives no numbers.'],
  },
  {
    id: 'waterphone',
    name: 'Waterphone',
    aliases: ['waterphone', 'water phone', 'bowed rods', 'rod cluster', 'horror instrument', 'eerie rods'],
    family: 'glass',
    material: 'metal',
    shape: 'bar',
    tuning: 'Clustered rod pitches that beat against each other',
    partials: rows([
      [1, 0, 8], [1.0070, -1, 7.4], [1.1225, -3, 7], [1.1310, -4, 6.6], [1.3348, -5, 6.4], [1.3430, -6, 6],
      [1.5874, -7, 5.4], [1.5990, -8, 5], [1.9, -10, 4], [2.38, -12, 3.2], [3.1, -15, 2.4],
    ]),
    mutate: mutate({ tune: [-8, 8], decay: [-0.2, 0.45], decayKf: [-0.2, 0.2], absorb: [-0.3, 0.15], disperse: [-0.06, 0.1], normalize: [0, 0.4], ratioJitterCents: 15, gainJitterDb: 3, decayScale: [0.7, 1.6], pairSplitCents: [4, 30] }),
    notes: 'Approximation, designed by ear. A waterphone has a ring of tuned rods of different lengths on a bowl that holds water, and the water and the bowing bend the pitches. No modal data was found, so the pitches here are a cluster of near-twin pairs chosen to beat, not a measurement.',
    basis: { ratio: 'approximation', gain: 'approximation', decay: 'approximation' },
    sources: ['None. No published modal measurements were found.'],
  },
  {
    id: 'slit-log',
    name: 'Bamboo slit log',
    aliases: ['slit drum', 'slit log', 'log drum', 'bamboo', 'bamboo tube', 'bamboo drum', 'wood block', 'tongue log', 'kulintang log'],
    family: 'wood',
    material: 'wood',
    shape: 'tube',
    tuning: 'Low air resonance plus two bar-like modes',
    partials: rows(roll([1, 2.2, 3.5, 5.6], { tilt: 4, first: 0.5, slope: 0.12 })),
    mutate: mutate({ tune: [-8, 8], decay: [-0.45, 0.2], decayKf: [0.2, 0.6], absorb: [0.1, 0.55], disperse: [-0.1, 0.08], normalize: [-0.45, 0], ratioJitterCents: 22, gainJitterDb: 3, decayScale: [0.5, 1.4] }),
    notes: 'Approximation, designed by ear. A slit log couples an air cavity and two wooden tongues. No measured partial ratios were used. Short, dark and woody by design.',
    basis: { ratio: 'approximation', gain: 'approximation', decay: 'approximation' },
    sources: ['None. Ratios chosen by ear.'],
  },
  {
    id: 'guitar-body',
    name: 'Acoustic guitar body',
    aliases: ['guitar', 'acoustic guitar', 'guitar body', 'classical guitar', 'guitar top', 'tap tone', 'soundboard', 'guitar box'],
    family: 'wood',
    material: 'wood',
    shape: 'box',
    tuning: 'Coupled air and top-plate resonances near 100, 190 and 240 Hz',
    partials: rows(roll([1, 1.9, 2.4, 3.1, 4.2], { tilt: 3.5, first: 0.9, slope: 0.1 })),
    mutate: mutate({ tune: [-5, 5], decay: [-0.4, 0.2], decayKf: [0.15, 0.5], absorb: [0.1, 0.5], disperse: [-0.08, 0.08], normalize: [-0.4, 0.05], ratioJitterCents: 40, gainJitterDb: 3, decayScale: [0.5, 1.3], position: [0.1, 0.4] }),
    notes: 'The first three ratios are the typical body-resonance frequencies the cited sources give (air mode near 100 Hz, top plate near 190 to 200 Hz, back near 240 Hz), taken as 1, 1.9 and 2.4. Individual guitars vary widely, so the jitter is wide. Partials at 3.1 and 4.2, and all levels and decays, are approximations. Played at A4 the base lands as a high wooden knock; Tune it down for the low body tone.',
    basis: { ratio: 'published tuning', gain: 'approximation', decay: 'approximation' },
    credit: 'Firth, 1977',
    sources: [
      'A Proceedings of Meetings on Acoustics paper on steel-string guitar modes (hosted at goreguitars.com.au; title and authors not confirmed): T(1,1)1 near 100 Hz, T(1,1)2 near 190 Hz, T(1,1)3 near 240 Hz.',
      'Firth, I. M., "Physics of the guitar at the Helmholtz and first top-plate resonances", J. Acoust. Soc. Am. 61 (1977) 588: A0 about 90 Hz, T1 about 180 Hz, one guitar.',
      'Euphonics (euphonics.org) section 4.2.2 coupled model: 97 Hz and 200 Hz for a classical guitar.',
    ],
  },
];

export const OBJECT_IDS = OBJECTS.map((object) => object.id);

export function objectById(id) {
  return OBJECTS.find((object) => object.id === id) || null;
}

// Fresh copy of an object's base profile.
export function baseProfile(object) {
  return (object?.partials || []).map((partial) => ({ ...partial }));
}

// ---- Text matching. Client side only. ----

function norm(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/[-\s]+/g, ' ').trim();
}

function distance(a, b) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = i - 1;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = keep;
    }
  }
  return prev[b.length];
}

const NAMES = OBJECTS.map((object) => ({
  object,
  phrases: [object.name, object.id.replace(/-/g, ' '), ...object.aliases].map(norm),
}));

// Free text to the nearest object. Longest phrase found in the text wins; a
// one-letter typo in a word of five letters or more still counts. Returns
// { object, phrase, kind } or null.
export function matchObjectText(text) {
  const clean = norm(text);
  if (!clean) return null;
  const padded = ` ${clean} `;
  let best = null;
  for (const row of NAMES) {
    for (const phrase of row.phrases) {
      if (!phrase) continue;
      if (padded.includes(` ${phrase} `)) {
        const score = phrase.length + (phrase === clean ? 100 : 0);
        if (!best || score > best.score) best = { object: row.object, phrase, kind: 'phrase', score };
      }
    }
  }
  if (best) return { object: best.object, phrase: best.phrase, kind: best.kind };
  const words = clean.split(' ').filter((word) => word.length >= 5);
  let near = null;
  for (const row of NAMES) {
    for (const phrase of row.phrases) {
      if (phrase.includes(' ')) continue;
      for (const word of words) {
        if (phrase.length < 5) continue;
        const gap = distance(word, phrase);
        if (gap <= 1 && (!near || phrase.length > near.phrase.length)) near = { object: row.object, phrase, kind: 'typo' };
      }
    }
  }
  return near;
}

// Typeahead: names and aliases that start with, or contain, the query.
export function searchObjects(query, limit = 8) {
  const q = norm(query);
  if (!q) return OBJECTS.slice(0, limit).map((object) => ({ object, phrase: object.name, rank: 9 }));
  const hits = [];
  for (const row of NAMES) {
    let rank = null;
    let shown = '';
    for (const phrase of row.phrases) {
      const words = phrase.split(' ');
      let r = null;
      if (phrase === q) r = 0;
      else if (phrase.startsWith(q)) r = 1;
      else if (words.some((word) => word.startsWith(q))) r = 2;
      else if (q.length >= 3 && phrase.includes(q)) r = 3;
      if (r != null && (rank == null || r < rank)) {
        rank = r;
        shown = phrase;
      }
    }
    if (rank != null) hits.push({ object: row.object, phrase: shown, rank });
  }
  if (!hits.length) {
    const found = matchObjectText(query);
    if (found) hits.push({ object: found.object, phrase: found.phrase, rank: 4 });
  }
  if (!hits.length) {
    // A phrase still being typed: match the word being typed against the start of any name word.
    const last = q.split(' ').pop();
    if (last.length >= 3) {
      for (const row of NAMES) {
        const phrase = row.phrases.find((candidate) => candidate.split(' ').some((word) => word.startsWith(last)));
        if (phrase) hits.push({ object: row.object, phrase, rank: 5 });
      }
    }
  }
  hits.sort((a, b) => a.rank - b.rank || a.object.name.localeCompare(b.object.name));
  return hits.slice(0, limit);
}

const BASIS_WORDS = {
  measured: 'measured',
  'published tuning': 'published tuning',
  physics: 'computed from physics',
  approximation: 'approximation, tuned by ear',
};

// Short source line for the object's note. Approximations say so instead of
// naming a paper. Other lines use the credit taken from sources[].
export function sourceLine(object) {
  if (object?.basis?.ratio === 'approximation') return 'Approximation, tuned by ear.';
  if (object?.credit) return `Based on: ${object.credit}.`;
  return 'Based on published sources.';
}

export function playPitch(object) {
  if (object?.refHz > 0) {
    return {
      hz: object.refHz,
      note: object.refNote || 'A4',
      reason: object.refReason || '',
    };
  }
  return { hz: 440, note: 'A4', reason: '' };
}

// Pitch that belongs to a profile that was actually loaded or rolled.
// Choosing an object in the menu does not use this.
export function profilePitch(object) {
  const pitch = playPitch(object);
  return {
    note: pitch.note,
    hz: pitch.hz,
    playReferenceHz: object?.refHz > 0 ? pitch.hz : 0,
  };
}

// After a loaded object is playing, the 6 kHz cap follows the keyboard note.
// A material profile keeps the cap at A4, so this stays 0.
export function noteReferenceHz(object, hearFundamental) {
  return object?.refHz > 0 && hearFundamental > 0 ? hearFundamental : 0;
}

// Options for zebraExport / audiblePartials. Materials omit referenceHz so
// the 6 kHz cap stays at A4.
export function exportOptions(object, extra = {}) {
  const pitch = playPitch(object);
  const options = { fundamental: pitch.hz, ...extra };
  if (object?.refHz > 0) options.referenceHz = pitch.hz;
  return options;
}

export function objectNoteText(object) {
  if (!object) return '';
  const pitch = playPitch(object);
  const decays = object.basis.decay === 'measured as printed' ? 'decays as printed' : 'decays are approximations';
  const ratios = BASIS_WORDS[object.basis.ratio] || object.basis.ratio;
  const why = pitch.reason ? ` ${pitch.reason}` : '';
  return `${object.name}: pitch ratios ${ratios}; levels are approximations; ${decays}. Played at ${pitch.note} (${Math.round(pitch.hz)} Hz).${why} ${sourceLine(object)}`;
}
