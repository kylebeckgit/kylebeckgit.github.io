// Automatic upload moderation. Fail closed if Workers AI is unavailable.

export const WHISPER_MODEL = '@cf/openai/whisper';
export const GUARD_MODEL = '@cf/meta/llama-guard-3-8b';

// Whole-word list of slurs and clear abuse. Kept short and explicit so
// obvious cases are caught even if the model is unsure.
const BLOCKLIST = [
  'nigger', 'niggers', 'faggot', 'faggots', 'kike', 'kikes',
  'spic', 'spics', 'retard', 'retards', 'tranny', 'trannies',
  'wetback', 'chink', 'chinks', 'gook', 'gooks',
];

const LATIN_WORD = /[a-z0-9']+/g;
const LETTER_RUN = /\p{L}+/gu;

// Tokens Whisper often emits for silence or non-speech beds.
const WHISPER_NOISE_PHRASES = new Set([
  'you',
  'music',
  'applause',
  'laughter',
  'cheers',
  'silence',
  'inaudible',
  'blank audio',
  'blank_audio',
  'thank you',
  'thanks for watching',
  'thank you for watching',
  'please subscribe',
  'subscribe',
  'the end',
]);

const WHISPER_NOISE_WORDS = new Set([
  'you', 'music', 'applause', 'laughter', 'cheers', 'silence', 'inaudible',
  'blank', 'audio', 'blank_audio', 'thank', 'thanks', 'for', 'watching',
  'please', 'subscribe', 'the', 'end',
]);

export function normalizeTranscript(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
}

export function findBlockedTerms(text) {
  const words = normalizeTranscript(text).match(LATIN_WORD) || [];
  return BLOCKLIST.filter((term) => words.includes(term));
}

export function whisperTranscript(result) {
  if (result == null) return '';
  if (typeof result === 'string') return result.trim();
  const direct = result.text ?? result.transcript ?? result.transcription ?? '';
  if (Array.isArray(direct)) return direct.map((part) => String(part || '')).join(' ').trim();
  if (String(direct).trim()) return String(direct).trim();
  const parts = result.words || result.segments;
  if (Array.isArray(parts)) {
    return parts.map((part) => part?.word || part?.text || '').join(' ').trim();
  }
  return '';
}

export function isWhisperNoise(transcript) {
  const text = String(transcript || '').normalize('NFKC').trim();
  if (!text) return true;
  const lower = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const stripped = lower
    .replace(/[\p{P}\p{S}\p{Z}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return true;
  if (/^[0-9]+(?:\s+[0-9]+)*$/.test(stripped)) return false;
  if (WHISPER_NOISE_PHRASES.has(stripped) || WHISPER_NOISE_PHRASES.has(lower)) return true;
  const words = stripped.split(' ').filter(Boolean);
  return words.length > 0 && words.every((word) => WHISPER_NOISE_WORDS.has(word));
}

export function looksLikeSpeech(transcript) {
  if (isWhisperNoise(transcript)) return false;
  const text = String(transcript || '').normalize('NFKC');
  return (text.match(LETTER_RUN) || []).length > 0;
}

export function isSpeechishTranscript(transcript) {
  if (isWhisperNoise(transcript)) return false;
  return String(transcript || '').normalize('NFKC').trim().length > 0;
}

export function guardIsUnsafe(result) {
  const text = typeof result === 'string'
    ? result
    : (result?.response || result?.result || result?.text || JSON.stringify(result || ''));
  const lower = String(text).toLowerCase();
  if (!lower.trim()) return true; // fail closed on empty
  if (/\bunsafe\b/.test(lower)) return true;
  if (/\bsafe\b/.test(lower) && !/\bunsafe\b/.test(lower)) return false;
  return true;
}

export async function moderateClip(wavBytes, options = {}) {
  const ai = options.ai;
  const mock = options.mock;
  if (mock) return applyMock(mock, options);
  if (!ai || typeof ai.run !== 'function') {
    return { ok: false, status: 'pending', reason: 'Review is temporarily unavailable.', failClosed: true };
  }
  let transcript = '';
  try {
    const whisper = await ai.run(WHISPER_MODEL, { audio: Array.from(new Uint8Array(wavBytes)) });
    transcript = whisperTranscript(whisper);
  } catch (err) {
    return { ok: false, status: 'pending', reason: 'Review is temporarily unavailable.', failClosed: true, error: String(err?.message || err) };
  }
  const blocked = findBlockedTerms(transcript);
  if (blocked.length) {
    return { ok: false, status: 'rejected', reason: 'That upload was not allowed.', speech: true, transcript: '' };
  }
  const speech = isSpeechishTranscript(transcript);
  if (speech) {
    try {
      const guard = await ai.run(GUARD_MODEL, {
        messages: [{ role: 'user', content: transcript.slice(0, 2000) }],
        max_tokens: 64,
      });
      if (guardIsUnsafe(guard)) {
        return { ok: false, status: 'rejected', reason: 'That upload was not allowed.', speech: true, transcript: '' };
      }
    } catch (err) {
      return { ok: false, status: 'pending', reason: 'Review is temporarily unavailable.', failClosed: true, error: String(err?.message || err) };
    }
  }
  return { ok: true, status: 'approved', speech, transcript: speech ? '' : undefined };
}

function applyMock(mock) {
  if (mock === 'down') return { ok: false, status: 'pending', reason: 'Review is temporarily unavailable.', failClosed: true };
  if (mock === 'reject' || mock === 'unsafe') return { ok: false, status: 'rejected', reason: 'That upload was not allowed.', speech: true };
  if (mock === 'speech') return { ok: true, status: 'approved', speech: true };
  if (mock === 'blocklist') return { ok: false, status: 'rejected', reason: 'That upload was not allowed.', speech: true };
  return { ok: true, status: 'approved', speech: false };
}
