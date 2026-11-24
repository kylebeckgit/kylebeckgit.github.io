import { encodeWav16 } from './wav16.js';
import { finishProcessedClip, prepareUploadSamples, rejectIfTooLarge } from './process.js';
import { analyzeWithModel, BASIC_PITCH_MODEL_BYTES, lastModelLoad, loadPitchModel } from './pitch-model.js';

export function createUploadLock() {
  let phase = 'idle';
  let generation = 0;

  function canStart(next) {
    return phase === 'idle' && (next === 'arming' || next === 'submitting');
  }

  function canAdvance(next) {
    if (phase === 'arming') return next === 'recording' || next === 'submitting';
    if (phase === 'recording') return next === 'submitting';
    return false;
  }

  return {
    get phase() { return phase; },
    get idle() { return phase === 'idle'; },
    get blocked() { return phase !== 'idle'; },
    enter(next) {
      if (!canStart(next)) return 0;
      phase = next;
      generation += 1;
      return generation;
    },
    advance(token, next) {
      if (token !== generation || !canAdvance(next)) return 0;
      phase = next;
      return token;
    },
    release(token) {
      if (!token || token !== generation || phase === 'idle') return false;
      phase = 'idle';
      generation += 1;
      return true;
    },
  };
}

export async function withUploadErrorStatus(fn, setStatus, fallback = 'The recording could not be sent.') {
  try {
    return await fn();
  } catch (err) {
    setStatus(err?.message || fallback);
    return null;
  }
}

const RAW_SECONDS = 8;

export function httpUrlFromWs(wsUrl) {
  return String(wsUrl || '').replace(/^ws/i, 'http');
}

export function mountUploadPanel(root, options = {}) {
  if (!root) return null;
  const statusEl = root.querySelector('[data-upload-status]');
  const fileInput = root.querySelector('[data-upload-file]');
  const recordBtn = root.querySelector('[data-upload-record]');
  const stopBtn = root.querySelector('[data-upload-stop]');
  const consent = root.querySelector('[data-upload-consent]');
  const keepOpt = root.querySelector('[data-upload-keep]');
  const listEl = root.querySelector('[data-upload-list]');
  const client = options.client;
  let model = null;
  let recording = null;
  let opened = false;
  const lock = options.lock || createUploadLock();

  function setRecordEnabled(on) {
    if (recordBtn) recordBtn.disabled = !on;
  }

  function setStopEnabled(on) {
    if (stopBtn) stopBtn.disabled = !on;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function syncControls() {
    const idle = lock.phase === 'idle';
    setRecordEnabled(idle);
    setStopEnabled(lock.phase === 'recording');
    if (fileInput) fileInput.disabled = !idle;
  }

  async function ensureModel() {
    if (opened && model) return model;
    opened = true;
    setStatus('Loading the pitch model.');
    model = await loadPitchModel();
    const load = lastModelLoad();
    const kib = load?.modelKiB || Math.round(BASIC_PITCH_MODEL_BYTES / 1024);
    if (model?.ok) setStatus(`Pitch model ready, ${kib} KiB. Fallback is YIN if it fails.`);
    else setStatus('Using the built-in pitch fallback.');
    return model;
  }

  root.addEventListener('toggle', () => {
    if (root.open) ensureModel();
  });
  root.addEventListener('pointerdown', () => { ensureModel(); }, { once: true });
  if (root.matches && root.matches('section')) {
    // non-details container still lazy-loads on first interaction
  }

  async function captureFile(file) {
    const tooBig = rejectIfTooLarge(file.size);
    if (tooBig) { setStatus(tooBig); return; }
    const ctx = options.getAudioContext?.();
    if (!ctx) { setStatus('Start the jam before uploading.'); return; }
    const bytes = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    const samples = mixDown(decoded);
    return { samples, sampleRate: decoded.sampleRate, source: 'file' };
  }

  async function submit(samples, sampleRate, source) {
    try {
    if (!consent?.checked) {
      setStatus('Confirm that you have the right to share this sound.');
      return;
    }
    if (!client?.userId || client.mode !== 'room') {
      setStatus('Join the room before uploading.');
      return;
    }
    setStatus('Preparing the sound.');
    const prepared = prepareUploadSamples(samples, sampleRate);
    if (!prepared.ok) { setStatus(prepared.reason); return; }
    if (prepared.usedBestWindow) setStatus('Using the best 4 seconds.');
    const loaded = await ensureModel();
    const analysis = await analyzeWithModel(prepared.samples, prepared.sampleRate, loaded);
    const processed = finishProcessedClip(prepared.samples, prepared.sampleRate, options.getRoomState?.() || client.state, {
      pitch: analysis,
      onsets: analysis.onsets,
      speech: Boolean(options.speechHint),
    });
    if (!processed.ok) { setStatus(processed.reason); return; }
    const wav = encodeWav16(processed.samples, processed.sampleRate);
    const meta = {
      ...processed.meta,
      consent: true,
      keepOptIn: Boolean(keepOpt?.checked),
      source,
      clientVersion: '1',
    };
    setStatus('Uploading.');
    const result = await options.upload?.(wav, meta);
    if (!result?.ok) {
      setStatus(result?.reason || 'The upload was not accepted.');
      return;
    }
    if (result.status === 'pending') setStatus('Held for review. It will play if review comes back.');
    else setStatus('In the room.');
    } catch (err) {
      setStatus(err?.message || (source === 'file' ? 'That file could not be read.' : 'The recording could not be sent.'));
    }
  }

  fileInput?.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const token = lock.enter('submitting');
    if (!token) {
      setStatus('Wait for the current sound to finish.');
      return;
    }
    syncControls();
    try {
      const captured = await captureFile(file);
      if (captured) await submit(captured.samples, captured.sampleRate, 'file');
    } catch (err) {
      setStatus(err?.message || 'That file could not be read.');
    } finally {
      lock.release(token);
      syncControls();
    }
  });

  recordBtn?.addEventListener('click', async () => {
    const token = lock.enter('arming');
    if (!token) return;
    syncControls();
    let stream;
    let started = false;
    try {
      const ctx = options.getAudioContext?.();
      if (!ctx) { setStatus('Start the jam before recording.'); return; }
      await ctx.resume?.();
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      recording = startCapture(ctx, stream, RAW_SECONDS, async (samples, sampleRate) => {
        recording = null;
        try {
          if (!samples) { setStatus('Recording cancelled.'); return; }
          if (!lock.advance(token, 'submitting')) return;
          syncControls();
          await withUploadErrorStatus(
            () => submit(samples, sampleRate, 'mic'),
            setStatus,
            'The recording could not be sent.',
          );
        } catch (err) {
          setStatus(err?.message || 'The recording could not be sent.');
        } finally {
          lock.release(token);
          syncControls();
        }
      });
      started = true;
      lock.advance(token, 'recording');
      syncControls();
      setStatus('Recording, up to 8 seconds; the best 4 seconds go into the room.');
    } catch (err) {
      setStatus(err?.message || 'The microphone is not available.');
    } finally {
      if (!started) {
        if (stream) {
          try { for (const track of stream.getTracks()) track.stop(); } catch { /* already */ }
        }
        lock.release(token);
        syncControls();
      }
    }
  });

  stopBtn?.addEventListener('click', () => {
    recording?.stop();
  });

  function renderList(uploads, muted) {
    if (!listEl) return;
    listEl.replaceChildren();
    if (!uploads?.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No shared sounds in the room yet.';
      listEl.append(empty);
      return;
    }
    for (const clip of uploads) {
      const row = document.createElement('div');
      row.className = 'clip';
      row.dataset.id = clip.id;
      const label = document.createElement('span');
      label.textContent = clip.meta?.speech ? 'Voice clip' : (clip.meta?.kind === 'unpitched' ? 'Hit clip' : 'Pitched clip');
      const mute = document.createElement('button');
      mute.type = 'button';
      mute.className = 'btn';
      mute.textContent = muted?.has?.(clip.id) ? 'Unmute' : 'Mute';
      mute.addEventListener('click', () => options.onMute?.(clip.id));
      const report = document.createElement('button');
      report.type = 'button';
      report.className = 'btn';
      report.textContent = 'Report';
      report.addEventListener('click', () => options.onReport?.(clip.id));
      row.append(label, mute, report);
      listEl.append(row);
    }
  }

  syncControls();
  return { ensureModel, renderList, setStatus, lock, syncControls };
}

function mixDown(buffer) {
  const channels = buffer.numberOfChannels;
  const length = buffer.length;
  const out = new Float32Array(length);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) out[i] += data[i] / channels;
  }
  return out;
}

function startCapture(ctx, stream, maxSeconds, done) {
  const src = ctx.createMediaStreamSource(stream);
  const rec = ctx.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  const silent = ctx.createGain();
  silent.gain.value = 0;
  src.connect(rec);
  rec.connect(silent);
  silent.connect(ctx.destination);
  const started = ctx.currentTime;
  rec.onaudioprocess = (event) => {
    chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    if (ctx.currentTime - started >= maxSeconds) stop();
  };
  let stopped = false;
  function stop(cancelled) {
    if (stopped) return;
    stopped = true;
    try { rec.disconnect(); } catch { /* already */ }
    try { src.disconnect(); } catch { /* already */ }
    for (const track of stream.getTracks()) track.stop();
    if (cancelled) {
      done(null, ctx.sampleRate);
      return;
    }
    let length = 0;
    for (const part of chunks) length += part.length;
    const samples = new Float32Array(length);
    let offset = 0;
    for (const part of chunks) {
      samples.set(part, offset);
      offset += part.length;
    }
    done(samples, ctx.sampleRate);
  }
  return { stop: () => stop(false), cancel: () => stop(true) };
}
