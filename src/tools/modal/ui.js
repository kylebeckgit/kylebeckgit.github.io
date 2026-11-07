import { PRESETS, NOTE_BUTTONS, buildPartials, toCsv, fromCsv, noteFrequency, defaultControls, sanitizeControls } from './engine.js';
import { workletSource } from './resonator.js';
import { analyzeSamples, decodeRecording, resampleMono } from './analyze.js';

export function mount(root) {
  const describeUrl = (root.dataset.describeUrl || '').trim();
  const membershipOn = root.dataset.membership === 'true';
  const state = {
    controls: defaultControls(),
    partials: buildPartials(defaultControls()),
    custom: false,
    note: 'A4',
    audio: null,
    node: null,
    workletReady: false,
    workletFailed: false,
    fallback: [],
    exciter: 'click',
    hardness: 0.5,
    velocity: 0.8,
    position: 0.18,
    file: null,
    recording: null,
    drawMode: false,
    undo: [],
    redo: [],
    gesture: null,
    scale: null,
  };

  root.querySelector('[data-presets]').innerHTML = PRESETS.map((preset) => `<option value="${preset.id}">${preset.label}</option>`).join('');
  root.querySelector('[data-keys]').innerHTML = NOTE_BUTTONS.map((name) => `<button type="button" class="btn key" data-note="${name}">${name.replace('#', '♯')}</button>`).join('');

  const fields = {
    preset: root.querySelector('[data-presets]'),
    stiffness: root.querySelector('[data-stiffness]'),
    brightness: root.querySelector('[data-brightness]'),
    damping: root.querySelector('[data-damping]'),
    oddEven: root.querySelector('[data-odd-even]'),
    seed: root.querySelector('[data-seed]'),
  };
  const readouts = {
    stiffness: root.querySelector('[data-stiffness-out]'),
    brightness: root.querySelector('[data-brightness-out]'),
    damping: root.querySelector('[data-damping-out]'),
    oddEven: root.querySelector('[data-odd-even-out]'),
  };
  const canvas = root.querySelector('canvas');
  const tableBody = root.querySelector('[data-partials]');
  const describe = root.querySelector('[data-describe]');
  const describeButton = root.querySelector('[data-describe-btn]');
  const describeText = root.querySelector('[data-describe-text]');
  const describeMsg = root.querySelector('[data-describe-msg]');
  const hardnessField = root.querySelector('[data-hardness-field]');
  const fileField = root.querySelector('[data-file-field]');
  const analyzeMsg = root.querySelector('[data-analyze-msg]');
  const undoButton = root.querySelector('[data-undo]');
  const redoButton = root.querySelector('[data-redo]');
  const drawButton = root.querySelector('[data-draw]');

  if (describeUrl) describe.hidden = false;
  const licenseField = root.querySelector('[data-license]');
  const licenseInput = root.querySelector('[data-license-key]');
  if (describeUrl && membershipOn && licenseField) licenseField.hidden = false;

  function readControls() {
    state.controls = sanitizeControls({
      preset: fields.preset.value,
      stiffness: fields.stiffness.value,
      brightness: fields.brightness.value,
      damping: fields.damping.value,
      oddEven: fields.oddEven.value,
      seed: fields.seed.value,
    });
    readouts.stiffness.textContent = state.controls.stiffness.toFixed(2);
    readouts.brightness.textContent = state.controls.brightness.toFixed(2);
    readouts.damping.textContent = state.controls.damping.toFixed(2);
    readouts.oddEven.textContent = state.controls.oddEven.toFixed(2);
  }

  function readPlayControls() {
    state.exciter = root.querySelector('[data-exciter]').value;
    state.hardness = Number(root.querySelector('[data-hardness]').value);
    state.velocity = Number(root.querySelector('[data-velocity]').value);
    state.position = Number(root.querySelector('[data-position]').value);
    root.querySelector('[data-hardness-out]').textContent = state.hardness.toFixed(2);
    root.querySelector('[data-velocity-out]').textContent = state.velocity.toFixed(2);
    root.querySelector('[data-position-out]').textContent = state.position.toFixed(2);
    root.querySelector('[data-threshold-out]').textContent = root.querySelector('[data-threshold]').value;
    hardnessField.hidden = state.exciter !== 'mallet';
    fileField.hidden = state.exciter !== 'file';
  }

  function snapshot() {
    return state.partials.map((partial) => ({ ...partial }));
  }

  function pushHistory() {
    state.undo.push(snapshot());
    if (state.undo.length > 50) state.undo.shift();
    state.redo = [];
    updateHistoryButtons();
  }

  function restore(partials) {
    state.partials = partials.map((partial) => ({ ...partial }));
    state.custom = true;
    render();
    pushModes();
  }

  function undo() {
    const previous = state.undo.pop();
    if (!previous) return;
    state.redo.push(snapshot());
    restore(previous);
    updateHistoryButtons();
  }

  function redo() {
    const next = state.redo.pop();
    if (!next) return;
    state.undo.push(snapshot());
    restore(next);
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    undoButton.disabled = state.undo.length === 0;
    redoButton.disabled = state.redo.length === 0;
  }

  function rebuild() {
    readControls();
    state.partials = buildPartials(state.controls);
    state.custom = false;
    render();
    pushModes();
  }

  function render() {
    draw(canvas, state.partials, state);
    tableBody.innerHTML = state.partials.map((partial, index) => `
      <tr>
        <th scope="row">${index + 1}</th>
        <td><input type="number" step="0.0001" min="0.0001" data-index="${index}" data-field="ratio" value="${partial.ratio.toFixed(4)}" aria-label="Partial ${index + 1} ratio"></td>
        <td><input type="number" step="0.01" data-index="${index}" data-field="gainDb" value="${partial.gainDb.toFixed(2)}" aria-label="Partial ${index + 1} gain"></td>
        <td><input type="number" step="0.001" min="0.001" data-index="${index}" data-field="decay" value="${partial.decay.toFixed(3)}" aria-label="Partial ${index + 1} decay"></td>
      </tr>`).join('');
  }

  function patchField(index, field) {
    const input = tableBody.querySelector(`[data-index="${index}"][data-field="${field}"]`);
    if (!input) return;
    const value = state.partials[index][field];
    input.value = field === 'ratio' ? value.toFixed(4) : field === 'decay' ? value.toFixed(3) : value.toFixed(2);
  }

  fields.preset.addEventListener('change', () => { pushHistory(); rebuild(); });
  for (const name of ['stiffness', 'brightness', 'damping', 'oddEven']) {
    fields[name].addEventListener('pointerdown', () => pushHistory());
    fields[name].addEventListener('input', rebuild);
  }
  fields.seed.addEventListener('change', () => { pushHistory(); rebuild(); });
  root.querySelector('[data-random]').addEventListener('click', () => {
    pushHistory();
    fields.seed.value = String(1 + Math.floor(Math.random() * 999999));
    rebuild();
  });

  for (const name of ['exciter', 'hardness', 'velocity', 'position', 'threshold']) {
    root.querySelector(`[data-${name}]`)?.addEventListener('input', () => {
      readPlayControls();
      if (state.node) pushModes();
    });
  }

  tableBody.addEventListener('focusin', (event) => {
    if (event.target instanceof HTMLInputElement) state.beforeEdit = snapshot();
  });
  tableBody.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    const index = Number(input.dataset.index);
    const field = input.dataset.field;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    if (field === 'ratio' && value <= 0) return;
    if (field === 'decay' && value <= 0) return;
    if (state.beforeEdit) {
      state.undo.push(state.beforeEdit);
      if (state.undo.length > 50) state.undo.shift();
      state.redo = [];
      state.beforeEdit = null;
      updateHistoryButtons();
    }
    state.partials[index][field] = value;
    state.custom = true;
    draw(canvas, state.partials, state);
    pushModes();
  });

  const keys = root.querySelector('[data-keys]');
  keys.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-note]');
    if (!button) return;
    event.preventDefault();
    keys.setPointerCapture?.(event.pointerId);
    state.note = button.dataset.note;
    for (const key of root.querySelectorAll('[data-note]')) key.setAttribute('aria-pressed', String(key === button));
    strike(state, true);
  });
  const release = () => strike(state, false);
  keys.addEventListener('pointerup', release);
  keys.addEventListener('pointercancel', release);
  root.querySelector('[data-stop]').addEventListener('click', () => silence(state));

  drawButton.addEventListener('click', () => {
    state.drawMode = !state.drawMode;
    drawButton.setAttribute('aria-pressed', String(state.drawMode));
    canvas.classList.toggle('is-drawing', state.drawMode);
  });
  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  });

  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    const point = canvasPoint(canvas, event);
    state.gesture = {
      shift: event.shiftKey,
      lastX: point.x,
      lastY: point.y,
      scale: state.scale ? { ...state.scale } : null,
    };
    pushHistory();
    editAt(state, point.x, point.y, true);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.gesture) return;
    const point = canvasPoint(canvas, event);
    state.gesture.shift = event.shiftKey;
    editAt(state, point.x, point.y, false);
    state.gesture.lastX = point.x;
    state.gesture.lastY = point.y;
  });
  const endGesture = () => { state.gesture = null; };
  canvas.addEventListener('pointerup', endGesture);
  canvas.addEventListener('pointercancel', endGesture);

  root.querySelector('[data-export]').addEventListener('click', () => {
    const blob = new Blob([toCsv(state.partials)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'zebra3_ai_profile.csv';
    link.click();
    URL.revokeObjectURL(url);
  });

  root.querySelector('[data-import]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const partials = fromCsv(await file.text());
      pushHistory();
      state.partials = partials;
      state.custom = true;
      render();
      pushModes();
      setAnalyze('');
    } catch (error) {
      setAnalyze(error.message);
    }
  });

  root.querySelector('[data-exciter-file]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      await ensureAudio(state);
      const decoded = await decodeRecording(file, state.audio);
      const samples = normalizePeak(resampleMono(decoded.samples, decoded.sampleRate, state.audio.sampleRate));
      const capped = samples.length > state.audio.sampleRate * 20 ? samples.slice(0, Math.floor(state.audio.sampleRate * 20)) : samples;
      state.file = capped;
      if (state.node) {
        const copy = new Float32Array(capped);
        state.node.port.postMessage({ type: 'file', buffer: copy.buffer }, [copy.buffer]);
      }
      setAnalyze(capped.length < samples.length ? 'Using the first 20 seconds of that file as the exciter.' : 'Exciter file ready.');
    } catch (error) {
      setAnalyze(error.message);
    }
  });

  const recordingInput = root.querySelector('[data-recording]');
  const takeRecording = async (file) => {
    if (!file) return;
    try {
      await ensureAudio(state);
      state.recording = await decodeRecording(file, state.audio);
      setAnalyze('Recording ready. Press Analyze.');
    } catch (error) {
      state.recording = null;
      setAnalyze(error.message);
    }
  };
  recordingInput.addEventListener('change', () => takeRecording(recordingInput.files?.[0]));
  const drop = root.querySelector('[data-drop]');
  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (event) => {
    event.preventDefault();
    drop.classList.remove('is-over');
    takeRecording(event.dataTransfer?.files?.[0]);
  });

  root.querySelector('[data-analyze]').addEventListener('click', () => {
    if (!state.recording) {
      setAnalyze('Drop a recording first.');
      return;
    }
    const requested = Number(root.querySelector('[data-fundamental]').value);
    const thresholdDb = Number(root.querySelector('[data-threshold]').value);
    const maxPartials = Number(root.querySelector('[data-max-partials]').value);
    try {
      const result = analyzeSamples(state.recording.samples, state.recording.sampleRate, {
        fundamental: requested,
        thresholdDb,
        maxPartials,
      });
      pushHistory();
      state.partials = result.partials;
      state.custom = true;
      render();
      pushModes();
      const hz = result.fundamental.toFixed(1);
      root.querySelector('[data-fundamental]').value = hz;
      setAnalyze(`Found ${result.partials.length} partials. Fundamental ${hz} Hz.${result.usedFallbackDecay ? ' Some decays were too noisy to fit, so those used a typical value.' : ''}`);
    } catch (error) {
      setAnalyze(error.message);
    }
  });

  describeButton?.addEventListener('click', async () => {
    const prompt = describeText.value.trim();
    if (!prompt || !describeUrl) return;
    describeButton.disabled = true;
    setMessage('Asking for settings.');
    try {
      const licenseKey = membershipOn ? (licenseInput?.value || '').trim() : '';
      const response = await fetch(describeUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(licenseKey ? { prompt, licenseKey } : { prompt }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.controls) {
        const limited = response.status === 429;
        const licenseRejected = response.status === 403;
        setMessage(limited
          ? 'Describe is limited for now. The partials are unchanged.'
          : licenseRejected
            ? 'That license key was not accepted. The partials are unchanged.'
            : 'Describe did not return usable settings. The partials are unchanged.');
        return;
      }
      const controls = sanitizeControls(payload.controls);
      fields.preset.value = controls.preset;
      fields.stiffness.value = String(controls.stiffness);
      fields.brightness.value = String(controls.brightness);
      fields.damping.value = String(controls.damping);
      fields.oddEven.value = String(controls.oddEven);
      fields.seed.value = String(controls.seed);
      pushHistory();
      rebuild();
      setMessage('Controls updated. The partials were rebuilt.');
    } catch {
      setMessage('Describe did not respond. The partials are unchanged.');
    } finally {
      describeButton.disabled = false;
    }
  });

  function setMessage(text) {
    if (describeMsg) describeMsg.textContent = text;
  }
  function setAnalyze(text) {
    if (analyzeMsg) analyzeMsg.textContent = text;
  }

  function pushModes() {
    sendModesFrom(state);
  }

  state.canvas = canvas;

  readPlayControls();
  rebuild();
  updateHistoryButtons();
  root.querySelector('[data-note="A4"]')?.setAttribute('aria-pressed', 'true');
  window.addEventListener('resize', () => draw(canvas, state.partials, state));
}

function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function editAt(state, x, y, first) {
  const scale = state.gesture?.scale || state.scale;
  if (!scale) return;
  const gain = yToGain(y, scale);
  if (state.drawMode && !state.gesture?.shift) {
    paintGain(state, x, y, gain, scale, first);
  } else if (state.gesture?.shift) {
    const index = nearestPartial(state.partials, x, scale, state.gesture.index);
    if (index < 0) return;
    state.gesture.index = index;
    state.partials[index].ratio = Math.min(64, Math.max(0.05, xToRatio(x, scale)));
    state.custom = true;
    draw(state.canvas || document.querySelector('#modal-app canvas'), state.partials, state, scale);
    patchInput(index, 'ratio', state.partials[index].ratio.toFixed(4));
  } else {
    const index = nearestPartial(state.partials, x, scale, state.gesture?.index);
    if (index < 0) return;
    state.gesture.index = index;
    state.partials[index].gainDb = gain;
    state.custom = true;
    draw(document.querySelector('#modal-app canvas'), state.partials, state, scale);
    patchInput(index, 'gainDb', gain.toFixed(2));
  }
  sendModesFrom(state);
}

function paintGain(state, x, y, gain, scale, first) {
  const ratio = xToRatio(x, scale);
  const ordered = state.partials.map((partial, index) => ({ index, ratio: partial.ratio })).sort((a, b) => a.ratio - b.ratio);
  const touch = (index, value) => {
    state.partials[index].gainDb = value;
    patchInput(index, 'gainDb', value.toFixed(2));
  };
  if (!first && Number.isFinite(state.gesture.lastRatio)) {
    const from = Math.min(state.gesture.lastRatio, ratio);
    const to = Math.max(state.gesture.lastRatio, ratio);
    const startGain = state.gesture.lastGain;
    for (const item of ordered) {
      if (item.ratio < from || item.ratio > to) continue;
      const t = to === from ? 1 : (item.ratio - state.gesture.lastRatio) / (ratio - state.gesture.lastRatio);
      touch(item.index, clamp(startGain + (gain - startGain) * t, -96, 0));
    }
  }
  let nearest = 0;
  let best = Infinity;
  for (let i = 0; i < state.partials.length; i++) {
    const dx = Math.abs(ratioToX(state.partials[i].ratio, scale) - x);
    if (dx < best) { best = dx; nearest = i; }
  }
  if (best < 28) touch(nearest, gain);
  state.gesture.lastRatio = ratio;
  state.gesture.lastGain = gain;
  state.custom = true;
  draw(document.querySelector('#modal-app canvas'), state.partials, state, scale);
}

function patchInput(index, field, value) {
  const input = document.querySelector(`#modal-app [data-index="${index}"][data-field="${field}"]`);
  if (input) input.value = value;
}

function nearestPartial(partials, x, scale, locked) {
  if (Number.isInteger(locked)) return locked;
  let best = Infinity;
  let index = -1;
  for (let i = 0; i < partials.length; i++) {
    const dx = Math.abs(ratioToX(partials[i].ratio, scale) - x);
    if (dx < best) { best = dx; index = i; }
  }
  return best <= 18 ? index : -1;
}

function layout(partials, width, height) {
  const pad = 16;
  const min = Math.min(...partials.map((partial) => partial.ratio));
  const max = Math.max(...partials.map((partial) => partial.ratio));
  const logMin = Math.log(Math.max(min, 1e-6));
  const logMax = Math.log(max === min ? min * 1.01 : max);
  return { pad, width, height, logMin, logMax };
}

function ratioToX(ratio, scale) {
  const span = scale.logMax - scale.logMin || 1;
  return scale.pad + ((Math.log(Math.max(ratio, 1e-6)) - scale.logMin) / span) * (scale.width - scale.pad * 2);
}

function xToRatio(x, scale) {
  const span = scale.logMax - scale.logMin || 1;
  const t = (x - scale.pad) / Math.max(1, scale.width - scale.pad * 2);
  return Math.exp(scale.logMin + clamp(t, -0.08, 1.08) * span);
}

function yToGain(y, scale) {
  const t = 1 - (y - scale.pad) / Math.max(1, scale.height - scale.pad * 2);
  return clamp(t * 80 - 80, -96, 0);
}

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function draw(canvas, partials, state, frozen) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 220;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#fbf8f2';
  ctx.fillRect(0, 0, width, height);
  if (!partials.length) return;
  const scale = frozen || layout(partials, width, height);
  if (!frozen) state.scale = scale;
  ctx.strokeStyle = '#d8d0c1';
  ctx.beginPath();
  ctx.moveTo(scale.pad, height - scale.pad);
  ctx.lineTo(width - scale.pad, height - scale.pad);
  ctx.stroke();
  for (const partial of partials) {
    const x = ratioToX(partial.ratio, scale);
    const gain = Math.max(-80, Math.min(0, partial.gainDb));
    const bar = ((gain + 80) / 80) * (height - scale.pad * 2);
    ctx.fillStyle = partial.gainDb > -18 ? '#d4421c' : '#1f1d1a';
    ctx.fillRect(x - 1.5, height - scale.pad - bar, 3, bar);
  }
}

function playMessage(state, type) {
  return {
    type,
    partials: state.partials.map((partial) => ({ ratio: partial.ratio, gainDb: partial.gainDb, decay: partial.decay })),
    fundamental: noteFrequency(state.note),
    velocity: state.velocity,
    position: state.position,
    exciter: state.exciter,
    hardness: state.hardness,
  };
}

function sendModesFrom(state) {
  if (!state?.node) return;
  state.node.port.postMessage(playMessage(state, 'configure'));
}

async function ensureAudio(state) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('This browser cannot play audio.');
  if (!state.audio) state.audio = new AudioCtx();
  if (!state.workletReady && !state.workletFailed) {
    try {
      const url = URL.createObjectURL(new Blob([workletSource()], { type: 'application/javascript' }));
      await state.audio.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      state.node = new AudioWorkletNode(state.audio, 'modal-bank', { numberOfOutputs: 1, outputChannelCount: [1] });
      state.node.connect(state.audio.destination);
      state.workletReady = true;
      if (state.file) {
        const copy = new Float32Array(state.file);
        state.node.port.postMessage({ type: 'file', buffer: copy.buffer }, [copy.buffer]);
      }
    } catch {
      state.workletFailed = true;
    }
  }
  await state.audio.resume();
}

async function strike(state, down) {
  try {
    await ensureAudio(state);
  } catch {
    return;
  }
  if (state.workletReady) {
    if (!down) {
      state.node.port.postMessage({ type: 'up' });
      return;
    }
    silenceFallback(state);
    state.node.port.postMessage(playMessage(state, 'down'));
    return;
  }
  if (!down) {
    state.fallbackSource?.stop();
    state.fallbackSource = null;
    return;
  }
  playFallback(state);
}

function silence(state) {
  state.node?.port.postMessage({ type: 'stop' });
  silenceFallback(state);
}

function silenceFallback(state) {
  try { state.fallbackSource?.stop(); } catch { /* already stopped */ }
  state.fallbackSource = null;
  for (const node of state.fallback) {
    try { node.disconnect(); } catch { /* already gone */ }
  }
  state.fallback = [];
}

function playFallback(state) {
  silenceFallback(state);
  const audio = state.audio;
  const now = audio.currentTime;
  const fundamental = noteFrequency(state.note);
  const shape = audio.createWaveShaper();
  shape.curve = limiterCurve();
  shape.connect(audio.destination);
  state.fallback.push(shape);
  const master = audio.createGain();
  let ampSum = 0;
  const gains = state.partials.map((partial, index) => {
    const weight = Math.abs(Math.sin(Math.PI * (index + 1) * Math.min(0.98, Math.max(0.02, state.position))));
    const amp = 10 ** (partial.gainDb / 20) * weight * state.velocity;
    ampSum += amp;
    return amp;
  });
  master.gain.value = 0.45 / Math.max(ampSum, 1e-8);
  master.connect(shape);
  state.fallback.push(master);
  const buffer = exciterBuffer(state, audio.sampleRate);
  const source = audio.createBufferSource();
  source.buffer = buffer;
  source.loop = state.exciter === 'bow' || state.exciter === 'file';
  const filters = [];
  state.partials.forEach((partial, index) => {
    const freq = fundamental * partial.ratio;
    if (freq < 20 || freq > audio.sampleRate * 0.45 || !(gains[index] > 0)) return;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = Math.min(40, Math.max(0.5, (Math.PI * freq * Math.max(0.02, partial.decay)) / Math.log(1000)));
    const gain = audio.createGain();
    gain.gain.value = gains[index];
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    filters.push(filter, gain);
  });
  source.start(now);
  if (!source.loop) source.stop(now + buffer.duration);
  state.fallbackSource = source;
  state.fallback.push(source, ...filters);
}

function exciterBuffer(state, sampleRate) {
  const seconds = state.exciter === 'bow' ? 1 : state.exciter === 'file' && state.file ? state.file.length / sampleRate : 0.2;
  const length = Math.max(2, Math.floor(sampleRate * seconds));
  const buffer = state.audio.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  if (state.exciter === 'file' && state.file) {
    data.set(state.file.subarray(0, length));
    return buffer;
  }
  if (state.exciter === 'click') {
    data[0] = 1;
    return buffer;
  }
  if (state.exciter === 'mallet') {
    const hard = state.hardness;
    const n = Math.max(8, Math.round(sampleRate * (9 - hard * 8) / 1000));
    const cutoff = 450 * 18 ** hard;
    const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    let low = 0;
    for (let i = 0; i < Math.min(n, length); i++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      low += alpha * (hann - low);
      data[i] = low;
    }
    let sum = 0;
    for (let i = 0; i < length; i++) sum += data[i];
    if (sum > 0) for (let i = 0; i < length; i++) data[i] /= sum;
    return buffer;
  }
  let seed = 0x6d2b79f5;
  const alpha = 1 - Math.exp((-2 * Math.PI * 3200) / sampleRate);
  let low = 0;
  let env = 1;
  const drop = Math.exp(-1 / (0.045 * sampleRate));
  for (let i = 0; i < length; i++) {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >>> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    const white = ((seed >>> 0) / 4294967296) * 2 - 1;
    low += alpha * (white - low);
    data[i] = state.exciter === 'bow' ? low : white * env * 0.12;
    env *= drop;
  }
  return buffer;
}

function limiterCurve() {
  const curve = new Float32Array(1024);
  const knee = Math.tanh(1.35);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.35) / knee;
  }
  return curve;
}

function normalizePeak(samples) {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
  if (!(peak > 0)) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] / peak;
  return out;
}

