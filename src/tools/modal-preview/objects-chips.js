// Featured object chips for the Modal generator, and a helper that turns a
// loaded or rolled library object into a generator variation. No network.

import { A4_HZ, sanitizeControls } from './engine.js';
import { objectById, OBJECTS, playPitch, sourceLine } from './objects.js';
import { loadObject } from './objects-randomize.js';

// The six chips that stay visible. Unusual bodies first, as chosen for the
// generator: a bowed wooden tongue, a spring, a tine, a water-coupled rod
// instrument, a found-metal shell, and a spinning disk.
export const FEATURED_OBJECT_IDS = [
  'daxophone',
  'slinky',
  'kalimba',
  'waterphone',
  'brake-drum',
  'saw-blade',
];

const SHORT_LABEL = {
  'singing-bowl': 'Singing bowl',
  'bonang': 'Bonang',
  'steel-pan': 'Steel pan',
  'handpan': 'Handpan',
  'slinky': 'Slinky',
  'lithophone': 'Lithophone',
  'kalimba': 'Kalimba',
  'daxophone': 'Daxophone',
  'saw-blade': 'Saw blade',
  'hubcap': 'Hubcap',
  'slit-log': 'Slit log',
  'guitar-body': 'Guitar body',
};

const PRESET_FOR_SHAPE = {
  bar: 'bar',
  plate: 'plate',
  shell: 'bell',
  bowl: 'bell',
  string: 'string',
  tube: 'open-pipe',
  box: 'plate',
};

export function objectChipLabel(object) {
  if (!object) return '';
  return SHORT_LABEL[object.id] || object.name;
}

export function featuredObjects() {
  return FEATURED_OBJECT_IDS.map((id) => objectById(id)).filter(Boolean);
}

export function moreObjects() {
  const featured = new Set(FEATURED_OBJECT_IDS);
  return OBJECTS.filter((object) => !featured.has(object.id));
}

export function resolveObject(object) {
  if (!object) return null;
  return typeof object === 'string' ? objectById(object) : object;
}

export function variationFromLoaded(object, loaded) {
  const obj = resolveObject(object);
  if (!obj || !loaded?.partials?.length) return null;
  const pitch = playPitch(obj);
  const partials = loaded.partials.map((partial) => ({
    ratio: partial.ratio,
    gainDb: partial.gainDb,
    decay: partial.decay,
  }));
  const knobs = loaded.knobs || {};
  return {
    name: obj.name,
    objectName: obj.name,
    objectId: obj.id,
    material: obj.material || '',
    shape: obj.shape || '',
    size: 'medium',
    line: loaded.description || obj.name,
    reading: loaded.description || obj.name,
    source: sourceLine(obj),
    partials,
    knobs: { ...knobs },
    fundamental: pitch.hz,
    controls: sanitizeControls({
      preset: PRESET_FOR_SHAPE[obj.shape] || 'bar',
      pitchScale: pitch.hz / A4_HZ,
    }),
    exciter: 'mallet',
    hardness: 0.5,
    position: knobs.position ?? 0.02,
    detune: knobs.detune || 0,
    velocity: 0.8,
  };
}

export function loadObjectVariation(object) {
  const obj = resolveObject(object);
  if (!obj) return null;
  return variationFromLoaded(obj, loadObject(obj));
}
