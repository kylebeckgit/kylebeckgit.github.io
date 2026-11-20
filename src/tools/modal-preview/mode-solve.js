// Lowest 2D modes of a flat shape. A triangle mesh, linear elements, a lumped
// mass, and subspace iteration. Drums are fixed membranes. Plates and gongs
// are simply supported, so their nodal lines are the membrane lines and the
// frequencies scale with bending stiffness. This is a picture of the shape.
// It does not replace the preview partials.

import { bodyFamily, drawKind, materialKey } from './object-view.js';

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
  if (kind === 'flared' || kind === 'bowl' || kind === 'cowbell' || kind === 'handpan') return null;
  if (family === 'bar' || family === 'string' || family === 'tube' || family === 'box') return null;
  if (kind === 'disc') return { shape: 'disc', model: 'plate', material: materialKey(body) };
  if (family === 'plate') return { shape: 'square', model: 'plate', material: materialKey(body) };
  if (family === 'membrane') return { shape: 'disc', model: 'membrane', material: materialKey(body) };
  return null;
}

export function specKey(spec) {
  if (!spec) return '';
  return `${spec.shape}|${spec.model}|${spec.material}`;
}

export function patternNote(spec, phase) {
  if (!spec) return '';
  if (phase === 'ready') return 'Nodal lines are solved from the shape. The sound is unchanged.';
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
  return { nodes, tris, boundary };
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
  return { nodes, tris, boundary };
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

function nodalLines(mesh, free, vector) {
  const field = new Float64Array(mesh.nodes.length);
  free.forEach((node, i) => { field[node] = vector[i]; });
  const lines = [];
  for (const tri of mesh.tris) {
    const hits = [];
    for (let edge = 0; edge < 3; edge++) {
      const a = tri[edge];
      const b = tri[(edge + 1) % 3];
      const va = field[a];
      const vb = field[b];
      if (va * vb >= 0) continue;
      const t = va / (va - vb);
      const pa = mesh.nodes[a];
      const pb = mesh.nodes[b];
      hits.push([pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t]);
    }
    if (hits.length >= 2) lines.push([hits[0], hits[1]]);
  }
  return chainLines(lines);
}

function chainLines(segments) {
  const unused = segments.map((segment) => [segment[0], segment[1]]);
  const paths = [];
  const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.08;
  while (unused.length) {
    const path = unused.pop();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < unused.length; i++) {
        const [a, b] = unused[i];
        const start = path[0];
        const end = path[path.length - 1];
        if (close(end, a)) path.push(b);
        else if (close(end, b)) path.push(a);
        else if (close(start, b)) path.unshift(a);
        else if (close(start, a)) path.unshift(b);
        else continue;
        unused.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (path.length > 2) paths.push(path);
  }
  return paths;
}

export function solveFlatModes(spec, { count = 6 } = {}) {
  const started = performance.now();
  const mesh = spec.shape === 'square' ? meshSquare(16) : meshDisc(8, 18);
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
