// Lazy-load Spotify Basic Pitch when the upload panel opens. Fall back to YIN.

import { analyzePitchYin, detectOnsets, midiToHz, resample } from './dsp.js';

export const BASIC_PITCH_MODEL_URL = '/models/basic-pitch/model.json';
export const BASIC_PITCH_MODEL_BYTES = 916929;
export const BASIC_PITCH_RATE = 22050;

let loading = null;
let lastLoad = null;

export function lastModelLoad() {
  return lastLoad;
}

export async function loadPitchModel(options = {}) {
  if (loading) return loading;
  const load = fetchAndCreate(options);
  loading = load;
  try {
    return await load;
  } finally {
    loading = null;
  }
}

async function fetchAndCreate(options) {
  const url = options.modelUrl || BASIC_PITCH_MODEL_URL;
  const started = Date.now();
  let modelBytes = 0;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    const len = Number(res.headers.get('content-length') || 0);
    if (len) modelBytes += len;
  } catch {
    // HEAD may be blocked; fall through to the known size.
  }
  try {
    const { BasicPitch } = await import('@spotify/basic-pitch');
    const model = options.graph
      ? new BasicPitch(Promise.resolve(options.graph))
      : new BasicPitch(url);
    lastLoad = {
      ok: true,
      source: 'basic-pitch',
      modelBytes: modelBytes || BASIC_PITCH_MODEL_BYTES,
      modelKiB: Math.round((modelBytes || BASIC_PITCH_MODEL_BYTES) / 1024),
      ms: Date.now() - started,
    };
    return { ok: true, model, ...lastLoad };
  } catch (err) {
    lastLoad = { ok: false, source: 'yin', reason: err?.message || 'model failed', modelBytes: BASIC_PITCH_MODEL_BYTES };
    return lastLoad;
  }
}

export function audioForBasicPitch(samples, sampleRate) {
  return resample(samples, sampleRate, BASIC_PITCH_RATE);
}

export function pitchFromNotes(notes) {
  if (!notes?.length) return { pitched: false, f0Hz: null, midi: null };
  const ranked = notes.slice().sort((a, b) => {
    const score = (n) => (n.durationSeconds || 0) * (n.amplitude || 1);
    return score(b) - score(a);
  });
  const best = ranked[0];
  const midi = Number(best.pitchMidi);
  if (!Number.isFinite(midi)) return { pitched: false, f0Hz: null, midi: null };
  return { pitched: true, f0Hz: midiToHz(midi), midi, notes };
}

export function onsetTimesFromNotes(notes) {
  const times = [];
  const sorted = (notes || []).slice().sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
  for (const note of sorted) {
    const t = Number(note.startTimeSeconds);
    if (!Number.isFinite(t)) continue;
    if (!times.length || t - times[times.length - 1] > 0.06) times.push(t);
  }
  return times;
}

export async function notesFromModelWindows(frames, onsets, contours) {
  const { addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly } = await import('@spotify/basic-pitch');
  return noteFramesToTime(
    addPitchBendsToNoteEvents(
      contours,
      outputToNotesPoly(frames, onsets, 0.25, 0.25, 5),
    ),
  );
}

export async function runBasicPitch(samples, sampleRate, model) {
  if (!model || typeof model.evaluateModel !== 'function') {
    throw new Error('Basic Pitch model is not loaded.');
  }
  const audio = audioForBasicPitch(samples, sampleRate);
  const frames = [];
  const onsets = [];
  const contours = [];
  await model.evaluateModel(
    audio,
    (f, o, c) => {
      frames.push(...f);
      onsets.push(...o);
      contours.push(...c);
    },
    () => {},
  );
  const notes = await notesFromModelWindows(frames, onsets, contours);
  const pitch = pitchFromNotes(notes);
  const times = onsetTimesFromNotes(notes);
  return {
    pitched: pitch.pitched,
    f0Hz: pitch.f0Hz,
    midi: pitch.midi,
    onsets: times.length ? times : detectOnsets(samples, sampleRate),
    notes,
    source: 'basic-pitch',
  };
}

export async function analyzeWithModel(samples, sampleRate, loaded) {
  if (loaded?.ok && loaded.model) {
    try {
      return await runBasicPitch(samples, sampleRate, loaded.model);
    } catch {
      // fall through to YIN
    }
  }
  const yin = analyzePitchYin(samples, sampleRate);
  return { ...yin, onsets: detectOnsets(samples, sampleRate), source: 'yin' };
}

export function disposeTensors(items) {
  let disposed = 0;
  for (const item of items || []) {
    if (item && typeof item.dispose === 'function') {
      try {
        item.dispose();
        disposed += 1;
      } catch {
        // already disposed
      }
    }
  }
  return disposed;
}
