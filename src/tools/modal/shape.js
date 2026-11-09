// Post-process a partial list the way Zebra's modal knobs rewrite the profile.
// Identity at the zero knobs, so a profile exports unchanged until a knob moves.
// Absorb and Disperse follow the Zebra 3 user guide:
//   Absorb  — higher values damp every mode, and the higher modes more, so the
//             sound gets shorter and duller. Negative values do the opposite.
//   Disperse — positive values spread every mode's frequency away from the
//             fundamental; negative values compress them back toward it.
// Decay is the global envelope (a multiplier on every T60). Density keeps the
// lowest modes, which is what the resonator actually sounds.

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function shapePartials(partials, shape = {}) {
  if (!partials.length) return [];
  const absorb = clamp(Number(shape.absorb) || 0, -1, 1);
  const disperse = clamp(Number(shape.disperse) || 0, -1, 1);
  const decay = clamp(Number(shape.decay) || 0, -1, 1);
  const density = Math.max(1, Math.round(Number(shape.density) || partials.length));
  const fund = Math.min(...partials.map((partial) => partial.ratio));
  const decayGain = 8 ** decay;
  const stretch = 1 + disperse * 0.42;
  const items = partials.map((partial, sourceIndex) => {
    const oct = Math.log2(Math.max(partial.ratio, 1e-8) / fund);
    const ratio = fund * 2 ** (oct * stretch);
    const damp = Math.exp(-absorb * (1.05 + oct * 1.35));
    const gainDb = clamp(partial.gainDb - absorb * oct * 6.5, -96, 0);
    return {
      ratio,
      gainDb,
      decay: clamp(partial.decay * decayGain * damp, 0.02, 60),
      sourceIndex,
    };
  });
  items.sort((a, b) => a.ratio - b.ratio);
  return items.slice(0, Math.min(density, items.length));
}
