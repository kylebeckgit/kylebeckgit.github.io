import { PRESETS, NOTE_BUTTONS, buildPartials, previewPartials, toCsv, fromCsv, noteFrequency, defaultControls, sanitizeControls, alignReference } from './engine.js';
import { analyzeSamples, decodeRecording, resampleMono, parseRoot, frequencyToNote } from './analyze.js';
import { renderPreview, scaleToPeak } from './resonator.js';
import { clampCamera, defaultCamera, hitPartial, paintModalView } from './modal-view.js';
import { shapePartials } from './shape.js';
import { fileSlug } from './recipes.js';
import { mountStudio } from './studio.js';

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
    userHolding: false,
    autoHearToken: 0,
    autoHearTimer: 0,
    drawStyle: 'fast',
    selectedPartial: -1,
    profilePartials: null,
    camera: defaultCamera(),
    detune: 0,
    drawPartials: null,
    easing: false,
    easeFrame: 0,
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

  if (describe && describeUrl) describe.hidden = false;
  const licenseField = root.querySelector('[data-license]');
  const licenseInput = root.querySelector('[data-license-key]');
  if (describe && describeUrl && membershipOn && licenseField) licenseField.hidden = false;

  function readControls() {
    const carried = state.carried;
    const preset = fields.preset.value;
    const keep = carried && carried.preset === preset;
    state.controls = sanitizeControls({
      preset,
      stiffness: fields.stiffness.value,
      brightness: fields.brightness.value,
      damping: fields.damping.value,
      oddEven: fields.oddEven.value,
      seed: fields.seed.value,
      voice: keep ? carried.voice : '',
      count: keep ? carried.count : 64,
    });
    state.carried = keep ? { preset, voice: state.controls.voice, count: state.controls.count } : null;
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
    const list = state.profilePartials || state.partials;
    return list.map((partial) => ({ ratio: partial.ratio, gainDb: partial.gainDb, decay: partial.decay }));
  }

  function readShape() {
    const absorb = root.querySelector('[data-absorb]');
    if (!absorb) return null;
    return {
      absorb: Number(absorb.value) / 100,
      disperse: Number(root.querySelector('[data-disperse]').value) / 100,
      decay: Number(root.querySelector('[data-modal-decay]').value) / 100,
      decayKf: Number(root.querySelector('[data-decay-kf]')?.value || 0) / 100,
      normalize: Number(root.querySelector('[data-normalize]')?.value || 0) / 100,
      tune: Number(root.querySelector('[data-tune]')?.value || 0),
      density: Number(root.querySelector('[data-density]').value),
    };
  }

  function publishShape() {
    const shape = readShape();
    if (!shape || !state.profilePartials) return;
    const identity = shape.absorb === 0 && shape.disperse === 0 && shape.decay === 0
      && shape.decayKf === 0 && shape.normalize === 0 && shape.tune === 0
      && shape.density === state.profilePartials.length;
    state.partials = identity ? state.profilePartials : shapePartials(state.profilePartials, shape);
    beginEase();
  }

  function beginEase() {
    state.easing = true;
    if (!state.easeFrame) state.easeFrame = requestAnimationFrame(tickEase);
  }

  function tickEase() {
    state.easeFrame = 0;
    let moving = easeList();
    if (state.cameraGoal) {
      state.camera.yaw += (state.cameraGoal.yaw - state.camera.yaw) * 0.22;
      state.camera.pitch += (state.cameraGoal.pitch - state.camera.pitch) * 0.22;
      if (Math.abs(state.cameraGoal.yaw - state.camera.yaw) < 0.004
        && Math.abs(state.cameraGoal.pitch - state.camera.pitch) < 0.004) {
        state.camera = { ...state.cameraGoal, distance: state.camera.distance };
        state.cameraGoal = null;
      } else {
        moving = true;
      }
    }
    draw(canvas, state.drawPartials || state.partials, state);
    if (moving) state.easeFrame = requestAnimationFrame(tickEase);
    else state.easing = false;
  }

  function easeList() {
    const goal = state.partials;
    if (!goal?.length) return false;
    if (!state.drawPartials || state.drawPartials.length !== goal.length) {
      state.drawPartials = goal.map((partial) => ({ ratio: partial.ratio, gainDb: partial.gainDb, decay: partial.decay }));
      return false;
    }
    let moving = false;
    for (let i = 0; i < goal.length; i++) {
      const drawn = state.drawPartials[i];
      const target = goal[i];
      for (const key of ['ratio', 'gainDb', 'decay']) {
        const delta = target[key] - drawn[key];
        if (Math.abs(delta) > (key === 'ratio' ? 0.004 : 0.03)) moving = true;
        drawn[key] += delta * 0.28;
      }
    }
    if (!moving) state.drawPartials = goal;
    return moving;
  }

  function adopt(partials, custom) {
    const aligned = root.querySelector('[data-absorb]')
      ? alignReference(partials, noteFrequency(state.note))
      : { partials, fundamental: noteFrequency(state.note) };
    state.hearFundamental = aligned.fundamental;
    const copy = aligned.partials.map((partial) => ({ ratio: partial.ratio, gainDb: partial.gainDb, decay: partial.decay }));
    if (root.querySelector('[data-absorb]')) {
      state.profilePartials = capAudible(copy);
      publishShape();
    } else {
      state.partials = copy;
    }
    if (custom != null) state.custom = custom;
  }

  function pushHistory() {
    state.undo.push(snapshot());
    if (state.undo.length > 50) state.undo.shift();
    state.redo = [];
    updateHistoryButtons();
  }

  function restore(partials) {
    adopt(partials, true);
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
    const build = root.querySelector('[data-absorb]') ? previewPartials : buildPartials;
    adopt(build(state.controls), false);
    render();
    pushModes();
  }

  function render() {
    draw(canvas, state.drawPartials || state.partials, state);
    tableBody.innerHTML = state.partials.map((partial, index) => `
      <tr class="${index === state.selectedPartial ? 'is-selected' : ''}">
        <th scope="row"><button type="button" class="partial-index" data-make-root="${index}" aria-label="Make partial ${index + 1} the root">${index + 1}</button></th>
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

  tableBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-make-root]');
    if (!button) return;
    makeRoot(Number(button.dataset.makeRoot));
  });
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
    const shown = state.partials[index];
    const source = shown?.sourceIndex != null && state.profilePartials
      ? state.profilePartials[shown.sourceIndex]
      : shown;
    if (!source) return;
    source[field] = value;
    state.custom = true;
    if (state.profilePartials && state.partials !== state.profilePartials) publishShape();
    render();
    pushModes();
  });

  const keys = root.querySelector('[data-keys]');
  keys.addEventListener('pointerdown', (event) => {
    const button = event.target.closest('[data-note]');
    if (!button) return;
    event.preventDefault();
    try { keys.setPointerCapture?.(event.pointerId); } catch { /* no active pointer */ }
    state.note = button.dataset.note;
    for (const key of root.querySelectorAll('[data-note]')) key.setAttribute('aria-pressed', String(key === button));
    state.userHolding = true;
    cancelAutoHear();
    strike(state, true);
  });
  const release = () => {
    state.userHolding = false;
    strike(state, false);
  };
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
    if (canvas.dataset.view === 'zebra') {
      state.gesture = {
        orbit: true,
        x: point.x,
        y: point.y,
        yaw: state.camera.yaw,
        pitch: state.camera.pitch,
        moved: false,
      };
      return;
    }
    state.gesture = {
      shift: event.shiftKey,
      x: point.x,
      y: point.y,
      lastX: point.x,
      lastY: point.y,
      moved: false,
      scale: state.scale ? { ...state.scale } : null,
    };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!state.gesture) return;
    const point = canvasPoint(canvas, event);
    if (state.gesture.orbit) {
      const dx = point.x - state.gesture.x;
      const dy = point.y - state.gesture.y;
      if (!state.gesture.moved && Math.hypot(dx, dy) < 3) return;
      state.gesture.moved = true;
      state.cameraGoal = null;
      state.camera = clampCamera({
        yaw: state.gesture.yaw - dx * 0.0065,
        pitch: state.gesture.pitch + dy * 0.0045,
      });
      draw(canvas, state.drawPartials || state.partials, state);
      return;
    }
    const travel = Math.hypot(point.x - state.gesture.x, point.y - state.gesture.y);
    if (!state.gesture.moved && travel < 5) return;
    if (!state.gesture.moved) {
      state.gesture.moved = true;
      pushHistory();
    }
    state.gesture.shift = event.shiftKey;
    editAt(state, point.x, point.y, state.gesture.lastX === state.gesture.x && state.gesture.lastY === state.gesture.y);
    state.gesture.lastX = point.x;
    state.gesture.lastY = point.y;
  });
  canvas.addEventListener('pointerup', (event) => {
    if (state.gesture?.orbit) {
      if (!state.gesture.moved) {
        const point = canvasPoint(canvas, event);
        state.selectedPartial = hitPartial(
          state.drawPartials || state.partials,
          state.camera,
          canvas.clientWidth,
          canvas.clientHeight,
          point.x,
          point.y,
        );
        render();
      }
      state.gesture = null;
      return;
    }
    if (state.gesture && !state.gesture.moved && !state.drawMode) {
      const index = nearestPartial(state.partials, state.gesture.x, state.gesture.scale || state.scale);
      if (index >= 0) makeRoot(index);
    }
    state.gesture = null;
  });
  canvas.addEventListener('pointercancel', () => { state.gesture = null; });
  canvas.addEventListener('dblclick', () => {
    if (canvas.dataset.view !== 'zebra') return;
    state.cameraGoal = defaultCamera();
    beginEase();
  });
  const styleSelect = root.querySelector('[data-draw-style]');
  if (styleSelect) {
    state.drawStyle = styleSelect.value || 'fast';
    styleSelect.addEventListener('change', () => {
      state.drawStyle = styleSelect.value;
      draw(canvas, state.partials, state);
    });
  }
  for (const name of ['absorb', 'disperse', 'modal-decay', 'density', 'tune', 'normalize', 'decay-kf']) {
    const slider = root.querySelector(`[data-${name}]`);
    if (!slider) continue;
    slider.addEventListener('input', () => {
      const out = root.querySelector(`[data-${name}-out]`);
      if (out) out.textContent = slider.value;
      publishShape();
      render();
      pushModes();
    });
  }
  const detune = root.querySelector('[data-detune]');
  if (detune) {
    detune.addEventListener('input', () => {
      const out = root.querySelector('[data-detune-out]');
      if (out) out.textContent = detune.value;
      state.detune = Number(detune.value) / 100;
      draw(canvas, state.drawPartials || state.partials, state);
    });
  }
  tableBody.addEventListener('focusin', (event) => {
    if (canvas.dataset.view !== 'zebra') return;
    const input = event.target.closest?.('[data-index]');
    if (!input) return;
    state.selectedPartial = Number(input.dataset.index);
    draw(canvas, state.partials, state);
    for (const row of tableBody.querySelectorAll('tr')) row.classList.remove('is-selected');
    input.closest('tr')?.classList.add('is-selected');
  });

  root.querySelector('[data-export]').addEventListener('click', () => {
    const blob = new Blob([toCsv(state.partials)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = state.profileName ? fileSlug(state.profileName) : 'zebra3_ai_profile.csv';
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
      adopt(partials, true);
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
      await ensureAudio(state, false);
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
    const requested = parseRoot(root.querySelector('[data-fundamental]').value);
    const thresholdDb = Number(root.querySelector('[data-threshold]').value);
    const maxPartials = Number(root.querySelector('[data-max-partials]').value);
    try {
      const result = analyzeSamples(state.recording.samples, state.recording.sampleRate, {
        fundamental: requested || undefined,
        thresholdDb,
        maxPartials,
      });
      pushHistory();
      adopt(result.partials, true);
      state.rootHz = result.fundamental;
      state.rootConfidence = result.confidence;
      state.rootManual = result.confidence === 'set';
      render();
      pushModes();
      showRoot();
      if (!state.profileName) {
        state.profileName = 'From recording';
        const nameInput = root.querySelector('[data-name]');
        if (nameInput) nameInput.value = state.profileName;
      }
      setAnalyze(`Found ${result.partials.length} partials.${result.usedFallbackDecay ? ' Some decays were too noisy to fit, so those used a typical value.' : ''}`);
    } catch (error) {
      setAnalyze(error.message);
    }
  });
  root.querySelector('[data-root-down]').addEventListener('click', () => shiftOctave(-1));
  root.querySelector('[data-root-up]').addEventListener('click', () => shiftOctave(1));
  root.querySelector('[data-fundamental]').addEventListener('change', () => {
    const hz = parseRoot(root.querySelector('[data-fundamental]').value);
    if (!hz) {
      state.rootManual = false;
      showRoot();
      return;
    }
    retargetRoot(hz);
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

  function showRoot() {
    const readout = root.querySelector('[data-root-readout]');
    const down = root.querySelector('[data-root-down]');
    const up = root.querySelector('[data-root-up]');
    if (!readout) return;
    if (!(state.rootHz > 0)) {
      readout.textContent = 'Root appears after analysis.';
      if (down) down.disabled = true;
      if (up) up.disabled = true;
      return;
    }
    const note = frequencyToNote(state.rootHz);
    const hz = state.rootHz.toFixed(1);
    const confidence = state.rootManual ? 'Set by hand.' : `Confidence ${state.rootConfidence || 'medium'}.`;
    readout.textContent = `Root ${note}, ${hz} Hz. ${confidence}`;
    if (down) down.disabled = state.rootHz / 2 < 20;
    if (up) up.disabled = state.rootHz * 2 > 5000;
  }

  function retargetRoot(nextHz) {
    if (!(nextHz > 0)) return;
    if (state.rootHz > 0 && state.partials.length) {
      const factor = nextHz / state.rootHz;
      if (Math.abs(factor - 1) > 1e-6) {
        pushHistory();
        const list = state.profilePartials || state.partials;
        for (const partial of list) partial.ratio = Math.min(64, Math.max(0.02, partial.ratio / factor));
        if (state.profilePartials && state.partials !== state.profilePartials) publishShape();
        state.custom = true;
        render();
        pushModes();
      }
    }
    state.rootHz = nextHz;
    state.rootManual = true;
    const field = root.querySelector('[data-fundamental]');
    if (field) field.value = nextHz.toFixed(1);
    showRoot();
  }

  function makeRoot(index) {
    const shown = state.partials[index];
    const ratio = shown?.sourceIndex != null && state.profilePartials
      ? state.profilePartials[shown.sourceIndex].ratio
      : shown?.ratio;
    if (!(ratio > 0)) return;
    if (state.rootHz > 0) retargetRoot(state.rootHz * ratio);
    else {
      pushHistory();
      for (const partial of (state.profilePartials || state.partials)) partial.ratio /= ratio;
      if (state.profilePartials && state.partials !== state.profilePartials) publishShape();
      state.custom = true;
      render();
      pushModes();
    }
  }

  function shiftOctave(direction) {
    if (!(state.rootHz > 0)) return;
    retargetRoot(state.rootHz * (direction > 0 ? 2 : 0.5));
  }

  state.canvas = canvas;

  function applyRecipe(recipe, { hear = false, partials = null, history = true } = {}) {
    const controls = sanitizeControls(recipe.controls || recipe);
    state.carried = { preset: controls.preset, voice: controls.voice, count: controls.count };
    fields.preset.value = controls.preset;
    fields.stiffness.value = String(controls.stiffness);
    fields.brightness.value = String(controls.brightness);
    fields.damping.value = String(controls.damping);
    fields.oddEven.value = String(controls.oddEven);
    fields.seed.value = String(controls.seed);
    const exciter = root.querySelector('[data-exciter]');
    if (recipe.exciter && exciter) exciter.value = recipe.exciter;
    const hardness = root.querySelector('[data-hardness]');
    if (recipe.hardness != null && hardness) hardness.value = String(recipe.hardness);
    const velocity = root.querySelector('[data-velocity]');
    if (recipe.velocity != null && velocity) velocity.value = String(recipe.velocity);
    const position = root.querySelector('[data-position]');
    if (recipe.position != null && position) position.value = String(recipe.position);
    if (recipe.name) state.profileName = recipe.name;
    if (history) pushHistory();
    rebuild();
    readPlayControls();
    if (partials?.length) {
      adopt(partials, true);
      render();
      pushModes();
    }
    if (hear) {
      try {
        playHeard(state, recipe);
        setPlayError(root, '');
      } catch (error) {
        setPlayError(root, error.message || 'Playback failed.');
      }
    }
  }

  function cancelAutoHear() {
    state.autoHearToken += 1;
    window.clearTimeout(state.autoHearTimer);
    state.autoHearTimer = 0;
  }

  function profileFromState() {
    readControls();
    readPlayControls();
    const profile = {
      name: state.profileName || 'Modal profile',
      controls: state.controls,
      exciter: state.exciter,
      hardness: state.hardness,
      velocity: state.velocity,
      position: state.position,
    };
    if (state.custom) {
      profile.partials = state.partials.map((partial) => ({
        ratio: Number(partial.ratio.toFixed(4)),
        gainDb: Number(partial.gainDb.toFixed(2)),
        decay: Number(partial.decay.toFixed(3)),
      }));
    }
    return profile;
  }

  readPlayControls();
  rebuild();
  updateHistoryButtons();
  showRoot();
  mountStudio(root, {
    applyRecipe,
    setName(name) { state.profileName = name.trim() || 'Modal profile'; },
    profileFromState,
  });
  root.addEventListener('pointerdown', () => primeAudio(state), true);
  root.querySelector('[data-note="A4"]')?.setAttribute('aria-pressed', 'true');
  window.addEventListener('resize', () => draw(canvas, state.partials, state));
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => draw(canvas, state.partials, state);
  if (typeof scheme.addEventListener === 'function') scheme.addEventListener('change', onScheme);
  else scheme.addListener(onScheme);
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

function layout(partials, width, height, pad = 16) {
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

function canvasColors() {
  const style = getComputedStyle(document.documentElement);
  const read = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  return {
    card: read('--card', '#fbf8f2'),
    bg: read('--bg', '#f2ede3'),
    line: read('--line', '#d8d0c1'),
    accent: read('--accent', '#d4421c'),
    // Quiet partials follow the text color. --ink stays dark in both schemes.
    muted: read('--muted', '#6a655c'),
    ink: read('--fg', '#1f1d1a'),
  };
}

function setPlayError(root, message) {
  const el = root?.querySelector?.('[data-play-error]');
  if (el) el.textContent = message || '';
}

function capAudible(partials) {
  // Drop partials above ratio 48 instead of folding them under a neighbor.
  // Folding made the list unsorted and pulled real string and bar modes off
  // their textbook ratios. What remains is still positive, sorted, and audible
  // at A4.
  const limit = 48;
  const kept = partials
    .filter((partial) => partial.ratio > 0 && partial.ratio <= limit)
    .sort((a, b) => a.ratio - b.ratio);
  if (kept.length) return kept;
  const lowest = [...partials].sort((a, b) => a.ratio - b.ratio)[0];
  return lowest ? [{ ...lowest, ratio: Math.min(lowest.ratio, limit) }] : [];
}

function playHeard(state, recipe) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('This browser cannot play audio.');
  if (!state.audio) state.audio = new AudioCtx();
  const ctx = state.audio;
  // Safari stays silent unless a buffer is started in this gesture, before any await.
  const unlock = ctx.createBuffer(1, 1, ctx.sampleRate);
  const unlockSource = ctx.createBufferSource();
  unlockSource.buffer = unlock;
  unlockSource.connect(ctx.destination);
  unlockSource.start();
  const resumed = ctx.resume();
  const exciter = recipe.exciter || state.exciter;
  const zebra = state.canvas?.dataset.view === 'zebra';
  const seconds = zebra ? 4 : (exciter === 'bow' ? 1.1 : 1.6);
  const fundamental = state.hearFundamental || noteFrequency(state.note);
  const samples = renderPreview(state.partials, {
    fundamental,
    velocity: state.velocity,
    position: state.position,
    exciter,
    hardness: state.hardness,
    file: state.file,
    sampleRate: ctx.sampleRate,
    seconds,
    impulse: false,
    matchGains: zebra,
    glide: zebra && state.controls?.voice === 'gong' ? { cents: 35, seconds: 0.45, maxRatio: 6 } : undefined,
    releaseAt: exciter === 'bow' ? Math.floor(ctx.sampleRate * 0.85) : undefined,
  });
  const heard = scaleToPeak(samples, 0.45);
  try { state.hearSource?.stop(); } catch { /* already stopped */ }
  const buffer = ctx.createBuffer(1, heard.length, ctx.sampleRate);
  if (buffer.copyToChannel) buffer.copyToChannel(heard, 0);
  else buffer.getChannelData(0).set(heard);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  state.hearSource = source;
  const root = state.canvas?.closest('#modal-app');
  resumed.then(() => {
    if (ctx.state !== 'running') setPlayError(root, 'The browser blocked audio. Click Hear again.');
  }).catch(() => setPlayError(root, 'The browser blocked audio. Click Hear again.'));
}

function drawZebra(canvas, partials, state) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 220;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = canvasColors();
  colors.font = getComputedStyle(document.body).fontFamily;
  paintModalView(ctx, partials, {
    width,
    height,
    camera: state.camera,
    style: state.drawStyle || 'fast',
    colors,
    selected: state.selectedPartial,
    detune: state.detune || 0,
  });
}

function draw(canvas, partials, state, frozen) {
  if (canvas.dataset.view === 'zebra') {
    drawZebra(canvas, partials, state, frozen);
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 220;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = canvasColors();
  ctx.fillStyle = colors.card;
  ctx.fillRect(0, 0, width, height);
  if (!partials.length) return;
  const scale = frozen || layout(partials, width, height);
  if (!frozen) state.scale = scale;
  ctx.strokeStyle = colors.line;
  ctx.beginPath();
  ctx.moveTo(scale.pad, height - scale.pad);
  ctx.lineTo(width - scale.pad, height - scale.pad);
  ctx.stroke();
  for (const partial of partials) {
    const x = ratioToX(partial.ratio, scale);
    const gain = Math.max(-80, Math.min(0, partial.gainDb));
    const bar = ((gain + 80) / 80) * (height - scale.pad * 2);
    ctx.fillStyle = partial.gainDb > -18 ? colors.accent : colors.ink;
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

function primeAudio(state) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!state.audio) state.audio = new AudioCtx();
  const pending = state.audio.resume();
  state.resumePromise = pending;
  return pending;
}

function failWorklet(state) {
  if (state.workletFailed) return;
  state.workletFailed = true;
  state.workletReady = false;
  try { state.node?.disconnect(); } catch { /* already gone */ }
  state.node = null;
  if (state.holdingNote) playFallback(state);
}

function watchWorklet(state) {
  state.node.onprocessorerror = () => failWorklet(state);
  state.node.port.onmessage = (event) => {
    const data = event.data || {};
    if (data.type === 'error') failWorklet(state);
    if (data.type === 'level' && state.expectSound && state.velocity > 0.01 && !(data.peak > 1e-5)) failWorklet(state);
    if (data.type === 'level') state.expectSound = false;
  };
}

async function ensureAudio(state, resume = true) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('This browser cannot play audio.');
  if (!state.audio) state.audio = new AudioCtx();
  // Start resume in this turn, before any await, so the user gesture still counts.
  const resumed = resume ? state.audio.resume() : null;
  if (!state.workletReady && !state.workletFailed && !state.workletLoading) {
    state.workletLoading = (async () => {
      try {
        await state.audio.audioWorklet.addModule('/modal-resonator.worklet.js');
        state.node = new AudioWorkletNode(state.audio, 'modal-bank', { numberOfOutputs: 1, outputChannelCount: [1] });
        watchWorklet(state);
        state.node.connect(state.audio.destination);
        state.workletReady = true;
        if (state.file) {
          const copy = new Float32Array(state.file);
          state.node.port.postMessage({ type: 'file', buffer: copy.buffer }, [copy.buffer]);
        }
      } catch {
        state.workletFailed = true;
      }
    })();
  }
  if (state.workletLoading) await state.workletLoading;
  if (resumed) await resumed;
}

async function strike(state, down, source = 'user') {
  if (!down && source === 'auto' && state.userHolding) return;
  state.holdingNote = down;
  if (down) primeAudio(state);
  try {
    await ensureAudio(state);
  } catch {
    return;
  }
  if (down && !state.holdingNote) return;
  if (!down && source === 'auto' && (state.userHolding || state.holdingNote)) return;
  if (state.workletReady && !state.workletFailed) {
    if (!down) {
      state.node.port.postMessage({ type: 'up' });
      return;
    }
    silenceFallback(state);
    state.expectSound = true;
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
  try { state.hearSource?.stop(); } catch { /* already stopped */ }
  state.hearSource = null;
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

