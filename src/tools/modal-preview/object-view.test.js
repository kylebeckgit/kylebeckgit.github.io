import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACCENT,
  accentTint,
  bodyFamily,
  flaredHalf,
  materialFinish,
  materialKey,
  mixHex,
  modeDisplacement,
  modeEnvelope,
  modeSamples,
  modeShape,
  objectCaption,
  objectUnit,
  shellKind,
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
  assert.equal(modeShape('shell', 0).circles, 0);
  assert.equal(modeShape('shell', 1).meridians, 2);
  assert.equal(modeShape('shell', 1).circles, 1);
  assert.equal(modeShape('shell', 2).meridians, 3);
  assert.equal(modeShape('shell', 2).circles, 1);
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

test('a church bell widens from the shoulder to the lip without pinching', () => {
  const shoulderY = -0.06;
  const lipY = 0.68;
  const shoulder = flaredHalf(shoulderY);
  const lip = flaredHalf(lipY);
  assert.ok(flaredHalf(-0.5) < shoulder * 0.4);
  assert.ok(flaredHalf(-0.28) > flaredHalf(-0.5));
  assert.ok(flaredHalf(-0.28) < shoulder);
  let prev = shoulder;
  for (let i = 1; i <= 16; i++) {
    const y = shoulderY + ((lipY - shoulderY) * i) / 16;
    const width = flaredHalf(y);
    assert.ok(width + 1e-9 >= prev, `bell narrows at y ${y}`);
    prev = width;
  }
  const mid = flaredHalf((shoulderY + lipY) / 2);
  assert.ok(mid > shoulder);
  assert.ok(mid < (shoulder + lip) / 2);
  assert.ok(lip > shoulder * 1.6);
});

test('bells keep distinct silhouettes and modal families', () => {
  assert.equal(shellKind({ name: 'Church bell', shape: 'shell' }), 'flared');
  assert.equal(shellKind({ name: 'Singing bowl', shape: 'bowl' }), 'bowl');
  assert.equal(shellKind({ name: 'Cowbell', shape: 'shell' }), 'cowbell');
  assert.equal(shellKind({ name: 'Gong', shape: 'plate', voice: 'gong' }), 'disc');
  assert.equal(shellKind({ name: 'Handpan', shape: 'shell' }), 'handpan');
  assert.equal(objectCaption({ name: 'Church bell', material: 'metal', shape: 'shell' }, { selected: 2, count: 16 }), 'Metal shell, mode 3 of 16');
  assert.equal(objectCaption({ preset: 'bar' }, { selected: -1, count: 4 }), '');
});

test('each body fills most of the stage and keeps a margin', () => {
  const reach = {
    bar: { x: 1.02, y: 0.36, span: 2.02 },
    string: { x: 1.12, y: 0.82, span: 2.24 },
    plate: { x: 1.02, y: 1.06, span: 2.05 },
    membrane: { x: 1.12, y: 0.85, span: 2.1 },
    shell: { x: 0.82, y: 0.86, span: 1.62 },
    flared: { x: 0.82, y: 0.86, span: 1.62 },
    tube: { x: 0.4, y: 1.08, span: 2.14 },
    box: { x: 0.95, y: 0.85, span: 1.9 },
    cowbell: { x: 0.53, y: 0.67, span: 1.27 },
    handpan: { x: 0.77, y: 0.36, span: 1.53 },
    disc: { x: 0.93, y: 1.07, span: 1.9 },
  };
  const stages = [
    { width: 640, height: 516 },
    { width: 350, height: 282 },
  ];
  for (const stage of stages) {
    const limit = Math.min(stage.width, stage.height);
    for (const [family, box] of Object.entries(reach)) {
      for (const size of ['tiny', 'huge']) {
        const unit = objectUnit(stage.width, stage.height, family, size);
        const span = (box.span || 2 * Math.max(box.x, box.y)) * unit;
        assert.ok(span <= limit * 0.86, `${family} ${size} overflows on ${stage.width}`);
        assert.ok(span + 1 >= limit * 0.74, `${family} ${size} is small on ${stage.width}`);
        assert.ok(box.x * unit <= stage.width * 0.46 + 0.01, `${family} clips across ${stage.width}`);
        assert.ok(box.y * unit <= stage.height * 0.46 + 0.01, `${family} clips down ${stage.width}`);
      }
    }
  }
});
