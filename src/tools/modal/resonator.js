// Two-pole modal resonator.
// Decay in the profile is T60: the time for that partial to fall 60 dB.
// This approximates Zebra 3's modal resonator. It is not verified against Zebra.

export function strikeWeight(index, position) {
  // String-like mode shape. n is the partial's place in the list, not a measured Zebra mode.
  // sin(pi * n * position) is an approximation, and a poor one for bells and plates.
  const n = index + 1;
  const pos = Math.min(0.98, Math.max(0.02, Number(position) || 0));
  return Math.abs(Math.sin(Math.PI * n * pos));
}

export function modeCoeffs(freq, t60, sampleRate) {
  const safe = Math.min(60, Math.max(0.02, Number(t60) || 0.02));
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
  const exciter = options.exciter || 'click';
  const continuous = exciter === 'bow' || exciter === 'file';
  const modes = [];
  let ampSum = 0;
  for (let index = 0; index < partials.length; index++) {
    const partial = partials[index];
    const freq = options.fundamental * partial.ratio;
    if (!(freq >= 20) || freq > sampleRate * 0.45 || partial.gainDb < -90) continue;
    const amp = 10 ** (partial.gainDb / 20) * strikeWeight(index, position) * velocity;
    if (!(amp > 0)) continue;
    ampSum += amp;
    const coeff = modeCoeffs(freq, partial.decay, sampleRate);
    // The bare two-pole peaks near 1/sin(theta). Scale that out so GainDB is the
    // partial's level. Continuous noise still grows with Q, so bowing is scaled
    // back by the pole radius and keeps following GainDB.
    const sine = Math.max(1e-4, Math.sin((2 * Math.PI * freq) / sampleRate));
    const radius = continuous ? Math.sqrt(Math.max(1 - coeff.R * coeff.R, 1e-8)) : 1;
    modes.push({ a1: coeff.a1, a2: coeff.a2, feed: amp * sine * radius, y1: 0, y2: 0 });
  }
  const bowCutoff = 3200;
  return {
    modes,
    norm: 0.45 / Math.max(ampSum, 1e-8),
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
  };
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
  const input = nextExciter(state);
  let sum = 0;
  const modes = state.modes;
  for (let i = 0; i < modes.length; i++) {
    const mode = modes[i];
    const y = mode.feed * input + mode.a1 * mode.y1 + mode.a2 * mode.y2;
    mode.y2 = mode.y1;
    mode.y1 = Math.abs(y) < 1e-20 ? 0 : y;
    sum += mode.y1;
  }
  const shaped = Math.tanh(sum * state.norm);
  return shaped > 0.99 ? 0.99 : shaped < -0.99 ? -0.99 : shaped;
}

export function renderPreview(partials, options) {
  const sampleRate = options.sampleRate || 44100;
  const seconds = options.seconds || 3;
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

export function workletSource() {
  const source = [strikeWeight, modeCoeffs, noiseSample, malletTable, createVoice, nextExciter, processSample]
    .map((fn) => fn.toString())
    .join('\n');
  return `${source}
class ModalBank extends AudioWorkletProcessor {
  constructor() {
    super();
    this.voice = null;
    this.file = null;
    this.port.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === 'file') {
        this.file = new Float32Array(msg.buffer);
        if (this.voice) this.voice.file = this.file;
        return;
      }
      if (msg.type === 'stop') {
        this.voice = null;
        return;
      }
      if (msg.type === 'up') {
        if (this.voice) this.voice.holding = false;
        return;
      }
      if (msg.type === 'down' || msg.type === 'configure') {
        const previous = this.voice;
        const next = createVoice(msg.partials, {
          fundamental: msg.fundamental,
          velocity: msg.velocity,
          position: msg.position,
          exciter: msg.exciter,
          hardness: msg.hardness,
          file: this.file,
        }, sampleRate);
        if (msg.type === 'configure') {
          if (!previous) return;
          next.holding = previous.holding;
          next.pos = previous.pos;
          next.noise = previous.noise;
          next.env = previous.env;
          next.lp = previous.lp;
          next.filePos = previous.filePos;
          const count = Math.min(previous.modes.length, next.modes.length);
          for (let i = 0; i < count; i++) {
            next.modes[i].y1 = previous.modes[i].y1;
            next.modes[i].y2 = previous.modes[i].y2;
          }
        }
        this.voice = next;
      }
    };
  }
  process(inputs, outputs) {
    const channel = outputs[0][0];
    if (!channel) return true;
    if (!this.voice) {
      channel.fill(0);
      return true;
    }
    for (let i = 0; i < channel.length; i++) channel[i] = processSample(this.voice);
    return true;
  }
}
registerProcessor('modal-bank', ModalBank);
`;
}
