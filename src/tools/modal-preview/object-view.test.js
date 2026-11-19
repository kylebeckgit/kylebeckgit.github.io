import assert from 'node:assert/strict';
import test from 'node:test';
import { bodyFamily, materialKey, modeSamples, modeShape } from './object-view.js';

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
});
