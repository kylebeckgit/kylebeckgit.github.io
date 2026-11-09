// Knobs that rewrite a modal profile before it is drawn, heard, or exported.
// Zero is identity, apart from Density, which resamples the same spectrum.
//
// The walkthrough is the guide for how strong each one looks:
//   Density steps the rung count. The outline stays the envelope of the
//   whole profile, so 8 modes are spread across it and 256 interpolates
//   between the ones we have.
//   Absorb, Normalize, Decay, and Decay KF only nudge level and decay.
//   In the recording those nudges are small.
//   Tune shifts every ratio by semitones. Disperse stretches the octaves.
//   Detune is stereo in Zebra and is drawn as a second sheet, not a CSV edit.

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

export function shapePartials(partials, shape = {}) {
  if (!partials.length) return [];
  const absorb = clamp(Number(shape.absorb) || 0, -1, 1);
  const disperse = clamp(Number(shape.disperse) || 0, -1, 1);
  const decay = clamp(Number(shape.decay) || 0, -1, 1);
  const decayKf = clamp(Number(shape.decayKf) || 0, -1, 1);
  const normalize = clamp(Number(shape.normalize) || 0, -1, 1);
  const tune = clamp(Number(shape.tune) || 0, -48, 48);
  const density = Math.max(1, Math.round(Number(shape.density) || partials.length));
  const fund = Math.min(...partials.map((partial) => partial.ratio));
  const tuneGain = 2 ** (tune / 12);
  const decayGain = 2 ** (decay * 0.85);
  const stretch = 1 + disperse * 0.28;
  const items = partials.map((partial, sourceIndex) => {
    const oct = Math.log2(Math.max(partial.ratio, 1e-8) / fund);
    const ratio = fund * 2 ** (oct * stretch) * tuneGain;
    const damp = Math.exp(-absorb * (0.12 + oct * 0.22) - decayKf * oct * 0.35);
    const gainDb = clamp(partial.gainDb - absorb * oct * 1.4 + normalize * (oct - 1.5) * 3.2, -96, 0);
    return {
      ratio,
      gainDb,
      decay: clamp(partial.decay * decayGain * damp, 0.02, 60),
      sourceIndex,
    };
  });
  items.sort((a, b) => a.ratio - b.ratio);
  return resample(items, density);
}

function resample(items, density) {
  if (density === items.length) return items;
  const last = Math.max(1, items.length - 1);
  const out = [];
  for (let i = 0; i < density; i++) {
    const t = density === 1 ? 0 : (i / (density - 1)) * last;
    const i0 = Math.min(items.length - 1, Math.floor(t));
    const i1 = Math.min(items.length - 1, i0 + 1);
    const f = t - i0;
    const a = items[i0];
    const b = items[i1];
    const ratio = Math.exp(Math.log(a.ratio) * (1 - f) + Math.log(b.ratio) * f);
    out.push({
      ratio,
      gainDb: a.gainDb * (1 - f) + b.gainDb * f,
      decay: a.decay * (1 - f) + b.decay * f,
      sourceIndex: f < 0.5 ? a.sourceIndex : b.sourceIndex,
    });
  }
  return out;
}
