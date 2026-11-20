// Lowest 2D modes of a flat shape. A triangle mesh, linear elements, a lumped
// mass, and subspace iteration. Drums are fixed membranes. Plates and gongs
// are simply supported, so their nodal lines are the membrane lines and the
// frequencies scale with bending stiffness. The lines are a marching-squares
// contour of that field, smoothed, and clipped at the rim. Bells, bowls, and
// wine glasses use a thin shell along the drawn profile. Solved frequency
// ratios replace the partial ratios when SHAPE_SOUND is on.

import { bodyFamily, drawKind, materialKey, shellMeridian } from './object-view.js';

const MATERIALS = {
  metal: { E: 200e9, rho: 7800, nu: 0.3, h: 0.003, tension: 8000 },
  wood: { E: 12e9, rho: 600, nu: 0.3, h: 0.01, tension: 2500 },
  glass: { E: 70e9, rho: 2500, nu: 0.22, h: 0.004, tension: 6000 },
  skin: { E: 1e6, rho: 400, nu: 0.45, h: 0.001, tension: 1800 },
  stone: { E: 50e9, rho: 2600, nu: 0.25, h: 0.012, tension: 5000 },
  ceramic: { E: 60e9, rho: 2400, nu: 0.2, h: 0.006, tension: 4000 },
  plastic: { E: 3e9, rho: 1100, nu: 0.4, h: 0.003, tension: 1500 },
  cardboard: { E: 2e9, rho: 700, nu: 0.3, h: 0.002, tension: 800 },
  air: { E: 1e5, rho: 1.2, nu: 0, h: 0.001, tension: 200 },
  water: { E: 2e9, rho: 1000, nu: 0.5, h: 0.002, tension: 1000 },
  void: { E: 1e8, rho: 2000, nu: 0.3, h: 0.01, tension: 1000 },
  rubber: { E: 5e6, rho: 1100, nu: 0.49, h: 0.004, tension: 600 },
  ice: { E: 9e9, rho: 917, nu: 0.33, h: 0.008, tension: 3000 },
  string: { E: 12e9, rho: 600, nu: 0.3, h: 0.004, tension: 2000 },
};

export function flatSpec(body = {}) {
  const kind = drawKind(body);
  const family = bodyFamily(body);
  // Bells, bowls, and wine glasses are thin shells of revolution. Cowbells
  // and handpans stay drawn, because this model does not fit their outline.
  if (kind === 'flared' || kind === 'bowl' || kind === 'goblet') {
    return { shape: kind, model: 'shell', material: materialKey(body) };
  }
  if (kind === 'cowbell' || kind === 'handpan') return null;
  if (family === 'bar' || family === 'string' || family === 'tube' || family === 'box') return null;
  // A gong or cymbal is a solid disc. The raised center is only shading.
  if (kind === 'disc') return { shape: 'disc', model: 'plate', material: materialKey(body) };
  if (family === 'plate') return { shape: 'square', model: 'plate', material: materialKey(body) };
  if (family === 'membrane') return { shape: 'disc', model: 'membrane', material: materialKey(body) };
  return null;
}

export function specKey(spec) {
  if (!spec) return '';
  return `${spec.shape}|${spec.model}|${spec.material}`;
}

// Solved flat shapes can replace partial frequency ratios. Levels, decays,
// and Tune stay put. Set this false to hear the old ratios again.
export const SHAPE_SOUND = true;

export function applyShapeSound(partials, modes) {
  if (!SHAPE_SOUND || !partials?.length || !modes?.length || !(modes[0].omega > 0)) return partials;
  const fund = modes[0].omega;
  let changed = false;
  const next = partials.map((partial, index) => {
    if (index >= modes.length) return partial;
    const ratio = modes[index].omega / fund;
    if (!(ratio > 0) || Math.abs(partial.ratio - ratio) < 1e-6) return partial;
    changed = true;
    return { ...partial, ratio };
  });
  return changed ? next : partials;
}

export function patternNote(spec, phase) {
  if (!spec) return '';
  if (phase === 'ready') return 'Nodal lines and partial frequencies are solved from the shape.';
  return 'Solving the nodal pattern.';
}

function materialOf(name) {
  return MATERIALS[name] || MATERIALS.metal;
}

export function materialFactor(material, model) {
  const m = materialOf(material);
  if (model === 'membrane') return Math.sqrt(m.tension / (m.rho * m.h));
  const D = (m.E * m.h ** 3) / (12 * (1 - m.nu ** 2));
  return Math.sqrt(D / (m.rho * m.h));
}

function meshDisc(rings = 6, segs = 12) {
  const nodes = [[0, 0]];
  const boundary = new Set();
  for (let ring = 1; ring <= rings; ring++) {
    const radius = ring / rings;
    for (let step = 0; step < segs; step++) {
      const angle = (2 * Math.PI * step) / segs;
      nodes.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
      if (ring === rings) boundary.add(nodes.length - 1);
    }
  }
  const tris = [];
  for (let step = 0; step < segs; step++) tris.push([0, 1 + step, 1 + ((step + 1) % segs)]);
  for (let ring = 1; ring < rings; ring++) {
    const inner = 1 + (ring - 1) * segs;
    const outer = 1 + ring * segs;
    for (let step = 0; step < segs; step++) {
      const i0 = inner + step;
      const i1 = inner + ((step + 1) % segs);
      const o0 = outer + step;
      const o1 = outer + ((step + 1) % segs);
      tris.push([i0, o0, i1]);
      tris.push([i1, o0, o1]);
    }
  }
  return { nodes, tris, boundary, kind: 'disc', rings, segs };
}

function meshSquare(n = 12) {
  const nodes = [];
  const boundary = new Set();
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      nodes.push([-1 + (2 * i) / n, -1 + (2 * j) / n]);
      if (i === 0 || j === 0 || i === n || j === n) boundary.add(nodes.length - 1);
    }
  }
  const tris = [];
  const id = (i, j) => j * (n + 1) + i;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      tris.push([id(i, j), id(i + 1, j), id(i + 1, j + 1)]);
      tris.push([id(i, j), id(i + 1, j + 1), id(i, j + 1)]);
    }
  }
  return { nodes, tris, boundary, kind: 'square', n };
}

function assemble(mesh) {
  const index = new Map();
  const free = [];
  mesh.nodes.forEach((_, id) => {
    if (mesh.boundary.has(id)) return;
    index.set(id, free.length);
    free.push(id);
  });
  const n = free.length;
  const K = Array.from({ length: n }, () => new Map());
  const M = new Float64Array(n);
  for (const [ia, ib, ic] of mesh.tris) {
    const [x0, y0] = mesh.nodes[ia];
    const [x1, y1] = mesh.nodes[ib];
    const [x2, y2] = mesh.nodes[ic];
    const area = 0.5 * ((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
    const abs = Math.abs(area);
    if (abs < 1e-14) continue;
    const b = [y1 - y2, y2 - y0, y0 - y1];
    const c = [x2 - x1, x0 - x2, x1 - x0];
    const ids = [ia, ib, ic];
    for (let i = 0; i < 3; i++) {
      const ii = index.get(ids[i]);
      if (ii === undefined) continue;
      M[ii] += abs / 3;
      for (let j = 0; j < 3; j++) {
        const jj = index.get(ids[j]);
        if (jj === undefined) continue;
        const ke = (b[i] * b[j] + c[i] * c[j]) / (4 * abs);
        K[ii].set(jj, (K[ii].get(jj) || 0) + ke);
      }
    }
  }
  return { K, M, free };
}

function mulK(K, x, out) {
  for (let i = 0; i < x.length; i++) {
    let sum = 0;
    for (const [j, value] of K[i]) sum += value * x[j];
    out[i] = sum;
  }
}

function dot(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function dotM(a, b, M) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * M[i] * b[i];
  return sum;
}

function cg(K, b) {
  const n = b.length;
  const x = new Float64Array(n);
  const r = Float64Array.from(b);
  const p = Float64Array.from(b);
  const Ap = new Float64Array(n);
  let rs = dot(r, r);
  const target = 1e-10 * (dot(b, b) + 1e-30);
  for (let iter = 0; iter < 120; iter++) {
    if (rs < target) break;
    mulK(K, p, Ap);
    const denom = dot(p, Ap);
    if (Math.abs(denom) < 1e-20) break;
    const alpha = rs / denom;
    for (let i = 0; i < n; i++) {
      x[i] += alpha * p[i];
      r[i] -= alpha * Ap[i];
    }
    const next = dot(r, r);
    const beta = next / rs;
    for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
    rs = next;
  }
  return x;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mOrtho(vectors, M) {
  for (let i = 0; i < vectors.length; i++) {
    for (let j = 0; j < i; j++) {
      const proj = dotM(vectors[i], vectors[j], M);
      const prev = vectors[j];
      const cur = vectors[i];
      for (let k = 0; k < cur.length; k++) cur[k] -= proj * prev[k];
    }
    const norm = Math.sqrt(Math.max(dotM(vectors[i], vectors[i], M), 1e-30));
    const cur = vectors[i];
    for (let k = 0; k < cur.length; k++) cur[k] /= norm;
  }
}

function jacobi(matrix) {
  const n = matrix.length;
  const A = matrix.map((row) => Float64Array.from(row));
  const V = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) V[i][i] = 1;
  for (let sweep = 0; sweep < 48; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    }
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p][q];
        if (Math.abs(apq) < 1e-15) continue;
        const app = A[p][p];
        const aqq = A[q][q];
        const tau = (aqq - app) / (2 * apq);
        const t = Math.sign(tau || 1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        A[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
        A[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
        A[p][q] = 0;
        A[q][p] = 0;
        for (let k = 0; k < n; k++) {
          if (k === p || k === q) continue;
          const akp = A[k][p];
          const akq = A[k][q];
          const nextP = c * akp - s * akq;
          const nextQ = s * akp + c * akq;
          A[k][p] = nextP;
          A[p][k] = nextP;
          A[k][q] = nextQ;
          A[q][k] = nextQ;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p];
          const vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = [...A.keys()].sort((a, b) => A[a][a] - A[b][b]);
  return {
    values: order.map((i) => A[i][i]),
    vectors: order.map((col) => V.map((row) => row[col])),
  };
}

function subspace(K, M, count, seed) {
  const n = M.length;
  const rand = random(seed);
  let V = Array.from({ length: count }, () => Float64Array.from({ length: n }, () => rand() - 0.5));
  mOrtho(V, M);
  const apply = new Float64Array(n);
  for (let iter = 0; iter < 18; iter++) {
    const W = V.map((vector) => {
      for (let i = 0; i < n; i++) apply[i] = M[i] * vector[i];
      return cg(K, apply);
    });
    mOrtho(W, M);
    const Kg = W.map((left) => W.map((right) => {
      mulK(K, right, apply);
      return dot(left, apply);
    }));
    const eigen = jacobi(Kg);
    V = eigen.vectors.map((column) => {
      const next = new Float64Array(n);
      for (let j = 0; j < count; j++) {
        const weight = column[j];
        const basis = W[j];
        for (let i = 0; i < n; i++) next[i] += weight * basis[i];
      }
      return next;
    });
    mOrtho(V, M);
  }
  const values = V.map((vector) => {
    mulK(K, vector, apply);
    return dot(vector, apply) / Math.max(dotM(vector, vector, M), 1e-30);
  });
  const order = values.map((value, i) => i).sort((a, b) => values[a] - values[b]);
  return { values: order.map((i) => values[i]), vectors: order.map((i) => V[i]) };
}

function baryWeights(p0, p1, p2, x, y) {
  const den = (p1[1] - p2[1]) * (p0[0] - p2[0]) + (p2[0] - p1[0]) * (p0[1] - p2[1]);
  if (Math.abs(den) < 1e-14) return null;
  const a = ((p1[1] - p2[1]) * (x - p2[0]) + (p2[0] - p1[0]) * (y - p2[1])) / den;
  const b = ((p2[1] - p0[1]) * (x - p2[0]) + (p0[0] - p2[0]) * (y - p2[1])) / den;
  return [a, b, 1 - a - b];
}

function interpBest(mesh, field, tris, x, y) {
  let best = null;
  let bestNeg = -1;
  for (const ids of tris) {
    const w = baryWeights(mesh.nodes[ids[0]], mesh.nodes[ids[1]], mesh.nodes[ids[2]], x, y);
    if (!w) continue;
    const neg = Math.min(w[0], w[1], w[2]);
    if (neg > bestNeg) {
      bestNeg = neg;
      best = w[0] * field[ids[0]] + w[1] * field[ids[1]] + w[2] * field[ids[2]];
    }
  }
  return bestNeg > -0.08 ? best : null;
}

function fieldAt(mesh, field, x, y) {
  if (mesh.kind === 'square') {
    const n = mesh.n;
    if (Math.abs(x) >= 1 || Math.abs(y) >= 1) return null;
    const gx = ((x + 1) / 2) * n;
    const gy = ((y + 1) / 2) * n;
    const i = Math.min(n - 1, Math.max(0, Math.floor(gx)));
    const j = Math.min(n - 1, Math.max(0, Math.floor(gy)));
    const id = (ii, jj) => jj * (n + 1) + ii;
    return interpBest(mesh, field, [
      [id(i, j), id(i + 1, j), id(i + 1, j + 1)],
      [id(i, j), id(i + 1, j + 1), id(i, j + 1)],
    ], x, y);
  }
  const radius = Math.hypot(x, y);
  if (radius >= 1 || radius < 1e-8) return radius < 1e-8 ? field[0] : null;
  const { rings, segs } = mesh;
  const node = (ring, step) => (ring <= 0 ? 0 : 1 + (ring - 1) * segs + ((step % segs) + segs) % segs);
  let theta = Math.atan2(y, x);
  if (theta < 0) theta += Math.PI * 2;
  const step = Math.min(segs - 1, Math.floor((theta / (Math.PI * 2)) * segs));
  const ring = Math.min(rings - 1, Math.max(0, Math.floor(radius * rings)));
  const tris = [];
  const add = (r, s) => {
    if (r <= 0) tris.push([0, node(1, s), node(1, s + 1)]);
    else {
      tris.push([node(r, s), node(r + 1, s), node(r, s + 1)]);
      tris.push([node(r, s + 1), node(r + 1, s), node(r + 1, s + 1)]);
    }
  };
  add(ring, step);
  add(Math.max(0, ring - 1), step);
  if (ring + 1 < rings) add(ring + 1, step);
  return interpBest(mesh, field, tris, x, y);
}

function crossPoint(va, vb, pa, pb) {
  if (va == null || vb == null || (va === 0 && vb === 0) || va * vb > 0) return null;
  if (va === 0) return [pa[0], pa[1]];
  if (vb === 0) return [pb[0], pb[1]];
  const t = va / (va - vb);
  return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t];
}

function cellSegments(corners, pts) {
  const edgeCorners = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const edgeAt = (index) => crossPoint(
    corners[edgeCorners[index][0]],
    corners[edgeCorners[index][1]],
    pts[edgeCorners[index][0]],
    pts[edgeCorners[index][1]],
  );
  if (corners.some((value) => value == null)) {
    const hits = [];
    for (let edge = 0; edge < 4; edge++) {
      const point = edgeAt(edge);
      if (point) hits.push(point);
    }
    return hits.length === 2 && Math.hypot(hits[0][0] - hits[1][0], hits[0][1] - hits[1][1]) > 1e-6
      ? [[hits[0], hits[1]]]
      : [];
  }
  let mask = 0;
  corners.forEach((value, index) => {
    if (value > 0) mask |= 1 << index;
  });
  const plain = {
    1: [[3, 0]],
    2: [[0, 1]],
    3: [[3, 1]],
    4: [[1, 2]],
    6: [[0, 2]],
    7: [[3, 2]],
    8: [[3, 2]],
    9: [[0, 2]],
    11: [[1, 2]],
    12: [[3, 1]],
    13: [[0, 1]],
    14: [[3, 0]],
  };
  let pairs = plain[mask] || [];
  if (mask === 5 || mask === 10) pairs = saddlePairs(corners);
  const segments = [];
  for (const [a, b] of pairs) {
    const pa = edgeAt(a);
    const pb = edgeAt(b);
    if (pa && pb && Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > 1e-6) segments.push([pa, pb]);
  }
  return segments;
}

// A saddle has two choices. The center of the cell belongs to one diagonal,
// so the contour wraps the other two corners and that diagonal stays connected.
export function saddlePairs(corners) {
  const center = (corners[0] + corners[1] + corners[2] + corners[3]) / 4;
  const joined = (center > 0) === (corners[0] > 0);
  return joined ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]];
}

function chainLines(segments) {
  const keyOf = (point) => `${Math.round(point[0] * 1e4)}:${Math.round(point[1] * 1e4)}`;
  const half = [];
  const groups = new Map();
  segments.forEach((segment, index) => {
    for (const end of [0, 1]) {
      const point = segment[end];
      const id = half.length;
      half.push({ index, end, point, pair: -1 });
      const key = keyOf(point);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(id);
    }
  });
  const direction = (id) => {
    const item = half[id];
    const other = segments[item.index][1 - item.end];
    const dx = other[0] - item.point[0];
    const dy = other[1] - item.point[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dx / len, dy / len];
  };
  const link = (a, b) => {
    half[a].pair = b;
    half[b].pair = a;
  };
  for (const ids of groups.values()) {
    if (ids.length === 2) link(ids[0], ids[1]);
    else if (ids.length === 4) {
      const order = ids.slice().sort((a, b) => {
        const da = direction(a);
        const db = direction(b);
        return Math.atan2(da[1], da[0]) - Math.atan2(db[1], db[0]);
      });
      link(order[0], order[2]);
      link(order[1], order[3]);
    } else if (ids.length === 3) {
      let best = -2;
      let pick = [ids[0], ids[1]];
      for (let a = 0; a < 3; a++) {
        for (let b = a + 1; b < 3; b++) {
          const da = direction(ids[a]);
          const db = direction(ids[b]);
          const score = -(da[0] * db[0] + da[1] * db[1]);
          if (score > best) {
            best = score;
            pick = [ids[a], ids[b]];
          }
        }
      }
      link(pick[0], pick[1]);
    }
  }
  const farOf = (id) => half.find((item) => item.index === half[id].index && item.end !== half[id].end);
  const used = new Set();
  const paths = [];
  const walk = (start) => {
    const path = [];
    let id = start;
    while (id != null && !used.has(half[id].index)) {
      const item = half[id];
      used.add(item.index);
      if (!path.length) path.push([item.point[0], item.point[1]]);
      const far = farOf(id);
      path.push([far.point[0], far.point[1]]);
      id = far.pair >= 0 ? far.pair : null;
    }
    if (path.length >= 2) paths.push(path);
  };
  half.forEach((item, id) => {
    if (item.pair < 0) walk(id);
  });
  half.forEach((item, id) => {
    if (!used.has(item.index)) walk(id);
  });
  return paths;
}

function fromCenter(arm) {
  const start = Math.hypot(arm[0][0], arm[0][1]);
  const end = Math.hypot(arm[arm.length - 1][0], arm[arm.length - 1][1]);
  const points = start <= end ? arm.map((point) => [point[0], point[1]]) : arm.map((point) => [point[0], point[1]]).reverse();
  const tip = points[Math.min(4, points.length - 1)];
  const dx = tip[0] - points[0][0];
  const dy = tip[1] - points[0][1];
  const len = Math.hypot(dx, dy) || 1;
  return { points, dir: [dx / len, dy / len] };
}

// A numerical cross can be chained into two corners. Split those at the
// center and join the opposite arms so the lines run straight through.
function throughCenter(paths) {
  const pending = [];
  const kept = [];
  for (const path of paths) {
    let at = 0;
    let dist = Infinity;
    path.forEach((point, index) => {
      const next = Math.hypot(point[0], point[1]);
      if (next < dist) {
        dist = next;
        at = index;
      }
    });
    if (dist > 0.1 || at < 2 || at > path.length - 3) {
      kept.push(path);
      continue;
    }
    const a = fromCenter(path.slice(0, at + 1));
    const b = fromCenter(path.slice(at));
    const dot = a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1];
    if (dot < -0.65) kept.push(path);
    else pending.push(a, b);
  }
  const used = new Set();
  for (let i = 0; i < pending.length; i++) {
    if (used.has(i)) continue;
    let best = -1;
    let bestDot = -0.35;
    for (let j = i + 1; j < pending.length; j++) {
      if (used.has(j)) continue;
      const dot = pending[i].dir[0] * pending[j].dir[0] + pending[i].dir[1] * pending[j].dir[1];
      if (dot < bestDot) {
        bestDot = dot;
        best = j;
      }
    }
    if (best < 0) {
      kept.push(pending[i].points);
      continue;
    }
    used.add(i);
    used.add(best);
    const arm = pending[i].points;
    const other = pending[best].points;
    kept.push([...arm.slice().reverse(), ...other.slice(1)]);
  }
  return kept;
}

function tightRim(point, kind) {
  if (kind === 'disc') return Math.hypot(point[0], point[1]) > 0.96;
  return Math.max(Math.abs(point[0]), Math.abs(point[1])) > 0.96;
}

function nearRim(point, kind) {
  if (kind === 'disc') return Math.hypot(point[0], point[1]) > 0.86;
  return Math.max(Math.abs(point[0]), Math.abs(point[1])) > 0.86;
}

function alongRim(a, b, kind) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  if (kind === 'disc') {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const radial = Math.abs(dx * mx + dy * my) / (len * Math.max(Math.hypot(mx, my), 1e-6));
    return radial < 0.55;
  }
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  if (Math.abs(mx) >= Math.abs(my)) return Math.abs(dx) / len < 0.55;
  return Math.abs(dy) / len < 0.55;
}

function toBoundary(from, toward, kind) {
  const dx = toward[0] - from[0];
  const dy = toward[1] - from[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-8) return [toward[0], toward[1]];
  const ux = dx / len;
  const uy = dy / len;
  let travel = null;
  if (kind === 'disc') {
    const b = 2 * (from[0] * ux + from[1] * uy);
    const c = from[0] * from[0] + from[1] * from[1] - 1;
    const disc = b * b - 4 * c;
    if (disc >= 0) {
      const root = Math.sqrt(disc);
      const candidates = [(-b + root) / 2, (-b - root) / 2].filter((value) => value > 1e-4);
      if (candidates.length) travel = Math.min(...candidates);
    }
  } else {
    const hits = [];
    if (Math.abs(ux) > 1e-9) hits.push(ux > 0 ? (1 - from[0]) / ux : (-1 - from[0]) / ux);
    if (Math.abs(uy) > 1e-9) hits.push(uy > 0 ? (1 - from[1]) / uy : (-1 - from[1]) / uy);
    const forward = hits.filter((value) => value > 1e-4);
    if (forward.length) travel = Math.min(...forward);
  }
  if (travel == null || travel > 0.5) return [toward[0], toward[1]];
  return [from[0] + ux * travel, from[1] + uy * travel];
}

function marginOf(point, kind) {
  if (kind === 'disc') return 1 - Math.hypot(point[0], point[1]);
  return 1 - Math.max(Math.abs(point[0]), Math.abs(point[1]));
}

// The solved field bends in the last band inside the rim. Keep the heading
// from just inside that band and run it straight out to the boundary.
function meetRim(pts, kind) {
  const fixTip = (points, tipIsEnd) => {
    const ordered = tipIsEnd ? points : points.slice().reverse();
    let anchor = -1;
    for (let i = ordered.length - 1; i >= 0; i--) {
      if (marginOf(ordered[i], kind) >= 0.16) {
        anchor = i;
        break;
      }
    }
    if (anchor < 2) return tipIsEnd ? ordered : ordered.slice().reverse();
    let inner = anchor;
    for (let i = anchor; i >= 0; i--) {
      if (marginOf(ordered[i], kind) >= 0.3) {
        inner = i;
        break;
      }
    }
    if (inner === anchor) inner = Math.max(0, anchor - 5);
    let dx = ordered[anchor][0] - ordered[inner][0];
    let dy = ordered[anchor][1] - ordered[inner][1];
    if (Math.hypot(dx, dy) < 1e-4) return tipIsEnd ? ordered : ordered.slice().reverse();
    const ahead = [ordered[anchor][0] + dx, ordered[anchor][1] + dy];
    if (marginOf(ahead, kind) > marginOf(ordered[anchor], kind)) {
      dx = -dx;
      dy = -dy;
    }
    const hit = toBoundary(
      ordered[anchor],
      [ordered[anchor][0] + dx, ordered[anchor][1] + dy],
      kind,
    );
    const next = ordered.slice(0, anchor + 1);
    next.push(hit);
    return tipIsEnd ? next : next.slice().reverse();
  };
  return fixTip(fixTip(pts, true), false);
}

function insideShape(point, kind) {
  if (kind === 'disc') return point[0] * point[0] + point[1] * point[1] <= 1.000001;
  return Math.abs(point[0]) <= 1.000001 && Math.abs(point[1]) <= 1.000001;
}

function finishPath(path, kind) {
  const pts = path.map((point) => [point[0], point[1]]);
  const gap = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  const closed = gap < 0.12 && !nearRim(pts[0], kind) && !nearRim(pts[pts.length - 1], kind);
  if (!closed) {
    for (let guard = 0; guard < 6 && pts.length > 2; guard++) {
      if (!(alongRim(pts[pts.length - 2], pts[pts.length - 1], kind) && nearRim(pts[pts.length - 1], kind))) break;
      pts.pop();
    }
    for (let guard = 0; guard < 6 && pts.length > 2; guard++) {
      if (!(alongRim(pts[0], pts[1], kind) && nearRim(pts[0], kind))) break;
      pts.shift();
    }
    pts[0] = toBoundary(pts[1], pts[0], kind);
    pts[pts.length - 1] = toBoundary(pts[pts.length - 2], pts[pts.length - 1], kind);
  }
  for (let iter = 0; iter < 10; iter++) {
    const next = pts.map((point) => [point[0], point[1]]);
    const start = closed ? 0 : 1;
    const end = closed ? pts.length : pts.length - 1;
    for (let i = start; i < end; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length];
      const cur = pts[i];
      const nxt = pts[(i + 1) % pts.length];
      const smoothed = [
        cur[0] * 0.5 + (prev[0] + nxt[0]) * 0.25,
        cur[1] * 0.5 + (prev[1] + nxt[1]) * 0.25,
      ];
      next[i] = insideShape(smoothed, kind) ? smoothed : cur;
    }
    if (!closed) {
      next[0] = pts[0];
      next[pts.length - 1] = pts[pts.length - 1];
    }
    pts.splice(0, pts.length, ...next);
  }
  if (!closed) {
    const straight = meetRim(pts, kind);
    pts.splice(0, pts.length, ...straight);
  }
  return pts;
}

function nodalLines(mesh, free, vector) {
  const field = new Float64Array(mesh.nodes.length);
  free.forEach((node, i) => { field[node] = vector[i]; });
  const n = 64;
  const grid = [];
  for (let j = 0; j <= n; j++) {
    const row = [];
    for (let i = 0; i <= n; i++) {
      const x = -1 + (2 * i) / n;
      const y = -1 + (2 * j) / n;
      const outside = mesh.kind === 'disc' ? x * x + y * y >= 1 : Math.abs(x) >= 1 || Math.abs(y) >= 1;
      row.push(outside ? null : fieldAt(mesh, field, x, y));
    }
    grid.push(row);
  }
  for (let pass = 0; pass < 2; pass++) {
    const next = grid.map((row) => row.slice());
    for (let j = 1; j < n; j++) {
      for (let i = 1; i < n; i++) {
        if (grid[j][i] == null) continue;
        const neighbors = [grid[j][i - 1], grid[j][i + 1], grid[j - 1][i], grid[j + 1][i]].filter((value) => value != null);
        if (!neighbors.length) continue;
        const average = neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
        next[j][i] = grid[j][i] * 0.5 + average * 0.5;
      }
    }
    for (let j = 0; j <= n; j++) grid[j] = next[j];
  }
  const segments = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const corners = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      const pts = [
        [-1 + (2 * i) / n, -1 + (2 * j) / n],
        [-1 + (2 * (i + 1)) / n, -1 + (2 * j) / n],
        [-1 + (2 * (i + 1)) / n, -1 + (2 * (j + 1)) / n],
        [-1 + (2 * i) / n, -1 + (2 * (j + 1)) / n],
      ];
      segments.push(...cellSegments(corners, pts));
    }
  }
  const kept = segments.filter(([a, b]) => !(tightRim(a, mesh.kind) && tightRim(b, mesh.kind) && alongRim(a, b, mesh.kind)));
  return throughCenter(chainLines(kept)).filter((path) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const point of path) {
      minX = Math.min(minX, point[0]);
      minY = Math.min(minY, point[1]);
      maxX = Math.max(maxX, point[0]);
      maxY = Math.max(maxY, point[1]);
    }
    return Math.hypot(maxX - minX, maxY - minY) > 0.12;
  }).map((path) => finishPath(path, mesh.kind));
}

// Axisymmetric thin shell. One circumferential order at a time, with a
// straight element along the drawn profile: membrane strains at one point,
// bending on a Hermite normal displacement. The crown or the base is held,
// and the lip is free. Frequencies come back as ω; the picture uses the
// nodal meridians and the zeros of the normal displacement.
const SHELL_SCALE = 0.15;

function shellStrains(local, t, Le, R, sinp, cosp, order) {
  const U = (1 - t) * local[0] + t * local[4];
  const V = (1 - t) * local[1] + t * local[5];
  const dU = (local[4] - local[0]) / Le;
  const dV = (local[5] - local[1]) / Le;
  const t2 = t * t;
  const t3 = t2 * t;
  const W = (1 - 3 * t2 + 2 * t3) * local[2]
    + Le * (t - 2 * t2 + t3) * local[3]
    + (3 * t2 - 2 * t3) * local[6]
    + Le * (-t2 + t3) * local[7];
  const dW = ((-6 * t + 6 * t2) / Le) * local[2]
    + (1 - 4 * t + 3 * t2) * local[3]
    + ((6 * t - 6 * t2) / Le) * local[6]
    + (-2 * t + 3 * t2) * local[7];
  const ddW = ((-6 + 12 * t) / (Le * Le)) * local[2]
    + ((-4 + 6 * t) / Le) * local[3]
    + ((6 - 12 * t) / (Le * Le)) * local[6]
    + ((-2 + 6 * t) / Le) * local[7];
  return [
    dU,
    (sinp * U + order * V + cosp * W) / R,
    dV - (sinp * V) / R - (order * U) / R,
    ddW,
    -(order * order * W) / (R * R) + (sinp * dW) / R,
    order * (dW / R - (sinp * W) / (R * R)),
  ];
}

function shellHarmonic(meridian, order, C, D, h, nu, count) {
  const pts = meridian.pts;
  const last = pts.length - 1;
  const map = [];
  let freeCount = 0;
  for (let i = 0; i < pts.length; i++) {
    const fixed = (i === 0 && meridian.fixStart) || (i === last && meridian.fixEnd);
    for (let dof = 0; dof < 4; dof++) map.push(fixed ? -1 : freeCount++);
  }
  const K = Array.from({ length: freeCount }, () => new Map());
  const M = new Float64Array(freeCount);
  const basis = Array.from({ length: 8 }, (_, index) => {
    const local = [0, 0, 0, 0, 0, 0, 0, 0];
    local[index] = 1;
    return local;
  });
  const gauss = [0.5 - Math.sqrt(0.6) / 2, 0.5, 0.5 + Math.sqrt(0.6) / 2];
  const weight = [5 / 18, 8 / 18, 5 / 18];
  for (let el = 0; el < last; el++) {
    const [y0, r0] = pts[el];
    const [y1, r1] = pts[el + 1];
    const dy = (y1 - y0) * SHELL_SCALE;
    const dr = (r1 - r0) * SHELL_SCALE;
    const Le = Math.hypot(dy, dr);
    if (Le < 1e-8) continue;
    const sinp = dr / Le;
    const cosp = dy / Le;
    const locals = [0, 1, 2, 3].map((dof) => map[el * 4 + dof]).concat([0, 1, 2, 3].map((dof) => map[(el + 1) * 4 + dof]));
    const add = (strains, span, part) => {
      for (let p = 0; p < 8; p++) {
        if (locals[p] < 0) continue;
        for (let q = 0; q < 8; q++) {
          if (locals[q] < 0) continue;
          const a = strains[p];
          const b = strains[q];
          const membrane = part === 'bend' ? 0 : C * (a[0] * b[0] + a[1] * b[1] + nu * (a[0] * b[1] + a[1] * b[0]) + ((1 - nu) / 2) * a[2] * b[2]);
          const bending = part === 'membrane' ? 0 : D * (a[3] * b[3] + a[4] * b[4] + nu * (a[3] * b[4] + a[4] * b[3]) + 2 * (1 - nu) * a[5] * b[5]);
          const value = (membrane + bending) * span;
          K[locals[p]].set(locals[q], (K[locals[p]].get(locals[q]) || 0) + value);
        }
      }
    };
    const midR = Math.max(((r0 + r1) / 2) * SHELL_SCALE, 0.008);
    const membraneStrains = basis.map((local) => shellStrains(local, 0.5, Le, midR, sinp, cosp, order));
    add(membraneStrains, midR * Le, 'membrane');
    for (let g = 0; g < gauss.length; g++) {
      const t = gauss[g];
      const R = Math.max(((1 - t) * r0 + t * r1) * SHELL_SCALE, 0.008);
      const strains = basis.map((local) => shellStrains(local, t, Le, R, sinp, cosp, order));
      add(strains, R * weight[g] * Le, 'bend');
    }
    const lump = h * midR * Le / 2;
    for (const node of [0, 1]) {
      for (const dof of [0, 1, 2]) {
        const slot = locals[node * 4 + dof];
        if (slot >= 0) M[slot] += lump;
      }
      const spin = locals[node * 4 + 3];
      if (spin >= 0) M[spin] += lump * Le * Le / 12;
    }
  }
  for (let i = 0; i < freeCount; i++) if (M[i] <= 0) M[i] = h * 1e-6;
  const solved = subspace(K, M, count, 11 + order);
  return solved.values.map((lambda, index) => {
    const vector = solved.vectors[index];
    const W = pts.map((_, node) => {
      const slot = map[node * 4 + 2];
      return slot < 0 ? 0 : vector[slot];
    });
    return { lambda, n: order, lines: shellLines(pts, order, W) };
  });
}

function shellLines(pts, order, W) {
  const fractions = [];
  for (let k = 0; k < order * 2; k++) {
    const sine = Math.sin((Math.PI * (2 * k + 1)) / (2 * order));
    const shown = Math.abs(sine) > 0.96 ? Math.sign(sine) * 0.92 : sine;
    if (!fractions.some((value) => Math.abs(value - shown) < 1e-3)) fractions.push(shown);
  }
  const lines = fractions.map((fraction) => pts.map(([y, r]) => [fraction * r, y]));
  for (let i = 1; i < W.length; i++) {
    if (!(W[i - 1] * W[i] < 0)) continue;
    const t = W[i - 1] / (W[i - 1] - W[i]);
    const y = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t;
    const r = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    const ry = Math.min(0.045, r * 0.18);
    const ring = [];
    for (let step = 0; step <= 16; step++) {
      const angle = (Math.PI * 2 * step) / 16;
      ring.push([Math.cos(angle) * r * 0.94, y + Math.sin(angle) * ry]);
    }
    lines.push(ring);
  }
  return lines;
}

export function solveShellModes(spec, { count = 6 } = {}) {
  const started = performance.now();
  const meridian = shellMeridian(spec.shape);
  if (!meridian) return { modes: [], nodes: 0, ms: 0 };
  const mat = materialOf(spec.material);
  const C = mat.h / (1 - mat.nu ** 2);
  const D = (mat.h ** 3) / (12 * (1 - mat.nu ** 2));
  const found = [];
  for (const order of [2, 3, 4]) {
    if (performance.now() - started > 700) break;
    for (const mode of shellHarmonic(meridian, order, C, D, mat.h, mat.nu, 2)) found.push(mode);
  }
  found.sort((a, b) => a.lambda - b.lambda);
  const speed = Math.sqrt(mat.E / mat.rho);
  const modes = found.slice(0, count).map((mode) => ({
    lambda: mode.lambda,
    omega: Math.sqrt(Math.max(mode.lambda, 0)) * speed,
    n: mode.n,
    lines: mode.lines,
    shell: true,
  }));
  return { modes, nodes: meridian.pts.length, ms: performance.now() - started };
}

export function solveFlatModes(spec, { count = 6 } = {}) {
  const started = performance.now();
  const mesh = spec.shape === 'square' ? meshSquare(20) : meshDisc(12, 28);
  const { K, M, free } = assemble(mesh);
  const solved = subspace(K, M, count, 7);
  const factor = materialFactor(spec.material, spec.model);
  const modes = solved.values.map((lambda, i) => ({
    lambda,
    omega: spec.model === 'plate' ? factor * lambda : factor * Math.sqrt(Math.max(lambda, 0)),
    lines: nodalLines(mesh, free, solved.vectors[i]),
  }));
  return { modes, nodes: mesh.nodes.length, ms: performance.now() - started };
}
