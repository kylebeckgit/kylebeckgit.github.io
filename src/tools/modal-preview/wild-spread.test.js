import assert from 'node:assert/strict';
import test from 'node:test';
import { dressVariations, promptSpaceSize, rollGenerator, createGeneratorSession, currentSnapshot } from './generator.js';
import { describePrompt, readRecipe } from './recipes.js';
import { assessQuality } from './randomize.js';

// Spread of the previous prompt list, 500 rolls, seeds i * 17 + 3.
// Wildness 0 and 0.5 were the same 16 calm words, because the old cutoff was 0.66.
const BEFORE = {
  0: { distinct: 16, centroid: 1931, t60: 10.71, inharm: 1.05 },
  0.5: { distinct: 16, centroid: 1931, t60: 10.71, inharm: 1.05 },
  1: { distinct: 122, centroid: 2889, t60: 16.58, inharm: 1.19 },
};

function span(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
  return at(0.9) - at(0.1);
}

function inharmonicity(partials) {
  const list = [...partials].sort((a, b) => a.ratio - b.ratio);
  if (list.length < 2 || !(list[0].ratio > 0)) return 0;
  let sum = 0;
  for (let i = 1; i < list.length; i++) {
    sum += Math.abs(Math.log2(list[i].ratio / (list[0].ratio * (i + 1))));
  }
  return sum / (list.length - 1);
}

function centroidHz(partials, fundamental) {
  let weight = 0;
  let sum = 0;
  for (const partial of partials) {
    const power = 10 ** (partial.gainDb / 10);
    weight += power;
    sum += power * partial.ratio * fundamental;
  }
  return weight > 0 ? sum / weight : 0;
}

function sample(wildness, count = 520) {
  const prompts = new Set();
  const centroids = [];
  const t60s = [];
  const inharms = [];
  let fallback = 0;
  let failed = 0;
  for (let i = 1; i <= count; i++) {
    const session = createGeneratorSession();
    const rolled = rollGenerator(session, { wildness, seed: i * 17 + 3 });
    prompts.add(rolled.prompt);
    if (readRecipe(rolled.prompt).fallback) fallback += 1;
    for (const variation of session.turn.variations) {
      if (wildness < 1 || !variation.partials) continue;
      const quality = assessQuality(variation.partials, {
        detune: variation.detune || 0,
        density: variation.partials.length,
        position: variation.position || 0.18,
      });
      if (!quality.ok) failed += 1;
    }
    const snap = currentSnapshot(session);
    centroids.push(centroidHz(snap.partials, snap.fundamental));
    t60s.push(Math.max(...snap.partials.map((partial) => partial.decay)));
    inharms.push(inharmonicity(snap.partials));
  }
  return {
    distinct: prompts.size,
    fallback,
    failed,
    centroid: span(centroids),
    t60: span(t60s),
    inharm: span(inharms),
  };
}

test('high wildness has thousands of real prompts and a much wider body', () => {
  const space = promptSpaceSize();
  assert.ok(space.high >= 2000, `high wildness only composes ${space.high} prompts`);
  assert.ok(space.mid > space.everyday * 4, `mid wildness only composes ${space.mid} prompts`);

  const low = sample(0);
  const mid = sample(0.5);
  const high = sample(1);
  console.log('wildness\tdistinct\tcentroid span\tT60 span\tinharm span');
  console.log(`0\t${low.distinct}\t${low.centroid.toFixed(1)}\t${low.t60.toFixed(2)}\t${low.inharm.toFixed(2)}`);
  console.log(`0.5\t${mid.distinct}\t${mid.centroid.toFixed(1)}\t${mid.t60.toFixed(2)}\t${mid.inharm.toFixed(2)}`);
  console.log(`1\t${high.distinct}\t${high.centroid.toFixed(1)}\t${high.t60.toFixed(2)}\t${high.inharm.toFixed(2)}`);

  assert.equal(low.fallback, 0);
  assert.equal(mid.fallback, 0);
  assert.equal(high.fallback, 0);
  assert.equal(high.failed, 0);
  assert.ok(low.distinct < mid.distinct && mid.distinct < high.distinct, 'distinct prompts should climb with wildness');
  assert.ok(high.distinct >= 400, `wildness 1 only produced ${high.distinct} prompts`);
  assert.ok(high.distinct > BEFORE[1].distinct * 2, 'wildness 1 is not far past the old prompt list');
  assert.ok(low.centroid < mid.centroid && mid.centroid < high.centroid, 'centroid spread should climb');
  assert.ok(high.centroid > BEFORE[1].centroid * 2, `centroid span ${high.centroid.toFixed(0)} is not far past ${BEFORE[1].centroid}`);
  assert.ok(low.inharm < mid.inharm && mid.inharm < high.inharm, 'inharmonicity spread should climb');
  assert.ok(high.inharm > BEFORE[1].inharm * 1.5, `inharmonicity span ${high.inharm.toFixed(2)} is not far past ${BEFORE[1].inharm}`);
  assert.ok(high.t60 > low.t60 * 1.8 && high.t60 > BEFORE[1].t60, `T60 span ${high.t60.toFixed(2)} did not open up`);
});

test('wild rolls keep bright, dark, long, and refine', () => {
  let brighter = 0;
  let longer = 0;
  const rolls = 40;
  for (let i = 1; i <= rolls; i++) {
    const session = createGeneratorSession();
    rollGenerator(session, { wildness: 1, seed: 1000 + i });
    const [base, bright, , long] = session.turn.variations;
    assert.equal(session.turn.variations.length, 4);
    assert.match(bright.name, /^Bright /);
    assert.match(session.turn.variations[2].name, /^Dark /);
    assert.match(long.name, /^Long /);
    const hz = currentSnapshot(session).fundamental;
    if (centroidHz(bright.partials, hz) > centroidHz(base.partials, hz)) brighter += 1;
    const baseT = Math.max(...base.partials.map((partial) => partial.decay));
    const longT = Math.max(...long.partials.map((partial) => partial.decay));
    if (longT > baseT) longer += 1;
  }
  assert.ok(brighter >= rolls * 0.7, `only ${brighter} bright cards rose`);
  assert.ok(longer >= rolls * 0.7, `only ${longer} long cards rang longer`);

  const session = createGeneratorSession();
  rollGenerator(session, { wildness: 1, seed: 42 });
  const selected = session.turn.variations[0];
  const ratios = selected.partials.map((partial) => partial.ratio.toFixed(4)).join();
  const refined = dressVariations(describePrompt('brighter', selected), 99, 1, selected);
  assert.equal(refined.length, 4);
  assert.match(refined[1].name, /^Further /);
  assert.equal(refined[0].partials.map((partial) => partial.ratio.toFixed(4)).join(), ratios);
  assert.equal(refined[1].partials.map((partial) => partial.ratio.toFixed(4)).join(), ratios);
  assert.equal(refined[0].detune, selected.detune);
  assert.notEqual(
    refined[0].partials.map((partial) => partial.gainDb.toFixed(2)).join(),
    refined[1].partials.map((partial) => partial.gainDb.toFixed(2)).join(),
  );
  const dark = {
    name: 'Dark bell',
    partials: [
      { ratio: 1, gainDb: 0, decay: 6 },
      { ratio: 2.1, gainDb: -6, decay: 3 },
      { ratio: 3.3, gainDb: -9, decay: 2 },
      { ratio: 4.6, gainDb: -12, decay: 1.2 },
      { ratio: 7.4, gainDb: -36, decay: 14 },
    ],
    controls: {
      preset: 'bell', voice: '', count: 5, stiffness: 0.2, brightness: -0.4, damping: 0.4,
      oddEven: 0, seed: 1, decayScale: 1, pitchScale: 1, variationTilt: -8, variationDecay: 1, variationLift: 0,
    },
    position: 0.18,
    detune: 0,
  };
  const brightened = dressVariations(describePrompt('brighter', dark), 3, 1, dark);
  const quietHigh = brightened[0].partials.find((partial) => partial.ratio > 6);
  assert.ok(quietHigh.decay > 2, `brighter refine shortened a quiet high to ${quietHigh.decay}`);
  const snap = currentSnapshot(session);
  assert.equal(snap.detune, selected.detune);
  let moved = 0;
  for (let i = 1; i <= 30; i++) {
    const probe = createGeneratorSession();
    rollGenerator(probe, { wildness: 1, seed: 3000 + i });
    if (Math.abs(currentSnapshot(probe).detune) > 0.05) moved += 1;
  }
  assert.ok(moved >= 10, `only ${moved} wild rolls carried a detune`);
  for (const variation of refined) {
    assert.equal(readRecipe(session.turn.prompt).fallback, false);
    const quality = assessQuality(variation.partials, {
      detune: variation.detune || 0,
      density: variation.partials.length,
      position: variation.position || 0.18,
    });
    assert.equal(quality.ok, true, quality.reasons.join(','));
  }
});
