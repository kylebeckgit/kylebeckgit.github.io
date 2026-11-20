import assert from 'node:assert/strict';
import test from 'node:test';
import { flatSpec, materialFactor, solveFlatModes } from './mode-solve.js';

function maxTurn(lines) {
  let worst = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length - 1; i++) {
      const ax = line[i][0] - line[i - 1][0];
      const ay = line[i][1] - line[i - 1][1];
      const bx = line[i + 1][0] - line[i][0];
      const by = line[i + 1][1] - line[i][1];
      const la = Math.hypot(ax, ay);
      const lb = Math.hypot(bx, by);
      if (la < 1e-4 || lb < 1e-4) continue;
      const dot = (ax * bx + ay * by) / (la * lb);
      worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, dot))));
    }
  }
  return worst;
}

function lineMeetsRim(lines, kind) {
  const reachOf = (point) => (kind === 'disc'
    ? Math.hypot(point[0], point[1])
    : Math.max(Math.abs(point[0]), Math.abs(point[1])));
  const outward = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    if (kind === 'disc') {
      return Math.abs(dx * b[0] + dy * b[1]) / (len * Math.max(reachOf(b), 1e-6));
    }
    const nx = Math.abs(b[0]) >= Math.abs(b[1]) ? Math.sign(b[0]) : 0;
    const ny = Math.abs(b[1]) >= Math.abs(b[0]) ? Math.sign(b[1]) : 0;
    return Math.abs(dx * nx + dy * ny) / len;
  };
  return lines.some((line) => {
    if (line.length < 2) return false;
    const ends = [
      [line[0], line[1]],
      [line[line.length - 1], line[line.length - 2]],
    ];
    return ends.every(([tip, inner]) => reachOf(tip) > 0.98 && outward(inner, tip) > 0.7);
  });
}

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
  assert.ok(lineMeetsRim(solved.modes[1].lines, 'disc'), 'diameter misses the rim or hooks along it');
  assert.ok(maxTurn(solved.modes[1].lines) < 0.45, `diameter kinks by ${maxTurn(solved.modes[1].lines)}`);
});

test('a square plate separates the (2,1) mode from the fundamental', () => {
  const solved = solveFlatModes({ shape: 'square', model: 'plate', material: 'metal' });
  const ratio = solved.modes[1].lambda / solved.modes[0].lambda;
  assert.ok(Math.abs(ratio - 2.5) / 2.5 < 0.08, `ratio ${ratio}`);
  assert.ok(lineMeetsRim(solved.modes[1].lines, 'square'), 'nodal line misses the edge or runs along it');
  assert.ok(maxTurn(solved.modes[1].lines) < 0.45, `nodal line kinks by ${maxTurn(solved.modes[1].lines)}`);
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
