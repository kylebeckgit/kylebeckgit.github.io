import assert from 'node:assert/strict';
import test from 'node:test';
import { flatSpec, materialFactor, saddlePairs, solveFlatModes } from './mode-solve.js';

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

function tipDrift(line) {
  const n = line.length;
  if (n < 4) return 0;
  const dx = line[n - 1][0] - line[n - 2][0];
  const dy = line[n - 1][1] - line[n - 2][1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return 180;
  const band = [];
  for (let i = n - 2; i >= 0; i--) {
    const radius = Math.hypot(line[i][0], line[i][1]);
    if (radius < 0.62) break;
    if (radius <= 0.84) band.push(line[i]);
  }
  if (band.length < 2) return 0;
  const inner = band[band.length - 1];
  const outer = band[0];
  const bx = outer[0] - inner[0];
  const by = outer[1] - inner[1];
  const bl = Math.hypot(bx, by);
  if (bl < 1e-6) return 0;
  const dot = (dx * bx + dy * by) / (len * bl);
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
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
  for (const line of solved.modes[1].lines) assert.ok(tipDrift(line) < 8, `end curls by ${tipDrift(line)} deg`);
});

test('a square plate separates the (2,1) mode from the fundamental', () => {
  const solved = solveFlatModes({ shape: 'square', model: 'plate', material: 'metal' });
  const ratio = solved.modes[1].lambda / solved.modes[0].lambda;
  assert.ok(Math.abs(ratio - 2.5) / 2.5 < 0.08, `ratio ${ratio}`);
  assert.ok(lineMeetsRim(solved.modes[1].lines, 'square'), 'nodal line misses the edge or runs along it');
  assert.ok(maxTurn(solved.modes[1].lines) < 0.45, `nodal line kinks by ${maxTurn(solved.modes[1].lines)}`);
  assert.ok(solved.modes[0].omega > 0);
});

test('a saddle keeps the diagonal that matches the cell center', () => {
  assert.deepEqual(saddlePairs([1, -0.5, 1, -0.5]), [[0, 1], [2, 3]]);
  assert.deepEqual(saddlePairs([1, -2, 1, -2]), [[3, 0], [1, 2]]);
  assert.deepEqual(saddlePairs([-0.5, 1, -0.5, 1]), [[3, 0], [1, 2]]);
});

test('a square (2,2) mode crosses as a plus', () => {
  const solved = solveFlatModes({ shape: 'square', model: 'plate', material: 'metal' });
  const base = solved.modes[0].lambda;
  const mode = solved.modes.find((row) => Math.abs(row.lambda / base - 4) / 4 < 0.08);
  assert.ok(mode, `no (2,2) among ${solved.modes.map((row) => (row.lambda / base).toFixed(2)).join(', ')}`);
  const side = (point) => {
    if (Math.abs(point[0]) >= Math.abs(point[1]) && Math.abs(point[0]) > 0.98) return point[0] > 0 ? 'right' : 'left';
    if (Math.abs(point[1]) > 0.98) return point[1] > 0 ? 'top' : 'bottom';
    return '';
  };
  const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  const through = mode.lines.filter((line) => Math.min(...line.map(([x, y]) => Math.hypot(x, y))) < 0.2);
  assert.equal(through.length, 2);
  for (const line of through) {
    const a = side(line[0]);
    const b = side(line[line.length - 1]);
    assert.equal(opposite[a], b, `ends on ${a} and ${b}`);
  }
});

test('a stiffer material raises the plate frequency and not the nodal shape', () => {
  const wood = solveFlatModes({ shape: 'square', model: 'plate', material: 'wood' });
  const metal = solveFlatModes({ shape: 'square', model: 'plate', material: 'metal' });
  assert.ok(Math.abs(wood.modes[0].lambda - metal.modes[0].lambda) / metal.modes[0].lambda < 1e-6);
  const ratio = metal.modes[0].omega / wood.modes[0].omega;
  const expected = materialFactor('metal', 'plate') / materialFactor('wood', 'plate');
  assert.ok(Math.abs(ratio - expected) / expected < 1e-6);
});
