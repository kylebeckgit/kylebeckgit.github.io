// Map an analyzed clip onto the room key, scale and 16th grid.

import { crowdScale, KEY_MIDI, quantizeNextSixteenth } from '../../../../workers/jam-room/src/logic.js';
import { centsBetween, hzToMidi, midiToHz } from './dsp.js';

export function nearestScaleMidi(f0Hz, keyRoot, mood) {
  const midi = hzToMidi(f0Hz);
  const root = KEY_MIDI[keyRoot] ?? 50;
  const scale = crowdScale(mood);
  let best = root + scale[0];
  let bestDist = Infinity;
  for (let oct = -2; oct <= 3; oct++) {
    for (const semi of scale) {
      const cand = root + oct * 12 + semi;
      const dist = Math.abs(cand - midi);
      if (dist < bestDist) {
        best = cand;
        bestDist = dist;
      }
    }
  }
  return { midi: best, hz: midiToHz(best), cents: centsBetween(f0Hz, midiToHz(best)), recordedMidi: midi };
}

export function playbackRateToMidi(fromMidi, toMidi) {
  return 2 ** ((toMidi - fromMidi) / 12);
}

export function clampRateForPlay(fromMidi, toMidi) {
  let target = toMidi;
  // Keep playback within +/- 7 semitones; otherwise use an octave copy.
  while (target - fromMidi > 7) target -= 12;
  while (fromMidi - target > 7) target += 12;
  return { midi: target, rate: playbackRateToMidi(fromMidi, target) };
}

export function quantizeOnsetBeats(onsetSeconds, state, nowMs, offsetMs = 0) {
  const fakeState = { ...state };
  // Treat onset as a time relative to now, then snap that beat position.
  const atMs = nowMs + onsetSeconds * 1000;
  return quantizeNextSixteenth(fakeState, atMs - 1, offsetMs);
}

export function pickBestSlices(hits, state) {
  if (!hits.length) return [];
  // Prefer a spread of slots and stronger (longer or later) hits, cap at 8.
  const ranked = hits.slice().sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs));
  const picked = [];
  const used = new Set();
  for (const slot of ['kick', 'snare', 'hat']) {
    const hit = ranked.find((h) => h.slot === slot && !used.has(h));
    if (hit) {
      picked.push(hit);
      used.add(hit);
    }
  }
  for (const hit of ranked) {
    if (picked.length >= 8) break;
    if (!used.has(hit)) {
      picked.push(hit);
      used.add(hit);
    }
  }
  return picked.map((h) => ({ startMs: h.startMs, endMs: h.endMs, slot: h.slot }));
}
