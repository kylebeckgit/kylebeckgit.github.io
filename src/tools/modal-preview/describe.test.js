import assert from 'node:assert/strict';
import test from 'node:test';
import { alignReference, audiblePartials, carryControls, controlsFromKnobs, playedFundamental, previewPartials, zebraDecaySeconds, zebraExport } from './engine.js';
import { renderPreview } from './resonator.js';
import { describePrompt, readRecipe } from './recipes.js';
import { phraseCount } from './vocabulary.js';

const PROMPTS = [
  'wood block',
  'wooden plank',
  'log drum',
  'marimba',
  'glass bowl',
  'crystal',
  'chandelier',
  'bell',
  'gong',
  'plate',
  'tube',
  'chime',
  'ceramic bowl',
  'clay pot',
  'stone',
  'bamboo',
  'skin',
  'string',
  'ice',
  'water',
  'plastic bottle',
  'cardboard box',
  'black hole',
  'tiny bell',
  'huge gong',
  'broken glass',
  'underwater bell',
  'frozen lake',
  'rusty pipe',
  'hollow log',
  'distant thunder',
  'alien chime',
  'xyzzyplugh',
  'qworpf',
];

function pagePartial(prompt) {
  const recipe = readRecipe(prompt);
  const carried = carryControls(recipe.controls);
  const controls = controlsFromKnobs({
    preset: recipe.controls.preset,
    stiffness: recipe.controls.stiffness,
    brightness: recipe.controls.brightness,
    damping: recipe.controls.damping,
    oddEven: recipe.controls.oddEven,
    seed: recipe.controls.seed,
  }, carried);
  const fundamental = playedFundamental(controls.pitchScale);
  const built = previewPartials(controls);
  const heard = audiblePartials(built, { fundamental, sampleRate: 48000 });
  const exported = zebraExport(heard, { fundamental, description: prompt });
  const restored = exported.csv.trim().split('\n').slice(1).map((line) => {
    const [ratio, gainDb, decay] = line.split(';').map(Number);
    return { ratio, gainDb, decay: zebraDecaySeconds(decay, exported.knob) };
  });
  return { recipe, controls, partials: heard, restored, fundamental, features: features(heard, fundamental) };
}

function profileOf(prompt) {
  const row = pagePartial(prompt);
  return { recipe: row.recipe, partials: row.partials, features: row.features };
}

function tailLevel(partials, recipe, fundamental = 220) {
  const sampleRate = 48000;
  const samples = renderPreview(partials, {
    fundamental,
    velocity: 0.8,
    position: 0.2,
    exciter: recipe.exciter || 'mallet',
    hardness: recipe.hardness ?? 0.5,
    sampleRate,
    seconds: 2.4,
  });
  const headEnd = Math.floor(0.12 * sampleRate);
  const tailStart = Math.floor(1.1 * sampleRate);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < headEnd; i++) head += samples[i] * samples[i];
  for (let i = tailStart; i < samples.length; i++) tail += samples[i] * samples[i];
  return Math.sqrt(tail / (samples.length - tailStart)) / (Math.sqrt(head / headEnd) + 1e-12);
}

function features(partials, fundamental = 440) {
  let weight = 0;
  let centroid = 0;
  let decay = 0;
  for (const partial of partials) {
    const amp = 10 ** (partial.gainDb / 20);
    const power = amp * amp;
    weight += power;
    centroid += power * partial.ratio * fundamental;
    decay += power * partial.decay;
  }
  const longest = Math.max(...partials.map((partial) => partial.decay));
  const slope = partials.length > 1
    ? (partials[partials.length - 1].gainDb - partials[0].gainDb) / Math.log2(partials[partials.length - 1].ratio / partials[0].ratio)
    : 0;
  return {
    centroid: weight > 0 ? centroid / weight : 0,
    decay: weight > 0 ? decay / weight : 0,
    longest,
    count: partials.length,
    slope,
  };
}

function distance(a, b) {
  const left = a.features;
  const right = b.features;
  const terms = [
    (Math.log2(left.centroid) - Math.log2(right.centroid)) / 2,
    Math.log2((left.longest + 0.05) / (right.longest + 0.05)),
    (left.count - right.count) / 24,
    (left.slope - right.slope) / 12,
  ];
  return Math.hypot(...terms);
}

function halfEnergy(partials) {
  const sampleRate = 48000;
  const samples = renderPreview(partials, {
    fundamental: 220,
    velocity: 0.8,
    position: 0.2,
    exciter: 'click',
    hardness: 0.8,
    sampleRate,
    seconds: 1.6,
  });
  let total = 0;
  for (const sample of samples) total += sample * sample;
  let running = 0;
  for (let i = 0; i < samples.length; i++) {
    running += samples[i] * samples[i];
    if (running >= total * 0.5) return i / sampleRate;
  }
  return samples.length / sampleRate;
}

test('the object vocabulary covers hundreds of phrases', () => {
  assert.ok(phraseCount() >= 200, `only ${phraseCount()} phrases`);
});

test('different prompts do not collapse to one plate', () => {
  assert.ok(PROMPTS.length >= 30);
  const rows = PROMPTS.map((prompt) => ({ prompt, ...profileOf(prompt) }));
  const wood = rows.find((row) => row.prompt === 'wood block');
  const chandelier = rows.find((row) => row.prompt === 'chandelier');
  const hole = rows.find((row) => row.prompt === 'black hole');
  assert.equal(wood.recipe.material, 'wood');
  assert.equal(wood.recipe.recognized, true);
  assert.match(wood.recipe.reading, /wood block/i);
  assert.doesNotMatch(wood.recipe.reading, /metal plate/i);
  assert.equal(wood.recipe.exciter, 'click');
  assert.ok(wood.recipe.hardness > 0.8);
  assert.ok(wood.partials.length <= 8, `wood block partials ${wood.partials.length}`);
  assert.ok(wood.features.longest <= 0.3 && wood.features.longest >= 0.05, `wood block decay ${wood.features.longest}`);
  assert.ok(wood.partials.every((partial) => partial.decay <= 0.3 && partial.decay >= 0.05));
  assert.ok(wood.partials[wood.partials.length - 1].decay < wood.partials[0].decay);
  const spelled = profileOf('woodblock');
  assert.equal(spelled.recipe.material, 'wood');
  assert.ok(spelled.features.longest <= 0.3);
  assert.ok(distance(wood, spelled) < 0.05);

  const glass = rows.find((row) => row.prompt === 'glass bowl');
  const crystal = rows.find((row) => row.prompt === 'crystal');
  const gong = rows.find((row) => row.prompt === 'gong');
  const plate = rows.find((row) => row.prompt === 'plate');
  const broken = rows.find((row) => row.prompt === 'broken glass');
  const bell = rows.find((row) => row.prompt === 'bell');
  const tiny = rows.find((row) => row.prompt === 'tiny bell');
  const huge = rows.find((row) => row.prompt === 'huge gong');
  assert.ok(glass.features.centroid > 1800, `glass bowl centroid ${glass.features.centroid}`);
  assert.ok(crystal.features.centroid > 1800, `crystal centroid ${crystal.features.centroid}`);
  assert.ok(wood.features.centroid > 550 && wood.features.centroid < 1600, `wood centroid ${wood.features.centroid}`);
  assert.ok(wood.features.centroid < glass.features.centroid);
  assert.ok(gong.features.centroid < plate.features.centroid, `gong ${gong.features.centroid} plate ${plate.features.centroid}`);
  assert.ok(gong.features.longest > 8 && gong.features.longest > plate.features.longest);
  assert.ok(broken.features.centroid > 1800, `broken glass centroid ${broken.features.centroid}`);
  assert.ok(broken.features.longest < 0.8, `broken glass decay ${broken.features.longest}`);
  assert.ok(broken.partials.length >= 8);
  assert.equal(chandelier.recipe.material, 'glass');
  assert.equal(chandelier.recipe.controls.voice, 'crystal');
  assert.ok(chandelier.features.longest > 2, `chandelier decay ${chandelier.features.longest}`);
  assert.ok(chandelier.features.centroid > wood.features.centroid * 1.4);
  assert.ok(chandelier.partials.length >= 12);

  assert.equal(hole.recipe.controls.voice, 'abyss');
  assert.ok(hole.features.longest > 12, `black hole decay ${hole.features.longest}`);
  assert.ok(hole.features.centroid < 320, `black hole centroid ${hole.features.centroid}`);
  assert.ok(hole.features.centroid < wood.features.centroid * 0.5);
  assert.ok(hole.partials.length >= 24);
  assert.ok(tiny.features.centroid > bell.features.centroid, `tiny ${tiny.features.centroid} bell ${bell.features.centroid}`);
  assert.ok(tiny.features.longest < bell.features.longest * 0.5);
  assert.ok(huge.features.centroid < gong.features.centroid, `huge ${huge.features.centroid} gong ${gong.features.centroid}`);
  assert.ok(huge.features.longest > gong.features.longest * 1.5);

  let closest = Infinity;
  let pair = '';
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const gap = distance(rows[i], rows[j]);
      if (gap < closest) {
        closest = gap;
        pair = `${rows[i].prompt} / ${rows[j].prompt}`;
      }
    }
  }
  // Cousins can sit near each other. A copy, the old metal-plate collapse, is 0.
  assert.ok(closest > 0.08, `closest prompts ${pair} are only ${closest.toFixed(3)} apart`);
  const contrast = ['wood block', 'chandelier', 'black hole', 'string', 'gong', 'bell', 'water', 'plate'];
  for (let i = 0; i < contrast.length; i++) {
    for (let j = i + 1; j < contrast.length; j++) {
      const left = rows.find((row) => row.prompt === contrast[i]);
      const right = rows.find((row) => row.prompt === contrast[j]);
      const gap = distance(left, right);
      assert.ok(gap > 0.3, `${contrast[i]} / ${contrast[j]} are only ${gap.toFixed(3)} apart`);
    }
  }

  const heard = {
    'wood block': halfEnergy(wood.partials),
    chandelier: halfEnergy(chandelier.partials),
    'black hole': halfEnergy(hole.partials),
  };
  assert.ok(heard['wood block'] < 0.2, `wood block half-energy ${heard['wood block']}`);
  assert.ok(heard.chandelier > heard['wood block'] * 3);
  assert.ok(heard['black hole'] > heard.chandelier);

  for (const row of rows) {
    const feature = row.features;
    console.log(`${row.prompt}\t${row.recipe.material}\t${row.recipe.shape}\t${feature.longest.toFixed(3)}\t${feature.centroid.toFixed(0)}\t${feature.count}`);
  }
  console.log(`closest ${pair} ${closest.toFixed(3)}`);
  console.log(`half-energy wood ${heard['wood block'].toFixed(3)} chandelier ${heard.chandelier.toFixed(3)} black hole ${heard['black hole'].toFixed(3)}`);
});

test('tiny, gong, and huge gong differ in the rendered audio and the export', () => {
  const tiny = pagePartial('tiny bell');
  const gong = pagePartial('gong');
  const huge = pagePartial('huge gong');
  assert.ok(Math.abs(tiny.controls.decayScale - 0.4) < 1e-9);
  assert.ok(Math.abs(huge.controls.decayScale - 2.3) < 1e-9);
  assert.ok(Math.abs(tiny.controls.pitchScale - 1.9) < 1e-9);
  assert.ok(Math.abs(huge.controls.pitchScale - 0.42) < 1e-9);
  assert.ok(tiny.partials.some((partial) => Math.abs(partial.ratio - 1) < 0.04));
  assert.notEqual(readRecipe('waterphone').controls.voice, 'abyss');
  const tails = {
    tiny: tailLevel(tiny.partials, tiny.recipe, tiny.fundamental),
    gong: tailLevel(gong.partials, gong.recipe, gong.fundamental),
    huge: tailLevel(huge.partials, huge.recipe, huge.fundamental),
  };
  assert.ok(tails.tiny < tails.gong * 0.25, `tiny tail ${tails.tiny} gong ${tails.gong}`);
  assert.ok(tails.huge > tails.gong * 1.3, `huge tail ${tails.huge} gong ${tails.gong}`);
  const exported = {
    tiny: Math.max(...tiny.restored.map((row) => row.decay)),
    gong: Math.max(...gong.restored.map((row) => row.decay)),
    huge: Math.max(...huge.restored.map((row) => row.decay)),
  };
  assert.ok(exported.tiny < exported.gong * 0.5, `export tiny ${exported.tiny}`);
  assert.ok(exported.huge > exported.gong * 1.5, `export huge ${exported.huge}`);
  assert.ok(tiny.features.centroid > gong.features.centroid);
  assert.ok(huge.features.centroid < gong.features.centroid);
  const halfway = describePrompt('huge', describePrompt('gong')[0])[2];
  assert.ok(halfway.controls.decayScale > 1.4 && halfway.controls.decayScale < 1.8);
  assert.ok(halfway.controls.pitchScale > 0.6 && halfway.controls.pitchScale < 0.9);
});

test('rebuilding from fresh ratios does not walk the pitch', () => {
  const controls = controlsFromKnobs({
    preset: 'bell',
    stiffness: 0.4,
    brightness: 0.2,
    damping: 0.3,
    oddEven: 0,
    seed: 17,
  }, carryControls({ ...readRecipe('tiny bell').controls, stiffness: 0.4, seed: 17 }));
  const base = playedFundamental(controls.pitchScale, 261.63);
  const once = alignReference(previewPartials(controls), base);
  const twice = alignReference(previewPartials(controls), base);
  assert.ok(Math.abs(once.fundamental - twice.fundamental) < 1e-6);
  assert.ok(once.fundamental > base * 0.97 && once.fundamental < base * 1.04);
  const body = once.partials.reduce((best, partial) => (
    Math.abs(Math.log(partial.ratio)) < Math.abs(Math.log(best.ratio)) ? partial : best
  ));
  assert.ok(Math.abs(body.ratio - 1) < 1e-6);
  assert.ok(Math.abs(playedFundamental(controls.pitchScale, 261.63) / 261.63 - 1.9) < 1e-9);
});

test('a follow-up still understands the first object', () => {
  const bowl = describePrompt('glass bowl struck softly, long shimmer')[0];
  assert.equal(bowl.material, 'glass');
  assert.match(bowl.reading, /glass bowl/i);
  const darker = describePrompt('darker', bowl)[0];
  assert.equal(darker.objectName, 'Glass bowl');
  assert.equal(darker.material, 'glass');
});
