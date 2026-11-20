import assert from 'node:assert/strict';
import test from 'node:test';
import { flatSpec, materialFactor, solveFlatModes } from './mode-solve.js';

test('curved shells stay stylized and flat shapes get a solve', () => {
  assert.equal(flatSpec({ name: 'Church bell', shape: 'shell', material: 'metal' }), null);
  assert.equal(flatSpec({ name: 'Singing bowl', shape: 'bowl', material: 'metal' }), null);
  assert.equal(flatSpec({ name: 'Cowbell', shape: 'shell', material: 'metal' }), null);
  assert.equal(flatSpec({ name: 'Handpan', shape: 'shell', material: 'metal' }), null);
  assert.equal(flatSpec({ name: 'Glass tube', shape: 'tube', material: 'glass' }), null);
  assert.deepEqual(flatSpec({ name: 'Gong', shape: 'plate', material: 'metal', voice: 'gong' }), {
    shape: 'disc', model: 'plate', material: 'metal',
  });
  assert.deepEqual(flatSpec({ name: 'Metal plate', shape: 'plate', material: 'metal' }), {
    shape: 'square', model: 'plate', material: 'metal',
  });
  assert.deepEqual(flatSpec({ name: 'Drum', shape: 'membrane', material: 'skin' }), {
    shape: 'disc', model: 'membrane', material: 'skin',
  });
});

test('a circular membrane matches the first two Bessel ratios', () => {
  const solved = solveFlatModes({ shape: 'disc', model: 'membrane', material: 'skin' });
  const ratio = solved.modes[1].lambda / solved.modes[0].lambda;
  const bessel = (3.8317 / 2.4048) ** 2;
  assert.ok(Math.abs(ratio - bessel) / bessel < 0.08, `ratio ${ratio} vs ${bessel}`);
  assert.equal(solved.modes[0].lines.length, 0);
  const reach = Math.max(...solved.modes[1].lines.flat().map(([x, y]) => Math.hypot(x, y)));
  assert.ok(reach > 0.97, `diameter stops at radius ${reach}`);
});

test('a square plate separates the (2,1) mode from the fundamental', () => {
  const solved = solveFlatModes({ shape: 'square', model: 'plate', material: 'metal' });
  const ratio = solved.modes[1].lambda / solved.modes[0].lambda;
  assert.ok(Math.abs(ratio - 2.5) / 2.5 < 0.08, `ratio ${ratio}`);
  const reach = Math.max(...solved.modes[1].lines.flat().map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
  assert.ok(reach > 0.97, `nodal line stops at ${reach}`);
  assert.ok(solved.modes[0].omega > 0);
});

test('a stiffer material raises the plate frequency and not the nodal shape', () => {
  const wood = solveFlatModes({ shape: 'square', model: 'plate', material: 'wood' });
  const metal = solveFlatModes({ shape: 'square', model: 'plate', material: 'metal' });
  assert.ok(Math.abs(wood.modes[0].lambda - metal.modes[0].lambda) / metal.modes[0].lambda < 1e-6);
  const ratio = metal.modes[0].omega / wood.modes[0].omega;
  const expected = materialFactor('metal', 'plate') / materialFactor('wood', 'plate');
  assert.ok(Math.abs(ratio - expected) / expected < 1e-6);
});
