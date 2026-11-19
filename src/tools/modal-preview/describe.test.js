import assert from 'node:assert/strict';
import test from 'node:test';
import { carryControls, controlsFromKnobs, previewPartials } from './engine.js';
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

function profileOf(prompt) {
  const recipe = readRecipe(prompt);
  const partials = previewPartials(recipe.controls);
  return { recipe, partials, features: features(partials) };
}

function features(partials) {
  let weight = 0;
  let centroid = 0;
  let decay = 0;
  for (const partial of partials) {
    const amp = 10 ** (partial.gainDb / 20);
    const power = amp * amp;
    weight += power;
    centroid += power * partial.ratio * 440;
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

  assert.equal(chandelier.recipe.material, 'glass');
  assert.equal(chandelier.recipe.controls.voice, 'crystal');
  assert.ok(chandelier.features.longest > 2, `chandelier decay ${chandelier.features.longest}`);
  assert.ok(chandelier.features.centroid > wood.features.centroid * 1.4);
  assert.ok(chandelier.partials.length >= 12);

  assert.equal(hole.recipe.controls.voice, 'abyss');
  assert.ok(hole.features.longest > 4, `black hole decay ${hole.features.longest}`);
  assert.ok(hole.features.centroid < chandelier.features.centroid * 0.55, `centroid ${hole.features.centroid} vs ${chandelier.features.centroid}`);
  assert.ok(hole.recipe.controls.brightness < -0.6);

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
  // Related cousins (a clay pot and a ceramic bowl) may sit nearer than
  // unrelated images. Nothing in the set may collapse to a copy.
  assert.ok(closest > 0.15, `closest prompts ${pair} are only ${closest.toFixed(3)} apart`);
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

test('a huge prompt keeps its decay stretch after the knobs rebuild', () => {
  const recipe = readRecipe('huge gong');
  const carried = carryControls(recipe.controls);
  const heard = controlsFromKnobs({
    preset: recipe.controls.preset,
    stiffness: recipe.controls.stiffness,
    brightness: recipe.controls.brightness,
    damping: recipe.controls.damping,
    oddEven: recipe.controls.oddEven,
    seed: recipe.controls.seed,
  }, carried);
  assert.ok(Math.abs(heard.decayScale - 2.2) < 1e-9);
  const direct = Math.max(...previewPartials(recipe.controls).map((partial) => partial.decay));
  const rebuilt = Math.max(...previewPartials(heard).map((partial) => partial.decay));
  assert.ok(Math.abs(direct - rebuilt) < 1e-6);
  assert.ok(rebuilt > 20);
  const gong = describePrompt('gong')[0];
  const halfway = describePrompt('huge', gong)[2];
  assert.ok(halfway.controls.decayScale > 1.4 && halfway.controls.decayScale < 1.7);
});

test('a follow-up still understands the first object', () => {
  const bowl = describePrompt('glass bowl struck softly, long shimmer')[0];
  assert.equal(bowl.material, 'glass');
  assert.match(bowl.reading, /glass bowl/i);
  const darker = describePrompt('darker', bowl)[0];
  assert.equal(darker.objectName, 'Glass bowl');
  assert.equal(darker.material, 'glass');
});
