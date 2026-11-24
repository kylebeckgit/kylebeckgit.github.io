import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findBlockedTerms,
  guardIsUnsafe,
  isSpeechishTranscript,
  isWhisperNoise,
  looksLikeSpeech,
  moderateClip,
  whisperTranscript,
} from './moderation.js';

describe('upload moderation', () => {
  it('detects speech and blocked terms, and reads Llama Guard labels', () => {
    assert.equal(looksLikeSpeech('hello world'), true);
    assert.equal(looksLikeSpeech('hello'), true);
    assert.equal(looksLikeSpeech('Help!'), true);
    assert.equal(looksLikeSpeech(''), false);
    assert.equal(looksLikeSpeech('a'), true);
    assert.equal(looksLikeSpeech('   ...  '), false);
    assert.equal(looksLikeSpeech('[Music]'), false);
    assert.equal(looksLikeSpeech('you'), false);
    assert.equal(looksLikeSpeech('hola amigos'), true);
    assert.equal(looksLikeSpeech('привет'), true);
    assert.equal(looksLikeSpeech('こんにちは'), true);
    assert.equal(looksLikeSpeech('مرحبا'), true);
    assert.equal(isWhisperNoise('...'), true);
    assert.equal(isWhisperNoise('[Music]'), true);
    assert.equal(isWhisperNoise('Thanks for watching.'), true);
    assert.equal(isSpeechishTranscript('123'), true);
    assert.equal(isSpeechishTranscript('!!!'), false);
    assert.equal(isSpeechishTranscript('hola'), true);
    assert.equal(whisperTranscript({ words: [{ word: 'hola' }, { word: 'amigos' }] }), 'hola amigos');
    assert.ok(findBlockedTerms('that slur is nigger here').length);
    assert.equal(findBlockedTerms('a friendly jam').length, 0);
    assert.equal(guardIsUnsafe({ response: 'safe' }), false);
    assert.equal(guardIsUnsafe({ response: 'unsafe\nS1' }), true);
    assert.equal(guardIsUnsafe(''), true);
  });

  it('approves a clean clip, flags passing speech, and rejects unsafe or blocked speech', async () => {
    const pass = await moderateClip(new Uint8Array([1, 2, 3]), { mock: 'pass' });
    assert.equal(pass.status, 'approved');
    assert.equal(pass.speech, false);
    const speech = await moderateClip(new Uint8Array([1, 2, 3]), { mock: 'speech' });
    assert.equal(speech.status, 'approved');
    assert.equal(speech.speech, true);
    const unsafe = await moderateClip(new Uint8Array([1, 2, 3]), { mock: 'unsafe' });
    assert.equal(unsafe.status, 'rejected');
  });

  it('fails closed when AI is down or missing, without approving', async () => {
    const down = await moderateClip(new Uint8Array([1]), { mock: 'down' });
    assert.equal(down.ok, false);
    assert.equal(down.status, 'pending');
    assert.equal(down.failClosed, true);
    const missing = await moderateClip(new Uint8Array([1]), { ai: null });
    assert.equal(missing.status, 'pending');
    assert.equal(missing.failClosed, true);
    const throwing = await moderateClip(new Uint8Array([1]), {
      ai: { run: async () => { throw new Error('no neurons'); } },
    });
    assert.equal(throwing.status, 'pending');
    assert.equal(throwing.ok, false);
  });

  it('uses whisper then guard for speech, and rejects on the blocklist without calling guard', async () => {
    const calls = [];
    const ai = {
      run: async (model, input) => {
        calls.push({ model, input });
        if (model.includes('whisper')) return { text: 'hello room' };
        return { response: 'safe' };
      },
    };
    const result = await moderateClip(new Uint8Array([1, 2, 3, 4]), { ai });
    assert.equal(result.status, 'approved');
    assert.equal(result.speech, true);
    assert.equal(calls.length, 2);

    const blockedCalls = [];
    const blockedAi = {
      run: async (model) => {
        blockedCalls.push(model);
        return { text: 'you nigger' };
      },
    };
    const blocked = await moderateClip(new Uint8Array([9]), { ai: blockedAi });
    assert.equal(blocked.status, 'rejected');
    assert.equal(blockedCalls.length, 1);

    const oneWordCalls = [];
    const oneWordAi = {
      run: async (model, input) => {
        oneWordCalls.push(model);
        if (model.includes('whisper')) return { text: 'hello' };
        return { response: 'safe' };
      },
    };
    const oneWord = await moderateClip(new Uint8Array([1]), { ai: oneWordAi });
    assert.equal(oneWord.status, 'approved');
    assert.equal(oneWord.speech, true);
    assert.equal(oneWordCalls.some((model) => model.includes('llama-guard')), true);

    const slurCalls = [];
    const slurAi = {
      run: async (model) => {
        slurCalls.push(model);
        return { text: 'nigger' };
      },
    };
    const slur = await moderateClip(new Uint8Array([1]), { ai: slurAi });
    assert.equal(slur.status, 'rejected');
    assert.equal(slurCalls.length, 1);
    assert.equal(slurCalls.some((model) => model.includes('llama-guard')), false);
  });

  it('sends non-English speech and numeric transcripts through Llama Guard, and skips Whisper silence tokens', async () => {
    const transcripts = ['hola amigos', 'привет мир', 'こんにちは', 'مرحبا'];
    for (const text of transcripts) {
      const calls = [];
      const ai = {
        run: async (model) => {
          calls.push(model);
          if (model.includes('whisper')) return { text };
          return { response: 'safe' };
        },
      };
      const result = await moderateClip(new Uint8Array([1]), { ai });
      assert.equal(result.status, 'approved', text);
      assert.equal(result.speech, true, text);
      assert.equal(calls.some((model) => model.includes('llama-guard')), true, text);
    }

    const wordsOnly = {
      run: async (model) => {
        if (model.includes('whisper')) return { words: [{ word: 'ありがとう' }] };
        return { response: 'safe' };
      },
    };
    const fromWords = await moderateClip(new Uint8Array([1]), { ai: wordsOnly });
    assert.equal(fromWords.status, 'approved');
    assert.equal(fromWords.speech, true);

    const numericCalls = [];
    const numericAi = {
      run: async (model) => {
        numericCalls.push(model);
        if (model.includes('whisper')) return { text: '2024' };
        return { response: 'safe' };
      },
    };
    const numeric = await moderateClip(new Uint8Array([1]), { ai: numericAi });
    assert.equal(numeric.status, 'approved');
    assert.equal(numeric.speech, true);
    assert.equal(numericCalls.some((model) => model.includes('llama-guard')), true);

    const silenceCalls = [];
    const silenceAi = {
      run: async (model) => {
        silenceCalls.push(model);
        return { text: '[Music]' };
      },
    };
    const silence = await moderateClip(new Uint8Array([1]), { ai: silenceAi });
    assert.equal(silence.status, 'approved');
    assert.equal(silence.speech, false);
    assert.equal(silenceCalls.some((model) => model.includes('llama-guard')), false);

    const guardDown = {
      run: async (model) => {
        if (model.includes('whisper')) return { text: 'hola' };
        throw new Error('timeout');
      },
    };
    const failed = await moderateClip(new Uint8Array([1]), { ai: guardDown });
    assert.equal(failed.status, 'pending');
    assert.equal(failed.failClosed, true);
    assert.equal(failed.ok, false);
  });
});
