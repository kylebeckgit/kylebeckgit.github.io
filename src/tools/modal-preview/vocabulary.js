// Nouns and images the Describe box can name. Longer phrases win over the
// single words inside them, so "wood block" is not read as a metal plate.

function entry(phrases, fields) {
  return { role: 'object', phrases, ...fields };
}

function titled(phrase) {
  return phrase.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function expand(words, fields) {
  return words.map((word) => entry([word], { role: 'material', name: titled(word), ...fields }));
}

const woodBar = {
  material: 'wood', shape: 'bar', size: 'medium', preset: 'bar', voice: '',
  count: 8, stiffness: 0.2, brightness: -0.2, damping: 0.58, oddEven: 0,
  exciter: 'mallet', hardness: 0.6,
};
const metalPlate = {
  material: 'metal', shape: 'plate', size: 'medium', preset: 'plate', voice: '',
  count: 28, stiffness: 0.16, brightness: 0.22, damping: 0.28, oddEven: 0,
  exciter: 'mallet', hardness: 0.7,
};
const metalBell = {
  material: 'metal', shape: 'shell', size: 'medium', preset: 'bell', voice: '',
  count: 16, stiffness: 0.08, brightness: 0.05, damping: 0.22, oddEven: 0,
  exciter: 'mallet', hardness: 0.45,
};
const glassShell = {
  material: 'glass', shape: 'shell', size: 'medium', preset: 'plate', voice: 'glass',
  count: 7, stiffness: 0.02, brightness: 0.5, damping: 0.1, oddEven: 0,
  exciter: 'mallet', hardness: 0.25,
};
const skinHead = {
  material: 'skin', shape: 'membrane', size: 'medium', preset: 'membrane', voice: '',
  count: 18, stiffness: 0.08, brightness: -0.25, damping: 0.72, oddEven: 0,
  exciter: 'mallet', hardness: 0.6,
};
const stringBody = {
  material: 'string', shape: 'string', size: 'medium', preset: 'string', voice: '',
  count: 24, stiffness: 0.04, brightness: 0.05, damping: 0.4, oddEven: 0,
  exciter: 'click', hardness: 0.5,
};
const tubeBody = {
  material: 'metal', shape: 'tube', size: 'medium', preset: 'open-pipe', voice: '',
  count: 16, stiffness: 0.04, brightness: 0.18, damping: 0.22, oddEven: 0,
  exciter: 'mallet', hardness: 0.55,
};
const stoneBody = {
  material: 'stone', shape: 'bar', size: 'large', preset: 'bar', voice: '',
  count: 7, stiffness: 0.42, brightness: -0.35, damping: 0.34, oddEven: 0,
  exciter: 'mallet', hardness: 0.8,
};
const clayBody = {
  material: 'ceramic', shape: 'shell', size: 'medium', preset: 'bell', voice: 'cup',
  count: 6, stiffness: 0.06, brightness: -0.1, damping: 0.5, oddEven: 0,
  exciter: 'mallet', hardness: 0.45,
};

// Specific objects first in spirit; matching still picks the longest phrase.
const SPECIFIC = [
  entry(['wood block', 'woodblock', 'wood-block'], {
    name: 'Wood block', material: 'wood', shape: 'bar', size: 'small', preset: 'bar', voice: 'block',
    count: 5, stiffness: 0.34, brightness: 0.22, damping: 0.84, oddEven: 0,
    exciter: 'click', hardness: 0.94, traits: ['short', 'dry', 'hard click'],
  }),
  entry(['temple block', 'jam block'], {
    name: 'Temple block', material: 'wood', shape: 'bar', size: 'small', preset: 'bar', voice: 'block',
    count: 5, stiffness: 0.3, brightness: -0.18, damping: 0.8, oddEven: 0,
    exciter: 'click', hardness: 0.9, traits: ['short', 'hollow', 'hard click'],
  }),
  entry(['clave', 'claves'], {
    name: 'Clave', material: 'wood', shape: 'bar', size: 'small', preset: 'bar', voice: 'block',
    count: 4, stiffness: 0.22, brightness: -0.05, damping: 0.78, oddEven: 0,
    exciter: 'click', hardness: 0.88, traits: ['short', 'bright click'],
  }),
  entry(['log drum', 'slit drum', 'tongue drum'], {
    name: 'Log drum', material: 'wood', shape: 'cavity', size: 'medium', preset: 'bar', voice: 'block',
    count: 6, stiffness: 0.26, brightness: -0.32, damping: 0.7, oddEven: 0,
    exciter: 'mallet', hardness: 0.7, traits: ['short', 'hollow', 'dark'],
  }),
  entry(['wood bar', 'marimba', 'xylophone', 'balafon'], {
    name: 'Marimba', material: 'wood', shape: 'bar', size: 'medium', preset: 'bar', voice: 'marimba',
    count: 12, stiffness: 0.04, brightness: -0.12, damping: 0.42, oddEven: 0,
    exciter: 'mallet', hardness: 0.55,
  }),
  entry(['rosewood'], {
    name: 'Rosewood bar', material: 'wood', shape: 'bar', size: 'medium', preset: 'bar', voice: 'marimba',
    count: 12, stiffness: 0.04, brightness: -0.16, damping: 0.46, oddEven: 0,
    exciter: 'mallet', hardness: 0.52,
  }),
  entry(['vibraphone', 'glockenspiel', 'glock'], {
    name: 'Metal bar', material: 'metal', shape: 'bar', size: 'medium', preset: 'bar', voice: '',
    count: 14, stiffness: 0.06, brightness: 0.45, damping: 0.16, oddEven: 0,
    exciter: 'mallet', hardness: 0.4, traits: ['bright', 'long'],
  }),
  entry(['glass bowl', 'crystal bowl', 'singing bowl'], {
    name: 'Glass bowl', material: 'glass', shape: 'shell', size: 'medium', preset: 'plate', voice: 'glass',
    count: 7, stiffness: 0.02, brightness: 0.58, damping: 0.08, oddEven: 0,
    exciter: 'mallet', hardness: 0.25, traits: ['glassy', 'long'],
  }),
  entry(['crystal'], {
    name: 'Crystal', material: 'glass', shape: 'shell', size: 'medium', preset: 'plate', voice: 'crystal',
    count: 21, stiffness: 0.24, brightness: 0.62, damping: 0.12, oddEven: 0.12,
    exciter: 'mallet', hardness: 0.3, seed: 1, traits: ['bright', 'glassy', 'clustered'],
  }),
  entry(['chandelier', 'candelabra', 'crystal chandelier'], {
    name: 'Chandelier', material: 'glass', shape: 'shell', size: 'large', preset: 'plate', voice: 'crystal',
    count: 21, stiffness: 0.38, brightness: 0.86, damping: 0.06, oddEven: 0.22,
    exciter: 'mallet', hardness: 0.28, seed: 1, traits: ['bright', 'glassy', 'clustered', 'long', 'beating'],
  }),
  entry(['black hole', 'blackhole', 'singularity'], {
    name: 'Black hole', material: 'void', shape: 'cavity', size: 'huge', preset: 'plate', voice: 'abyss',
    count: 36, stiffness: 0.15, brightness: -0.85, damping: 0.04, oddEven: 0.1,
    exciter: 'mallet', hardness: 0.55, traits: ['very low', 'dense', 'slow beating', 'extremely long'],
  }),
  entry(['prayer bell', 'temple bell'], {
    name: 'Prayer bell', material: 'metal', shape: 'shell', size: 'small', preset: 'bell', voice: '',
    count: 64, stiffness: 0.04, brightness: 0, damping: 0.2, oddEven: 0,
    exciter: 'mallet', hardness: 0.42,
  }),
  entry(['church bell', 'tower bell', 'carillon'], {
    name: 'Church bell', material: 'metal', shape: 'shell', size: 'huge', preset: 'bell', voice: '',
    count: 20, stiffness: 0.05, brightness: -0.15, damping: 0.08, oddEven: 0,
    exciter: 'mallet', hardness: 0.7, traits: ['huge', 'long'],
  }),
  entry(['cowbell'], {
    name: 'Cowbell', material: 'metal', shape: 'shell', size: 'small', preset: 'bell', voice: 'block',
    count: 6, stiffness: 0.4, brightness: 0.15, damping: 0.62, oddEven: 0.2,
    exciter: 'click', hardness: 0.85, traits: ['short', 'clang'],
  }),
  entry(['chime', 'chimes'], {
    name: 'Chime', material: 'metal', shape: 'tube', size: 'medium', preset: 'bell', voice: '',
    count: 28, stiffness: 0.18, brightness: 0.72, damping: 0.04, oddEven: 0.08,
    exciter: 'mallet', hardness: 0.28, traits: ['bright', 'long'],
  }),
  entry(['wind chime', 'bar chime', 'mark tree', 'tubular bell', 'tubular bells', 'orchestral chime'], {
    name: 'Chime', material: 'metal', shape: 'tube', size: 'medium', preset: 'bell', voice: '',
    count: 18, stiffness: 0.12, brightness: 0.55, damping: 0.1, oddEven: 0.1,
    exciter: 'mallet', hardness: 0.3, traits: ['bright', 'long'],
  }),
  entry(['gong', 'tam-tam', 'tam tam'], {
    name: 'Gong', material: 'metal', shape: 'plate', size: 'large', preset: 'plate', voice: 'gong',
    count: 40, stiffness: 0.04, brightness: -0.35, damping: 0.05, oddEven: 0,
    exciter: 'mallet', hardness: 0.55, traits: ['dark', 'long', 'bloom'],
  }),
  entry(['cymbal', 'ride cymbal', 'crash cymbal', 'hi-hat', 'hi hat'], {
    name: 'Cymbal', material: 'metal', shape: 'plate', size: 'medium', preset: 'plate', voice: 'gong',
    count: 36, stiffness: 0.2, brightness: 0.35, damping: 0.22, oddEven: 0.15,
    exciter: 'mallet', hardness: 0.75, traits: ['bright'],
  }),
  entry(['steel plate', 'metal plate', 'stahlplatte'], {
    name: 'Metal plate', material: 'metal', shape: 'plate', size: 'large', preset: 'plate', voice: '',
    count: 48, stiffness: 0.08, brightness: 0.42, damping: 0.28, oddEven: 0,
    exciter: 'mallet', hardness: 0.72,
  }),
  entry(['gamelan', 'bonang', 'gender', 'gangsa'], {
    name: 'Gamelan', material: 'metal', shape: 'shell', size: 'medium', preset: 'bell', voice: '',
    count: 64, stiffness: 0.62, brightness: 0.12, damping: 0.3, oddEven: 0.05,
    exciter: 'mallet', hardness: 0.45,
  }),
  entry(['bonsho'], {
    name: 'Bonsho', material: 'metal', shape: 'shell', size: 'huge', preset: 'bell', voice: 'bonsho',
    count: 12, stiffness: 0, brightness: 0, damping: 0.12, oddEven: 0,
    exciter: 'mallet', hardness: 0.4, traits: ['huge', 'long'],
  }),
  entry(['log'], {
    name: 'Log', material: 'wood', shape: 'cavity', size: 'large', preset: 'bar', voice: '',
    count: 6, stiffness: 0.24, brightness: -0.3, damping: 0.55, oddEven: 0,
    exciter: 'mallet', hardness: 0.65, traits: ['hollow'],
  }),
  entry(['cajon', 'box drum'], {
    name: 'Cajon', material: 'wood', shape: 'cavity', size: 'medium', preset: 'membrane', voice: '',
    count: 10, stiffness: 0.18, brightness: -0.28, damping: 0.66, oddEven: 0,
    exciter: 'mallet', hardness: 0.72, traits: ['short', 'dry'],
  }),
  entry(['cardboard box', 'cardboard'], {
    name: 'Cardboard box', material: 'cardboard', shape: 'cavity', size: 'medium', preset: 'membrane', voice: 'block',
    count: 6, stiffness: 0.15, brightness: -0.4, damping: 0.9, oddEven: 0,
    exciter: 'mallet', hardness: 0.4, traits: ['short', 'muffled'],
  }),
  entry(['plastic bottle', 'plastic'], {
    name: 'Plastic', material: 'plastic', shape: 'shell', size: 'small', preset: 'plate', voice: '',
    count: 8, stiffness: 0.12, brightness: 0.05, damping: 0.7, oddEven: 0,
    exciter: 'mallet', hardness: 0.35, traits: ['short'],
  }),
  entry(['rubber band', 'rubber'], {
    name: 'Rubber', material: 'rubber', shape: 'string', size: 'small', preset: 'string', voice: '',
    count: 8, stiffness: 0.01, brightness: -0.4, damping: 0.82, oddEven: 0,
    exciter: 'click', hardness: 0.3, traits: ['dull', 'short'],
  }),
  entry(['wine glass', 'wineglass', 'goblet'], {
    name: 'Wine glass', material: 'glass', shape: 'shell', size: 'small', preset: 'plate', voice: 'glass',
    count: 7, stiffness: 0.04, brightness: 0.2, damping: 0.1, oddEven: 0,
    exciter: 'mallet', hardness: 0.2, traits: ['bright', 'glassy'],
  }),
  entry(['glass harmonica'], {
    name: 'Glass harmonica', material: 'glass', shape: 'shell', size: 'medium', preset: 'plate', voice: 'crystal',
    count: 21, stiffness: 0.08, brightness: 0.4, damping: 0.12, oddEven: 0,
    exciter: 'bow', hardness: 0.2, traits: ['glassy', 'long'],
  }),
  entry(['kalimba', 'mbira', 'thumb piano'], {
    name: 'Kalimba', material: 'metal', shape: 'bar', size: 'small', preset: 'bar', voice: '',
    count: 10, stiffness: 0.18, brightness: 0.15, damping: 0.48, oddEven: 0,
    exciter: 'click', hardness: 0.4,
  }),
  entry(['handpan', 'hang drum', 'tank drum'], {
    name: 'Handpan', material: 'metal', shape: 'shell', size: 'medium', preset: 'bell', voice: '',
    count: 12, stiffness: 0.22, brightness: 0.05, damping: 0.28, oddEven: 0.08,
    exciter: 'mallet', hardness: 0.4, traits: ['long'],
  }),
  entry(['waterphone'], {
    name: 'Waterphone', material: 'metal', shape: 'cavity', size: 'medium', preset: 'plate', voice: 'abyss',
    count: 24, stiffness: 0.7, brightness: -0.2, damping: 0.18, oddEven: 0.4,
    exciter: 'bow', hardness: 0.45, seed: 1, traits: ['inharmonic', 'long'],
  }),
  entry(['ice block', 'iceberg', 'glacier', 'icicle'], {
    name: 'Ice', material: 'ice', shape: 'bar', size: 'large', preset: 'bar', voice: '',
    count: 9, stiffness: 0.36, brightness: 0.35, damping: 0.22, oddEven: 0,
    exciter: 'mallet', hardness: 0.7, traits: ['bright', 'brittle'],
  }),
  entry(['frozen lake'], {
    name: 'Frozen lake', material: 'ice', shape: 'plate', size: 'huge', preset: 'plate', voice: '',
    count: 20, stiffness: 0.4, brightness: 0.1, damping: 0.2, oddEven: 0.15,
    exciter: 'mallet', hardness: 0.5, traits: ['huge', 'bright'],
  }),
  entry(['waterfall', 'ocean', 'rain'], {
    name: 'Water', material: 'water', shape: 'membrane', size: 'large', preset: 'membrane', voice: '',
    count: 16, stiffness: 0.05, brightness: -0.55, damping: 0.78, oddEven: 0,
    exciter: 'mallet', hardness: 0.3, traits: ['dark', 'muffled'],
  }),
  entry(['thunder', 'distant thunder'], {
    name: 'Thunder', material: 'air', shape: 'cavity', size: 'huge', preset: 'membrane', voice: '',
    count: 16, stiffness: 0.2, brightness: -0.7, damping: 0.42, oddEven: 0.1,
    exciter: 'mallet', hardness: 0.85, traits: ['huge', 'dark'],
  }),
  entry(['cave', 'cavern', 'canyon', 'cathedral', 'well', 'tunnel'], {
    name: 'Cavern', material: 'stone', shape: 'cavity', size: 'huge', preset: 'plate', voice: '',
    count: 18, stiffness: 0.3, brightness: -0.55, damping: 0.22, oddEven: 0.1,
    exciter: 'mallet', hardness: 0.4, traits: ['huge', 'dark', 'long'],
  }),
  entry(['music box'], {
    name: 'Music box', material: 'metal', shape: 'bar', size: 'tiny', preset: 'bell', voice: '',
    count: 12, stiffness: 0.1, brightness: 0.6, damping: 0.4, oddEven: 0,
    exciter: 'click', hardness: 0.35, traits: ['tiny', 'bright'],
  }),
  entry(['typewriter'], {
    name: 'Typewriter', material: 'metal', shape: 'bar', size: 'small', preset: 'bar', voice: 'block',
    count: 6, stiffness: 0.2, brightness: 0.1, damping: 0.86, oddEven: 0.3,
    exciter: 'click', hardness: 0.9, traits: ['short', 'hard click'],
  }),
  entry(['anvil'], {
    name: 'Anvil', material: 'metal', shape: 'bar', size: 'large', preset: 'bar', voice: '',
    count: 8, stiffness: 0.5, brightness: 0.25, damping: 0.4, oddEven: 0.25,
    exciter: 'click', hardness: 0.95, traits: ['hard click'],
  }),
  entry(['bamboo chime', 'angklung'], {
    name: 'Bamboo chime', material: 'bamboo', shape: 'tube', size: 'medium', preset: 'open-pipe', voice: '',
    count: 10, stiffness: 0.08, brightness: 0.05, damping: 0.4, oddEven: 0.1,
    exciter: 'mallet', hardness: 0.35,
  }),
  entry(['didgeridoo'], {
    name: 'Didgeridoo', material: 'wood', shape: 'tube', size: 'large', preset: 'closed-pipe', voice: '',
    count: 12, stiffness: 0.06, brightness: -0.35, damping: 0.45, oddEven: 0.7,
    exciter: 'burst', hardness: 0.4, traits: ['dark'],
  }),
  entry(['clarinet', 'closed pipe'], {
    name: 'Clarinet', material: 'wood', shape: 'tube', size: 'medium', preset: 'closed-pipe', voice: '',
    count: 16, stiffness: 0.02, brightness: -0.05, damping: 0.42, oddEven: 0.85,
    exciter: 'burst', hardness: 0.4,
  }),
  entry(['flute', 'shakuhachi', 'panpipe', 'quena', 'open pipe'], {
    name: 'Flute', material: 'air', shape: 'tube', size: 'medium', preset: 'open-pipe', voice: '',
    count: 16, stiffness: 0.02, brightness: 0.1, damping: 0.48, oddEven: 0.1,
    exciter: 'burst', hardness: 0.35,
  }),
  entry(['trash can', 'can', 'tin can', 'tin'], {
    name: 'Can', material: 'metal', shape: 'shell', size: 'small', preset: 'plate', voice: 'shell',
    count: 20, stiffness: 0.02, brightness: 0.12, damping: 0.42, oddEven: 0,
    exciter: 'mallet', hardness: 0.7,
  }),
  entry(['plate'], {
    name: 'Metal plate', material: 'metal', shape: 'plate', size: 'large', preset: 'plate', voice: '',
    count: 48, stiffness: 0.08, brightness: 0.42, damping: 0.28, oddEven: 0,
    exciter: 'mallet', hardness: 0.72,
  }),
  entry(['bowl'], {
    name: 'Bowl', material: 'glass', shape: 'shell', size: 'medium', preset: 'plate', voice: 'glass',
    count: 7, stiffness: 0.02, brightness: -0.05, damping: 0.16, oddEven: 0,
    exciter: 'mallet', hardness: 0.35,
  }),
  entry(['mug', 'teacup', 'porcelain', 'ceramic bowl'], {
    name: 'Cup', material: 'ceramic', shape: 'shell', size: 'small', preset: 'bell', voice: 'cup',
    count: 6, stiffness: 0, brightness: -0.08, damping: 0.48, oddEven: 0,
    exciter: 'mallet', hardness: 0.45,
  }),
];

const MATERIALS = [
  ...expand(['oak', 'maple', 'walnut', 'pine', 'cedar', 'birch', 'mahogany', 'ebony', 'teak', 'ash', 'spruce', 'beech', 'poplar', 'hickory', 'elm', 'fir', 'redwood', 'plywood', 'timber', 'lumber', 'plank', 'board', 'hardwood', 'softwood', 'wooden', 'wood', 'cork', 'bamboo'], woodBar),
  ...expand(['steel', 'iron', 'brass', 'bronze', 'copper', 'aluminum', 'aluminium', 'nickel', 'zinc', 'lead', 'pewter', 'chrome', 'titanium', 'alloy', 'metal', 'bell metal', 'sheet metal', 'wire', 'spring', 'coil', 'nail', 'horseshoe', 'girder', 'rod', 'rail'], metalPlate),
  ...expand(['bell', 'handbell', 'sleigh bell', 'glocke', 'cloche', 'campana', 'crotales', 'triangle', 'agogo'], metalBell),
  ...expand(['glass', 'pane', 'window', 'mirror', 'prism', 'bead', 'jar', 'bottle', 'mason jar'], glassShell),
  ...expand(['skin', 'membrane', 'hide', 'leather', 'drum', 'drumhead', 'djembe', 'conga', 'bongo', 'tabla', 'doumbek', 'bodhran', 'frame drum', 'snare', 'timpani', 'bass drum', 'tambourine', 'ocean drum'], skinHead),
  ...expand(['string', 'piano', 'guitar', 'harp', 'violin', 'viola', 'cello', 'bass', 'banjo', 'ukulele', 'sitar', 'koto', 'lute', 'zither', 'dulcimer', 'mandolin', 'nylon', 'gut', 'silk'], stringBody),
  ...expand(['tube', 'pipe', 'organ pipe', 'trombone', 'trumpet', 'horn', 'tuba', 'brass', 'wind chime'], tubeBody),
  ...expand(['stone', 'rock', 'pebble', 'granite', 'marble', 'slate', 'limestone', 'sandstone', 'concrete', 'lithophone', 'flagstone', 'cobble', 'flint', 'obsidian', 'jade'], stoneBody),
  ...expand(['ceramic', 'clay', 'terracotta', 'earthenware', 'stoneware', 'cup', 'vase', 'urn', 'tile', 'brick', 'clay pot', 'pot'], clayBody),
  ...expand(['paper', 'balloon', 'foam', 'sponge', 'eraser'], {
    material: 'paper', shape: 'membrane', size: 'small', preset: 'membrane', voice: 'block',
    count: 5, stiffness: 0.05, brightness: -0.2, damping: 0.92, oddEven: 0,
    exciter: 'mallet', hardness: 0.25, traits: ['short', 'muffled'],
  }),
  ...expand(['bone', 'shell', 'conch', 'antler', 'skull', 'gourd', 'calabash'], {
    material: 'bone', shape: 'shell', size: 'small', preset: 'bell', voice: '',
    count: 8, stiffness: 0.28, brightness: 0.05, damping: 0.4, oddEven: 0.1,
    exciter: 'mallet', hardness: 0.55,
  }),
  ...expand(['ice'], {
    material: 'ice', shape: 'plate', size: 'medium', preset: 'plate', voice: '',
    count: 10, stiffness: 0.3, brightness: 0.15, damping: 0.3, oddEven: 0,
    exciter: 'mallet', hardness: 0.45,
  }),
];

// "water" should not inherit the ice defaults from the shared expand above.
const WATER = entry(['water'], {
  role: 'material',
  name: 'Water', material: 'water', shape: 'membrane', size: 'large', preset: 'membrane', voice: '',
  count: 14, stiffness: 0.04, brightness: -0.5, damping: 0.74, oddEven: 0,
  exciter: 'mallet', hardness: 0.3, traits: ['dark', 'muffled'],
});

export const OBJECTS = [WATER, ...SPECIFIC, ...MATERIALS];

export const ADJECTIVES = [
  { test: /\btiny\b|\bminiature\b|\bminuscule\b|\bteeny\b/, label: 'tiny', size: 'tiny', damping: 0.38, brightness: 0.62, countScale: 0.4, decayScale: 0.4, pitchScale: 1.9 },
  { test: /\bhuge\b|\bvast\b|\benormous\b|\bgiant\b|\bmassive\b|\bcolossal\b/, label: 'huge', size: 'huge', damping: -0.4, brightness: -0.85, countScale: 1.6, decayScale: 2.3, pitchScale: 0.42 },
  { test: /\bbroken\b|\bcracked\b|\bshattered\b|\bsplintered\b/, label: 'broken', stiffness: 0.55, oddEven: 0.6, damping: 0.32, countScale: 0.45, seed: true },
  { test: /\bunderwater\b|\bsubmerged\b|\bdrowned\b|\bsoaked\b/, label: 'underwater', brightness: -0.75, damping: 0.48, hardness: 0.22 },
  { test: /\bfrozen\b|\bicy\b|\bfrosty\b/, label: 'frozen', brightness: 0.4, stiffness: 0.35, damping: -0.2, material: 'ice' },
  { test: /\brusty\b|\bcorroded\b|\btarnished\b/, label: 'rusty', brightness: -0.6, damping: 0.4, stiffness: 0.3, countScale: 0.6, seed: true },
  { test: /\bhollow\b/, label: 'hollow', damping: -0.32, brightness: -0.28, countScale: 0.5 },
  { test: /\bdistant\b|\bfaraway\b|\bfar away\b|\bremote\b/, label: 'distant', brightness: -0.65, damping: 0.28, velocity: 0.35, hardness: 0.22 },
  { test: /\balien\b|\botherworldly\b|\bstrange\b/, label: 'alien', stiffness: 0.6, oddEven: 0.7, brightness: 0.4, damping: -0.25, countScale: 1.7, seed: true },
];

const SCENES = [
  { test: /\bblack holes?\b|\bblackhole\b|\bsingularit/, id: 'black hole' },
  { test: /\bchandelier\b|\bcandelabra\b/, id: 'chandelier' },
];

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseTest(phrase) {
  const parts = phrase.toLowerCase().split(/[\s-]+/).map(escapeRegExp);
  return new RegExp(`\\b${parts.join('[\\s-]*')}\\b`, 'i');
}

const COMPILED = OBJECTS.map((item) => ({
  item,
  tests: item.phrases.map((phrase) => ({ phrase, test: phraseTest(phrase) })),
}));

export function matchReading(text) {
  const hits = [];
  for (const row of COMPILED) {
    for (const candidate of row.tests) {
      if (candidate.test.test(text)) hits.push({ item: row.item, phrase: candidate.phrase });
    }
  }
  hits.sort((a, b) => b.phrase.length - a.phrase.length);
  const objectHit = hits.find((hit) => hit.item.role !== 'material') || null;
  const material = hits.find((hit) => {
    if (hit.item.role !== 'material') return false;
    if (!objectHit) return true;
    return !objectHit.phrase.includes(hit.phrase);
  })?.item || null;
  return { object: objectHit?.item || null, material };
}

export function matchObject(text) {
  return matchReading(text).object || matchReading(text).material;
}

export function phraseCount() {
  return OBJECTS.reduce((sum, item) => sum + item.phrases.length, 0);
}

export function sceneId(text) {
  for (const scene of SCENES) {
    if (scene.test.test(text)) return scene.id;
  }
  return '';
}

export function hashFallback(text, hash) {
  const presets = [
    ['bar', 'wood', 'bar'],
    ['plate', 'metal', 'plate'],
    ['bell', 'metal', 'shell'],
    ['membrane', 'skin', 'membrane'],
    ['string', 'string', 'string'],
    ['open-pipe', 'air', 'tube'],
    ['closed-pipe', 'wood', 'tube'],
  ];
  const sizes = ['tiny', 'small', 'medium', 'large', 'huge'];
  const picked = presets[hash % presets.length];
  const size = sizes[(hash >> 3) % sizes.length];
  return {
    name: 'Unknown',
    material: picked[1],
    shape: picked[2],
    size,
    preset: picked[0],
    voice: '',
    count: 4 + ((hash >> 5) % 36),
    stiffness: ((hash >> 11) % 100) / 100,
    brightness: ((hash >> 18) % 200) / 100 - 1,
    damping: ((hash >> 9) % 100) / 100,
    oddEven: ((hash >> 15) % 200) / 100 - 1,
    exciter: hash % 2 ? 'mallet' : 'click',
    hardness: 0.25 + ((hash >> 7) % 70) / 100,
    seed: (hash % 900000) + 1,
    traits: ['unlisted'],
    fallback: true,
  };
}
