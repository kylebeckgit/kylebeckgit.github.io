import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCENT,
  accentTint,
  bodyFamily,
  materialFinish,
  materialKey,
  mixHex,
  modeDisplacement,
  modeEnvelope,
  modeSamples,
  modeShape,
  objectUnit,
  shownModes,
} from './object-view.js';

test('each body maps to its textbook family', () => {
  assert.equal(bodyFamily({ preset: 'bar', shape: 'bar' }), 'bar');
  assert.equal(bodyFamily({ preset: 'string', shape: 'string' }), 'string');
  assert.equal(bodyFamily({ preset: 'membrane', shape: 'membrane' }), 'membrane');
  assert.equal(bodyFamily({ preset: 'plate', shape: 'plate' }), 'plate');
  assert.equal(bodyFamily({ preset: 'bell', shape: 'shell' }), 'shell');
  assert.equal(bodyFamily({ preset: 'plate', shape: 'shell', voice: 'glass' }), 'shell');
  assert.equal(bodyFamily({ preset: 'membrane', shape: 'shell', material: 'water', voice: 'block' }), 'shell');
  assert.equal(bodyFamily({ preset: 'open-pipe', shape: 'tube' }), 'tube');
  assert.equal(bodyFamily({ preset: 'closed-pipe' }), 'tube');
  assert.equal(bodyFamily({ shape: 'cavity', preset: 'bar' }), 'box');
  assert.equal(bodyFamily({ preset: 'plate', voice: 'abyss', shape: '' }), 'plate');
  assert.equal(bodyFamily({ voice: 'rumble' }), 'shell');
  assert.equal(bodyFamily({}), 'bar');
});

test('mode shapes follow the family, with the bar counting nodes', () => {
  assert.deepEqual(modeShape('bar', 0), { family: 'bar', nodes: 1 });
  assert.deepEqual(modeShape('bar', 1), { family: 'bar', nodes: 2 });
  assert.deepEqual(modeShape('bar', 2), { family: 'bar', nodes: 3 });
  assert.equal(modeShape('string', 0).loops, 1);
  assert.equal(modeShape('string', 2).loops, 3);
  assert.equal(modeShape('tube', 1).loops, 2);
  assert.equal(modeShape('plate', 0).rings, 1);
  assert.equal(modeShape('membrane', 4).rings, 2);
  assert.equal(modeShape('shell', 0).meridians, 2);
  assert.equal(modeShape('shell', 1).meridians, 3);
  const crossings = (index) => {
    const samples = modeSamples('bar', index, 49);
    let count = 0;
    for (let i = 1; i < samples.length; i++) {
      if (samples[i - 1] * samples[i] < 0) count += 1;
    }
    return count;
  };
  assert.equal(crossings(0), 1);
  assert.equal(crossings(1), 2);
  assert.equal(crossings(2), 3);
});

test('material shading prefers the named material', () => {
  assert.equal(materialKey({ material: 'glass', voice: 'gong' }), 'glass');
  assert.equal(materialKey({ voice: 'crystal' }), 'glass');
  assert.equal(materialKey({ preset: 'membrane' }), 'skin');
  assert.equal(materialKey({ material: 'void' }), 'void');
  assert.equal(materialFinish('wood'), 'grain');
  assert.equal(materialFinish('metal'), 'sheen');
  assert.equal(materialFinish('glass'), 'glass');
  assert.equal(materialFinish('stone'), 'matte');
});

test('the solo highlight is the site accent and other modes are a tint of it', () => {
  assert.equal(ACCENT, '#d4421c');
  assert.equal(accentTint(ACCENT, true), ACCENT);
  assert.equal(accentTint('#D4421C', true), ACCENT);
  const soft = accentTint(ACCENT, false, '#fbf8f2');
  assert.equal(soft, mixHex(ACCENT, '#fbf8f2', 0.38));
  assert.notEqual(soft, ACCENT);
});

test('several partials show at once, and a solo keeps only that one', () => {
  const partials = [
    { gainDb: 0, decay: 2.4 },
    { gainDb: -6, decay: 1.1 },
    { gainDb: -12, decay: 0.45 },
    { gainDb: -18, decay: 0.16 },
    { gainDb: -28, decay: 0.08 },
  ];
  const layered = shownModes(partials);
  assert.deepEqual(layered.map((mode) => mode.index), [0, 1, 2]);
  assert.equal(layered.every((mode) => mode.hot === false), true);
  const solo = shownModes(partials, { selected: 3 });
  assert.deepEqual(solo.map((mode) => mode.index), [3]);
  assert.equal(solo[0].hot, true);
});

test('a short partial fades before a long one, and the bar bends between its nodes', () => {
  const age = 0.5;
  assert.ok(modeEnvelope(age, 0.16) < modeEnvelope(age, 2.4));
  const partials = [
    { gainDb: 0, decay: 2.4 },
    { gainDb: -3, decay: 0.16 },
  ];
  const live = shownModes(partials, { age });
  assert.ok(live[1].weight < live[0].weight);
  assert.ok(Math.abs(modeDisplacement('bar', 0, 0.5)) < 1e-9);
  assert.ok(Math.abs(modeDisplacement('bar', 0, 0.25)) > 0.9);
  assert.ok(Math.abs(modeDisplacement('tube', 1, 0.5)) < 1e-9);
});

test('a huge shell or tube, with its shadow, stays inside the canvas', () => {
  const height = 400;
  const tube = objectUnit(520, height, 'tube', 'huge');
  const shell = objectUnit(520, height, 'shell', 'huge');
  assert.ok(tube * 1.2 < height / 2, 'tube shadow is clipped');
  assert.ok(shell * 1.15 < height / 2, 'shell shadow is clipped');
  assert.ok(objectUnit(520, height, 'bar', 'medium') > tube);
});
