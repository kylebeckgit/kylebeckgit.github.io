// Two-pole modal resonator.
// Decay in the profile is T60: the time for that partial to fall 60 dB.
// This approximates Zebra 3's modal resonator. It is not verified against Zebra.

export function strikeWeight(index, position) {
  // String-like mode shape. n is the partial's place in the list, not a measured Zebra mode.
  // sin(pi * n * position) is an approximation, and a poor one for bells and plates.
  // The slider floor matches the view and a CSV played with Zebra's Position at 0:
  // no comb. A sine at 0.02 would drop the fundamental by about 24 dB.
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos <= 0.02) return 1;
  const n = index + 1;
  const placed = Math.min(0.98, pos);
  return Math.abs(Math.sin(Math.PI * n * placed));
}

export function modeCoeffs(freq, t60, sampleRate) {
  const safe = Math.min(60, Math.max(0.005, Number(t60) || 0.005));
  const tau = safe / Math.log(1000);
  const R = Math.exp(-1 / (tau * sampleRate));
  const theta = (2 * Math.PI * freq) / sampleRate;
  return { R, a1: 2 * R * Math.cos(theta), a2: -(R * R) };
}

export function noiseSample(state) {
  let x = state.noise | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.noise = x;
  return ((x >>> 0) / 4294967296) * 2 - 1;
}

export function malletTable(sampleRate, hardness) {
  const hard = Math.min(1, Math.max(0, Number(hardness) || 0));
  const ms = 9 - hard * 8;
  const length = Math.max(8, Math.round((sampleRate * ms) / 1000));
  const cutoff = 450 * 18 ** hard;
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
  const out = new Float32Array(length);
  let low = 0;
  let sum = 0;
  for (let i = 0; i < length; i++) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (length - 1));
    low += alpha * (hann - low);
    out[i] = low;
    sum += low;
  }
  // Unit area, so a soft mallet is not dozens of impulses piled on the resonator.
  if (sum > 0) {
    for (let i = 0; i < length; i++) out[i] /= sum;
  }
  return out;
}

export function createVoice(partials, options, sampleRate) {
  const velocity = Math.min(1, Math.max(0, Number(options.velocity) || 0));
  const position = Number(options.position);
  // flat: Hear follows GainDB. Strike position and the mallet both comb the
  // spectrum, so a measurement of the first 20 ms would not match the CSV.
  const flat = options.flat === true;
  const exciter = flat ? 'click' : (options.exciter || 'click');
  const continuous = exciter === 'bow' || exciter === 'file';
  const modes = [];
  let ampSum = 0;
  for (let index = 0; index < partials.length; index++) {
    const partial = partials[index];
    const freq = options.fundamental * partial.ratio;
    if (!(freq >= 20) || freq > sampleRate * 0.45 || partial.gainDb < -90) continue;
    const amp = 10 ** (partial.gainDb / 20) * (flat ? 1 : strikeWeight(index, position)) * (flat ? 1 : velocity);
    if (!(amp > 0)) continue;
    ampSum += amp;
    const coeff = modeCoeffs(freq, partial.decay, sampleRate);
    // The bare two-pole peaks near 1/sin(theta). Scale that out so GainDB is the
    // partial's level. Continuous noise still grows with Q, so bowing is scaled
    // back by the pole radius and keeps following GainDB.
    const sine = Math.max(1e-4, Math.sin((2 * Math.PI * freq) / sampleRate));
    const radius = continuous ? Math.sqrt(Math.max(1 - coeff.R * coeff.R, 1e-8)) : 1;
    modes.push({
      a1: coeff.a1,
      a2: coeff.a2,
      feed: amp * sine * radius,
      y1: 0,
      y2: 0,
      freq,
      t60: partial.decay,
      glide: Boolean(options.glide) && partial.ratio < (options.glide.maxRatio ?? 6),
    });
  }
  const bowCutoff = 3200;
  return {
    modes,
    norm: options.unitGain === true ? 1 : 0.45 / Math.max(ampSum, 1e-8),
    exciter,
    sampleRate,
    pos: 0,
    lp: 0,
    noise: 0x6d2b79f5,
    env: 1,
    burstDrop: Math.exp(-1 / (0.045 * sampleRate)),
    bowAlpha: 1 - Math.exp((-2 * Math.PI * bowCutoff) / sampleRate),
    file: options.file || null,
    filePos: 0,
    mallet: exciter === 'mallet' ? malletTable(sampleRate, options.hardness) : null,
    holding: true,
    impulse: !flat && options.impulse ? 1 : 0,
    linear: flat,
    unitGain: options.unitGain === true,
    glide: options.glide || null,
    n: 0,
  };
}

function fadeInPlace(samples, sampleRate, seconds) {
  const length = Math.max(2, Math.round(sampleRate * seconds));
  const span = Math.min(length, samples.length) - 1;
  for (let i = 0; i < length && i < samples.length; i++) {
    samples[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / span);
  }
}

export function nextExciter(state) {
  if (!state.holding && (state.exciter === 'bow' || state.exciter === 'file')) return 0;
  if (state.exciter === 'click') {
    const sample = state.pos === 0 ? 1 : 0;
    state.pos += 1;
    return sample;
  }
  if (state.exciter === 'mallet') {
    const sample = state.pos < state.mallet.length ? state.mallet[state.pos] : 0;
    state.pos += 1;
    return sample;
  }
  if (state.exciter === 'burst') {
    const sample = noiseSample(state) * state.env * 0.12;
    state.env *= state.burstDrop;
    state.pos += 1;
    return state.pos > state.sampleRate * 0.18 ? 0 : sample;
  }
  if (state.exciter === 'bow') {
    state.lp += state.bowAlpha * (noiseSample(state) - state.lp);
    return state.lp * 0.85;
  }
  if (state.exciter === 'file' && state.file && state.file.length > 1) {
    let index = state.filePos;
    if (index >= state.file.length - 1) {
      if (!state.holding) return 0;
      index = 0;
      state.filePos = 0;
    }
    const i = Math.floor(index);
    const frac = index - i;
    const sample = state.file[i] * (1 - frac) + state.file[i + 1] * frac;
    state.filePos = index + 1;
    return sample;
  }
  return 0;
}

export function processSample(state) {
  if (state.glide) {
    const t = state.n / state.sampleRate;
    const u = Math.min(1, t / state.glide.seconds);
    if (u < 1) {
      const bend = 2 ** ((state.glide.cents * u) / 1200);
      for (const mode of state.modes) {
        if (!mode.glide) continue;
        const coeff = modeCoeffs(mode.freq * bend, mode.t60, state.sampleRate);
        mode.a1 = coeff.a1;
        mode.a2 = coeff.a2;
      }
    }
    state.n += 1;
  }
  let input = nextExciter(state);
  if (state.impulse) {
    input += state.impulse;
    state.impulse = 0;
  }
  let sum = 0;
  const modes = state.modes;
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i];
    const y = mode.feed * input + mode.a1 * mode.y1 + mode.a2 * mode.y2;
    mode.y2 = mode.y1;
    mode.y1 = Math.abs(y) < 1e-20 ? 0 : y;
    sum += mode.y1;
  }
  if (state.linear) return sum * state.norm;
  const shaped = Math.tanh(sum * state.norm);
  return shaped > 0.99 ? 0.99 : shaped < -0.99 ? -0.99 : shaped;
}

function renderModalSum(partials, options, sampleRate, seconds) {
  // Each row is amp * r^n * sin, with amp from GainDB. A two-pole click is not
  // that waveform: its startup, plus a fade, makes a short row fit several dB
  // off. Zebra's partials are the exponential itself.
  const fundamental = options.fundamental;
  const length = Math.max(8, Math.floor(sampleRate * seconds));
  const out = new Float32Array(length);
  const glide = options.glide;
  for (const partial of partials) {
    const freq = fundamental * partial.ratio;
    if (!(freq >= 20) || freq > sampleRate * 0.45 || !(partial.decay > 0)) continue;
    const amp = 10 ** (partial.gainDb / 20);
    if (!(amp > 0)) continue;
    const tau = partial.decay / Math.log(1000);
    const radius = Math.exp(-1 / (tau * sampleRate));
    const omega = (2 * Math.PI * freq) / sampleRate;
    const bends = glide && partial.ratio < (glide.maxRatio ?? 6) && glide.seconds > 0;
    let env = 1;
    if (!bends) {
      for (let i = 1; i < length; i++) {
        env *= radius;
        out[i] += amp * env * Math.sin(omega * i);
      }
      continue;
    }
    // Same bend the two-pole used: up to `cents` over `seconds`, then hold.
    const rise = Math.LN2 * glide.cents / (1200 * glide.seconds);
    const held = omega * 2 ** (glide.cents / 1200);
    let phase = 0;
    for (let i = 1; i < length; i++) {
      const t = i / sampleRate;
      phase += t < glide.seconds ? omega * Math.exp(rise * t) : held;
      env *= radius;
      out[i] += amp * env * Math.sin(phase);
    }
  }
  return out;
}

function renderFlat(partials, options, sampleRate, seconds) {
  const state = createVoice(partials, { ...options, flat: true }, sampleRate);
  const length = Math.max(8, Math.floor(sampleRate * seconds));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) out[i] = processSample(state);
  fadeInPlace(out, sampleRate, options.fadeIn || 0.004);
  return out;
}

export function renderPreview(partials, options) {
  const sampleRate = options.sampleRate || 44100;
  const seconds = options.seconds || 3;
  if (options.matchGains) {
    return renderModalSum(partials, options, sampleRate, seconds);
  }
  const length = Math.floor(sampleRate * seconds);
  const state = createVoice(partials, options, sampleRate);
  const releaseAt = Math.floor(sampleRate * (options.releaseAt ?? seconds));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    if (i === releaseAt) state.holding = false;
    out[i] = processSample(state);
  }
  return out;
}

export function scaleToPeak(samples, target = 0.45) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i];
    if (!Number.isFinite(value)) throw new Error('Playback produced an invalid sample.');
    const abs = Math.abs(value);
    if (abs > peak) peak = abs;
  }
  if (!(peak > 1e-5)) throw new Error('Playback produced silence.');
  const out = new Float32Array(samples.length);
  const gain = target / peak;
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

export function peakStats(samples) {
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const value = Math.abs(samples[i]);
    if (value > peak) peak = value;
    sum += samples[i] * samples[i];
  }
  return { peak, rms: Math.sqrt(sum / samples.length) };
}
