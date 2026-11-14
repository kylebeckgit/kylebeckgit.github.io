import assert from 'node:assert/strict';
import test from 'node:test';
import { previewPartials, defaultControls } from './engine.js';
import { barsStayDistinct } from './modal-view.js';
import {
  MATERIALS,
  assessQuality,
  createRollHistory,
  defaultLocks,
  descriptionAgrees,
  identityKnobs,
  pushRoll,
  redoRoll,
  rollSound,
  undoRoll,
} from './randomize.js';

const base = previewPartials(defaultControls());

function locksAll(on) {
  return {
    tune: on, detune: on, decay: on, decayKf: on, position: on, density: on, absorb: on, disperse: on, normalize: on,
  };
}

test('one thousand seeded rolls per material pass the quality check', () => {
  for (const material of MATERIALS) {
    if (material === 'wild') continue;
    for (let i = 0; i < 1000; i++) {
      const rolled = rollSound({
        base,
        current: identityKnobs(),
        material,
        amount: 1,
        locks: defaultLocks(),
        seed: i + 1,
      });
      assert.equal(rolled.quality.ok, true, `${material} ${i} ${rolled.quality.reasons.join(',')}`);
      assert.equal(rolled.knobs.tune, 0, `${material} moved locked tune`);
      assert.equal(descriptionAgrees(rolled.description, rolled.knobs, rolled.partials), true, rolled.description);
      if (rolled.knobs.decay > 0.4) assert.equal(/\bshort\b/i.test(rolled.description), false, rolled.description);
      if (rolled.knobs.decay < -0.4) assert.equal(/\blong\b/i.test(rolled.description), false, rolled.description);
    }
  }
});

test('one thousand wild rolls stay usable and the description matches', () => {
  for (let i = 0; i < 1000; i++) {
    const rolled = rollSound({
      base,
      current: identityKnobs(),
      material: 'wild',
      amount: 1,
      wildness: i % 5 === 0 ? 1 : 0.7,
      locks: defaultLocks(),
      seed: 5000 + i,
    });
    assert.equal(rolled.quality.ok, true, `wild ${i} ${rolled.quality.reasons.join(',')}`);
    assert.equal(descriptionAgrees(rolled.description, rolled.knobs, rolled.partials), true, `${rolled.description} ${JSON.stringify(rolled.knobs)}`);
  }
});

test('no roll packs the bars into one slab', () => {
  for (const material of MATERIALS) {
    for (let i = 0; i < 40; i++) {
      const rolled = rollSound({
        base,
        current: identityKnobs(),
        material,
        amount: 1,
        wildness: 1,
        locks: defaultLocks(),
        seed: 9000 + i + material.length * 100,
      });
      assert.equal(rolled.quality.reasons.includes('merged'), false, `${material} ${i} density ${rolled.knobs.density}`);
      assert.equal(barsStayDistinct(rolled.partials, rolled.knobs), true, `${material} ${rolled.knobs.density}`);
    }
  }
});

test('locks and a small amount keep the current knobs', () => {
  const current = { ...identityKnobs(), tune: 7, decay: -0.4, absorb: 0.2 };
  const locked = rollSound({
    base,
    current,
    material: 'metal',
    amount: 1,
    locks: locksAll(true),
    seed: 3,
  });
  assert.deepEqual(locked.knobs, current);
  const nudged = rollSound({
    base,
    current,
    material: 'glass',
    amount: 0,
    locks: defaultLocks(),
    seed: 9,
  });
  assert.equal(nudged.knobs.tune, 7);
  assert.ok(Math.abs(nudged.knobs.decay - current.decay) < 0.12);
  assert.equal(assessQuality(nudged.partials, nudged.knobs).ok, true);
});

test('roll history keeps the last ten and walks back and forward', () => {
  const history = createRollHistory(10);
  for (let i = 0; i < 12; i++) pushRoll(history, { i });
  assert.equal(history.past.length, 10);
  assert.equal(history.past[0].i, 2);
  const current = { i: 99 };
  const previous = undoRoll(history, current);
  assert.equal(previous.i, 11);
  assert.equal(history.future[0].i, 99);
  const forward = redoRoll(history, previous);
  assert.equal(forward.i, 99);
  assert.equal(history.past.at(-1).i, 11);
});
