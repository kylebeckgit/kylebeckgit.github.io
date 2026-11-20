import { A4_HZ, PRESETS, NOTE_BUTTONS, ZEBRA_PARTIAL_LIMIT_HZ, buildPartials, previewPartials, zebraExport, audiblePartials, fromCsv, noteFrequency, playedFundamental, heardSeconds, defaultControls, sanitizeControls, alignReference, carryControls, controlsFromKnobs } from './engine.js';
import { applyShapeSound, SHAPE_SOUND } from './mode-solve.js';
import { analyzeSamples, decodeRecording, resampleMono, parseRoot, frequencyToNote } from './analyze.js';
import { renderPreview, scaleToPeak, strikeWeight } from './resonator.js';
import { aimSlices, createFitMotion, createSliceMotion, defaultCamera, hitPartial, MORPH_MS, paintModalView, sampleSlices, slicesMoving } from './modal-view.js';
import { bodySignature, hitObjectMode, objectCaption, paintObject } from './object-view.js';
import { cachedModes, flatSpec, patternNote, solveMs, trackFlatModes } from './mode-client.js';
import { densityForProfile, shapePartials } from './shape.js';
import { createRollHistory, defaultLocks, pushRoll, redoRoll, rollSound, undoRoll } from './randomize.js';
import { decodeProfile, encodeProfile } from './studio.js';
import { SILENT_MODE_HINT, audioContextClass, beginAudio, installGestureUnlock, playSilentUnlock, prepareAudioSession, resumeInGesture } from './audio-session.js';

export function mount(root) {
  const flatTrack = trackFlatModes(() => {
    syncShapeSound();
    if (objectCanvas && !objectCanvas.hidden) paintDesignerObject();
    else if (canvas && !canvas.hidden) draw(canvas, state.partials, state);
  });
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
    hoverPartial: -1,
    objectStrike: 0,
    bodyMeta: null,
    profilePartials: null,
    camera: defaultCamera(),
    detune: 0,
    slices: createSliceMotion(),
    slicesReady: false,
    fit: createFitMotion(),
    viewFrame: 0,
    cameraAim: null,
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
  const canvas = root.querySelector('[data-view="zebra"]');
  const objectCanvas = root.querySelector('[data-object]');
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
    state.controls = controlsFromKnobs({
      preset,
      stiffness: fields.stiffness.value,
      brightness: fields.brightness.value,
      damping: fields.damping.value,
      oddEven: fields.oddEven.value,
      seed: fields.seed.value,
    }, keep ? carried : null);
    state.carried = keep ? carryControls(state.controls) : null;
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

  let densityChoice = null;

  function coverProfile() {
    const select = root.querySelector('[data-density]');
    const count = state.profilePartials?.length || 0;
    if (!select || select.tagName !== 'SELECT' || !(count > 0)) return false;
    if (densityChoice == null) densityChoice = Number(select.value) || 16;
    const options = [...select.options].map((option) => Number(option.value));
    const next = densityForProfile(count, densityChoice, options);
    if (Number(select.value) === next) return false;
    select.value = String(next);
    return true;
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

  function publishShape(duration = MORPH_MS) {
    const shape = readShape();
    if (!shape || !state.profilePartials) return;
    const identity = shape.absorb === 0 && shape.disperse === 0 && shape.decay === 0
      && shape.decayKf === 0 && shape.normalize === 0 && shape.tune === 0
      && shape.density === state.profilePartials.length;
    let next;
    if (identity) {
      const profile = state.profilePartials;
      const audible = audiblePartials(profile.map((partial, index) => ({ ...partial, sourceIndex: index })), heardOptions());
      const untouched = audible.length === profile.length && audible.every((partial, index) => {
        const source = profile[index];
        return partial.ratio === source.ratio && partial.gainDb === source.gainDb && partial.decay === source.decay;
      });
      // Share the profile while the shape is at rest so a table edit writes
      // the same objects the next publish reads.
      next = untouched ? profile : audible;
    } else {
      next = audiblePartials(shapePartials(state.profilePartials, shape), heardOptions());
    }
    state.partials = next;
    const first = !state.slicesReady;
    state.slicesReady = true;
    aimSlices(state.slices, state.partials, performance.now(), first ? 0 : duration);
    if (!first && duration > 0) kickView();
  }

  function followProfile(duration = MORPH_MS) {
    if (state.profilePartials && state.partials !== state.profilePartials) {
      publishShape(duration);
      return;
    }
    const first = !state.slicesReady;
    state.slicesReady = true;
    aimSlices(state.slices, state.partials, performance.now(), first ? 0 : duration);
    if (!first && duration > 0) kickView();
  }

  function kickView() {
    if (state.viewFrame) return;
    const frame = (now) => {
      const moving = slicesMoving(state.slices, now) || stepCamera(now);
      draw(canvas, state.partials, state);
      if (moving || state.fit.moving) state.viewFrame = requestAnimationFrame(frame);
      else state.viewFrame = 0;
    };
    state.viewFrame = requestAnimationFrame(frame);
  }

  function stepCamera() {
    state.camera = defaultCamera();
    state.cameraAim = null;
    return false;
  }

  function adopt(partials, custom) {
    // Start from the selected note times the size pitch every time. Feeding
    // the last aligned frequency back in would walk the note on each knob move.
    const fundamental = playedFundamental(state.controls?.pitchScale, noteFrequency(state.note));
    const aligned = root.querySelector('[data-absorb]')
      ? alignReference(partials, fundamental)
      : { partials, fundamental };
    state.hearFundamental = aligned.fundamental;
    const copy = aligned.partials.map((partial) => ({ ratio: partial.ratio, gainDb: partial.gainDb, decay: partial.decay }));
    if (root.querySelector('[data-absorb]')) {
      state.profilePartials = capAudible(copy);
      publishShape();
    } else {
      state.partials = audiblePartials(copy, heardOptions());
    }
    if (custom != null) state.custom = custom;
    syncShapeSound();
  }

  function syncShapeSound() {
    if (!SHAPE_SOUND) return;
    const body = objectBody();
    if (!flatSpec(body)) return;
    flatTrack(body);
    const modes = cachedModes(body);
    const profile = state.profilePartials || state.partials;
    if (!modes || !profile) return;
    const shaped = applyShapeSound(profile, modes);
    if (shaped === profile) return;
    state.profilePartials = shaped;
    publishShape(0);
    pushModes();
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

  function heardOptions() {
    return {
      fundamental: state.hearFundamental || noteFrequency(state.note),
      sampleRate: state.audio?.sampleRate || 48000,
    };
  }

  function render() {
    const hint = root.querySelector('[data-export-hint]');
    if (hint) hint.textContent = zebraExport(state.partials, heardOptions()).hint;
    draw(canvas, state.partials, state);
    paintDesignerObject();
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

  function objectBody() {
    return {
      preset: state.controls?.preset || fields.preset.value,
      voice: state.controls?.voice || '',
      material: state.bodyMeta?.material || '',
      shape: state.bodyMeta?.shape || '',
      size: state.bodyMeta?.size || 'medium',
      name: state.bodyMeta ? (state.profileName || '') : '',
      objectName: state.bodyMeta ? (state.bodyMeta.objectName || state.profileName || '') : '',
    };
  }

  function writeObjectCaption(body, selected, count) {
    const caption = root.querySelector('[data-object-caption]');
    if (!caption) return;
    const base = objectCaption(body, { selected, count });
    const note = patternNote(flatSpec(body), cachedModes(body) ? 'ready' : 'pending');
    const text = [base, note].filter(Boolean).join(' ');
    caption.hidden = !text;
    caption.textContent = text;
  }

  function easeBlend(t) {
    const u = Math.max(0, Math.min(1, t));
    return u < 0.5 ? 2 * u * u : 1 - ((-2 * u + 2) ** 2) / 2;
  }

  function paintDesignerObject() {
    if (!objectCanvas || objectCanvas.hidden) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = objectCanvas.clientWidth || canvas?.clientWidth || 640;
    const height = objectCanvas.clientHeight || canvas?.clientHeight || 360;
    objectCanvas.width = Math.round(width * dpr);
    objectCanvas.height = Math.round(height * dpr);
    const ctx = objectCanvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const age = state.objectStrike ? (performance.now() - state.objectStrike) / 1000 : null;
    const selected = state.hoverPartial >= 0 ? state.hoverPartial : state.selectedPartial;
    const body = objectBody();
    const partials = state.partials || [];
    const sig = bodySignature(body, partials);
    if (state.objectShown && state.objectShown.sig !== sig) {
      state.objectFade = { from: state.objectShown, t0: performance.now() };
    }
    const blend = state.objectFade ? easeBlend((performance.now() - state.objectFade.t0) / 250) : 1;
    const colors = canvasColors();
    const solvedModes = flatTrack(body);
    if (objectCanvas) {
      objectCanvas.dataset.pattern = !flatSpec(body) ? 'stylized' : solvedModes ? 'solved' : 'solving';
      const ms = solveMs(body);
      if (ms != null) objectCanvas.dataset.solveMs = String(Math.round(ms));
    }
    const paint = (target, frameBody, framePartials, solved) => paintObject(target, {
      width,
      height,
      body: frameBody,
      partials: framePartials,
      selected,
      age: state.objectStrike ? age : null,
      now: performance.now(),
      colors,
      solvedModes: solved,
    });
    if (blend < 1 && state.objectFade?.from) {
      paint(ctx, state.objectFade.from.body, state.objectFade.from.partials, null);
      if (!state.fadeCanvas) state.fadeCanvas = document.createElement('canvas');
      state.fadeCanvas.width = objectCanvas.width;
      state.fadeCanvas.height = objectCanvas.height;
      const fadeCtx = state.fadeCanvas.getContext('2d');
      fadeCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(fadeCtx, body, partials, solvedModes);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = blend;
      ctx.drawImage(state.fadeCanvas, 0, 0);
      ctx.restore();
    } else {
      state.objectFade = null;
      paint(ctx, body, partials, solvedModes);
    }
    state.objectShown = { sig, body, partials: partials.map((partial) => ({ ...partial })) };
    writeObjectCaption(body, selected, partials.length);
    if (blend < 1) requestAnimationFrame(() => paintDesignerObject());
  }

  function kickObject() {
    if (!objectCanvas || objectCanvas.hidden || state.objectFrame) return;
    const frame = () => {
      paintDesignerObject();
      const age = state.objectStrike ? (performance.now() - state.objectStrike) / 1000 : 99;
      const alive = state.objectStrike && state.partials.some((partial) => age < Math.max(0.4, partial.decay || 0.2) * 1.2);
      if (alive) state.objectFrame = requestAnimationFrame(frame);
      else {
        state.objectFrame = 0;
        if (state.objectStrike) {
          state.objectStrike = 0;
          paintDesignerObject();
        }
        ensureObjectIdle();
      }
    };
    state.objectFrame = requestAnimationFrame(frame);
  }
  state.kickObject = kickObject;

  function showDesignerView(mode) {
    const object = mode === 'object';
    if (objectCanvas) objectCanvas.hidden = !object;
    if (canvas) canvas.hidden = object;
    for (const button of root.querySelectorAll('[data-view-mode]')) {
      if (!button.closest('[data-tool="designer"]') && !button.closest('.stage-view')) continue;
      if (button.closest('#tool-generator')) continue;
      button.setAttribute('aria-pressed', String(button.dataset.viewMode === mode));
    }
    if (object) {
      paintDesignerObject();
      if (state.objectStrike) kickObject();
      else ensureObjectIdle();
    } else {
      if (state.idleFrame) cancelAnimationFrame(state.idleFrame);
      state.idleFrame = 0;
      const caption = root.querySelector('[data-object-caption]');
      if (caption) caption.hidden = true;
      draw(canvas, state.partials, state);
    }
  }

  function objectOnScreen() {
    return Boolean(objectCanvas && !objectCanvas.hidden && !root.hidden);
  }

  function ensureObjectIdle() {
    if (state.idleFrame || state.objectFrame || !objectOnScreen()) return;
    const frame = () => {
      if (!objectOnScreen() || state.objectFrame) {
        state.idleFrame = 0;
        return;
      }
      paintDesignerObject();
      state.idleFrame = requestAnimationFrame(frame);
    };
    state.idleFrame = requestAnimationFrame(frame);
  }
  new MutationObserver(() => {
    if (!objectOnScreen()) {
      if (state.idleFrame) cancelAnimationFrame(state.idleFrame);
      state.idleFrame = 0;
      return;
    }
    ensureObjectIdle();
  }).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  for (const button of root.querySelectorAll('.stage .view-switch [data-view-mode]')) {
    button.addEventListener('click', () => showDesignerView(button.dataset.viewMode));
  }
  tableBody?.addEventListener('pointerover', (event) => {
    const row = event.target.closest('tr');
    const input = row?.querySelector('[data-index]');
    if (!input) return;
    state.hoverPartial = Number(input.dataset.index);
    paintDesignerObject();
  });
  tableBody?.addEventListener('pointerleave', () => {
    state.hoverPartial = -1;
    paintDesignerObject();
  });

  fields.preset.addEventListener('change', () => { state.bodyMeta = null; pushHistory(); rebuild(); });
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
      if (name === 'position') draw(canvas, state.partials, state);
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
    followProfile();
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
    state.hearFundamental = playedFundamental(state.controls?.pitchScale, noteFrequency(state.note));
    for (const key of root.querySelectorAll('[data-note]')) key.setAttribute('aria-pressed', String(key === button));
    state.userHolding = true;
    cancelAutoHear();
    strike(state, true);
  });
  const release = () => {
    primeAudio(state);
    state.userHolding = false;
    strike(state, false);
  };
  keys.addEventListener('pointerup', release);
  keys.addEventListener('pointercancel', release);
  // iOS fires touchend as well as pointerup for one lift. A second release
  // can cut off the next note, so touchend is only for browsers without pointer events.
  if (typeof PointerEvent !== 'function') keys.addEventListener('touchend', release);
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
        select: true,
        x: point.x,
        y: point.y,
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
    if (!state.gesture && canvas.dataset.view === 'zebra' && !canvas.hidden) {
      const point = canvasPoint(canvas, event);
      const hit = hitPartial(
        sampleSlices(state.slices, performance.now()),
        defaultCamera(),
        canvas.clientWidth,
        canvas.clientHeight,
        point.x,
        point.y,
        state.detune || 0,
        state.fit.shown,
      );
      if (hit !== state.hoverPartial) {
        state.hoverPartial = hit;
        draw(canvas, state.partials, state);
        paintDesignerObject();
        markPartialRow(hit >= 0 ? hit : state.selectedPartial);
      }
      return;
    }
    if (!state.gesture) return;
    const point = canvasPoint(canvas, event);
    if (state.gesture.select) return;
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
    if (state.gesture?.select) {
      const point = canvasPoint(canvas, event);
      state.selectedPartial = hitPartial(
        sampleSlices(state.slices, performance.now()),
        defaultCamera(),
        canvas.clientWidth,
        canvas.clientHeight,
        point.x,
        point.y,
        state.detune || 0,
        state.fit.shown,
      );
      state.gesture = null;
      render();
      return;
    }
    if (state.gesture && !state.gesture.moved && !state.drawMode) {
      const index = nearestPartial(state.partials, state.gesture.x, state.gesture.scale || state.scale);
      if (index >= 0) makeRoot(index);
    }
    state.gesture = null;
  });
  canvas.addEventListener('pointercancel', () => { state.gesture = null; });
  canvas.addEventListener('pointerleave', () => {
    if (state.hoverPartial >= 0) {
      state.hoverPartial = -1;
      draw(canvas, state.partials, state);
      paintDesignerObject();
      markPartialRow(state.selectedPartial);
    }
  });
  const objectPoint = (event) => {
    const rect = objectCanvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const hoverObject = (event, stick) => {
    if (!objectCanvas || objectCanvas.hidden) return;
    const point = objectPoint(event);
    const hit = hitObjectMode({
      width: objectCanvas.clientWidth,
      height: objectCanvas.clientHeight,
      body: objectBody(),
      partials: state.partials,
      solvedModes: cachedModes(objectBody()),
    }, point.x, point.y);
    if (stick) state.selectedPartial = hit;
    state.hoverPartial = hit;
    draw(canvas, state.partials, state);
    paintDesignerObject();
    markPartialRow(hit >= 0 ? hit : state.selectedPartial);
  };
  objectCanvas?.addEventListener('pointermove', (event) => hoverObject(event, false));
  objectCanvas?.addEventListener('pointerup', (event) => hoverObject(event, true));
  objectCanvas?.addEventListener('pointerleave', () => {
    state.hoverPartial = -1;
    draw(canvas, state.partials, state);
    paintDesignerObject();
    markPartialRow(state.selectedPartial);
  });
  function markPartialRow(index) {
    for (const row of tableBody?.querySelectorAll('tr') || []) row.classList.remove('is-selected');
    if (index >= 0) tableBody?.querySelector(`[data-index="${index}"]`)?.closest('tr')?.classList.add('is-selected');
  }
  const styleSelect = root.querySelector('[data-draw-style]');
  if (styleSelect) {
    state.drawStyle = styleSelect.value || 'fast';
    styleSelect.addEventListener('change', () => {
      state.drawStyle = styleSelect.value;
      draw(canvas, state.partials, state);
    });
  }
  const density = root.querySelector('[data-density]');
  if (density && density.tagName === 'SELECT') {
    density.addEventListener('change', () => {
      densityChoice = Number(density.value);
      publishShape(MORPH_MS);
      render();
      pushModes();
    });
  }
  let knobDown = false;
  for (const name of ['absorb', 'disperse', 'modal-decay', 'tune', 'normalize', 'decay-kf']) {
    const slider = root.querySelector(`[data-${name}]`);
    if (!slider) continue;
    slider.addEventListener('pointerdown', () => { knobDown = true; });
    slider.addEventListener('pointerup', () => { knobDown = false; });
    slider.addEventListener('pointercancel', () => { knobDown = false; });
    slider.addEventListener('input', () => {
      const out = root.querySelector(`[data-${name}-out]`);
      if (out) out.textContent = slider.value;
      // Density changes the count, so slices grow and shrink over the morph.
      // The other knobs lock to the drag and ease only when set from the keyboard.
      const duration = name === 'density' ? MORPH_MS : (knobDown ? 0 : MORPH_MS);
      publishShape(duration);
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
      draw(canvas, state.partials, state);
      if (state.fit.moving) kickView();
    });
  }
  const rollHistory = createRollHistory(10);
  let rollSeed = 1;
  const rollLocks = defaultLocks();
  for (const button of root.querySelectorAll('[data-lock]')) {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const on = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(on));
      rollLocks[button.dataset.lock] = on;
    });
  }
  const materialSelect = root.querySelector('[data-roll-material]');
  const amountSlider = root.querySelector('[data-roll-amount]');
  amountSlider?.addEventListener('input', () => {
    const out = root.querySelector('[data-roll-amount-out]');
    if (out) out.textContent = Number(amountSlider.value).toFixed(2);
  });
  const wildnessSlider = root.querySelector('[data-roll-wildness]');
  wildnessSlider?.addEventListener('input', () => {
    const out = root.querySelector('[data-roll-wildness-out]');
    if (out) {
      const amount = Number(wildnessSlider.value);
      out.textContent = amount >= 1.2 ? 'extreme' : amount.toFixed(2);
    }
  });
  const readRollKnobs = () => ({
    tune: Number(root.querySelector('[data-tune]')?.value || 0),
    detune: Number(root.querySelector('[data-detune]')?.value || 0) / 100,
    decay: Number(root.querySelector('[data-modal-decay]')?.value || 0) / 100,
    decayKf: Number(root.querySelector('[data-decay-kf]')?.value || 0) / 100,
    position: Number(root.querySelector('[data-position]')?.value || 0.18),
    density: Number(root.querySelector('[data-density]')?.value || 16),
    absorb: Number(root.querySelector('[data-absorb]')?.value || 0) / 100,
    disperse: Number(root.querySelector('[data-disperse]')?.value || 0) / 100,
    normalize: Number(root.querySelector('[data-normalize]')?.value || 0) / 100,
  });
  const writeRoll = (knobs, text, profile) => {
    const setNum = (selector, readout, value) => {
      const input = root.querySelector(selector);
      const out = root.querySelector(readout);
      if (input) input.value = String(value);
      if (out) out.textContent = String(value);
    };
    setNum('[data-tune]', '[data-tune-out]', Math.round(knobs.tune));
    setNum('[data-detune]', '[data-detune-out]', Math.round(knobs.detune * 100));
    setNum('[data-modal-decay]', '[data-modal-decay-out]', Math.round(knobs.decay * 100));
    setNum('[data-decay-kf]', '[data-decay-kf-out]', Math.round(knobs.decayKf * 100));
    setNum('[data-absorb]', '[data-absorb-out]', Math.round(knobs.absorb * 100));
    setNum('[data-disperse]', '[data-disperse-out]', Math.round(knobs.disperse * 100));
    setNum('[data-normalize]', '[data-normalize-out]', Math.round(knobs.normalize * 100));
    const position = root.querySelector('[data-position]');
    const positionOut = root.querySelector('[data-position-out]');
    if (position) position.value = knobs.position.toFixed(2);
    if (positionOut) positionOut.textContent = knobs.position.toFixed(2);
    const density = root.querySelector('[data-density]');
    if (density) {
      density.value = String(knobs.density);
      densityChoice = Number(knobs.density);
    }
    if (profile?.length) {
      state.profilePartials = profile.map((partial) => ({
        ratio: partial.ratio,
        gainDb: partial.gainDb,
        decay: partial.decay,
      }));
    }
    state.detune = knobs.detune;
    state.position = knobs.position;
    state.bodyMeta = null;
    const ask = root.querySelector('[data-ask]');
    const readout = root.querySelector('[data-roll-read]');
    if (ask && text != null) ask.value = text;
    if (readout && text != null) readout.textContent = text;
    publishShape(MORPH_MS);
    render();
    pushModes();
    if (state.fit.moving) kickView();
    const back = root.querySelector('[data-roll-back]');
    const forward = root.querySelector('[data-roll-forward]');
    if (back) back.disabled = rollHistory.past.length === 0;
    if (forward) forward.disabled = rollHistory.future.length === 0;
  };
  const snapshotRoll = () => ({
    knobs: readRollKnobs(),
    text: root.querySelector('[data-ask]')?.value || '',
    profile: (state.profilePartials || []).map((partial) => ({
      ratio: partial.ratio,
      gainDb: partial.gainDb,
      decay: partial.decay,
    })),
  });
  root.querySelector('[data-roll]')?.addEventListener('click', () => {
    const current = snapshotRoll();
    pushRoll(rollHistory, current);
    rollSeed = (rollSeed + 1) >>> 0;
    const rolled = rollSound({
      base: state.profilePartials || state.partials,
      current: current.knobs,
      material: materialSelect?.value || 'any',
      amount: Number(amountSlider?.value || 1),
      wildness: Number(wildnessSlider?.value ?? 0.3),
      locks: rollLocks,
      seed: (Date.now() ^ rollSeed) >>> 0,
    });
    writeRoll(rolled.knobs, rolled.description, rolled.profile);
  });
  root.querySelector('[data-roll-back]')?.addEventListener('click', () => {
    const restored = undoRoll(rollHistory, snapshotRoll());
    if (restored) writeRoll(restored.knobs, restored.text, restored.profile);
  });
  root.querySelector('[data-roll-forward]')?.addEventListener('click', () => {
    const restored = redoRoll(rollHistory, snapshotRoll());
    if (restored) writeRoll(restored.knobs, restored.text, restored.profile);
  });
  tableBody.addEventListener('focusin', (event) => {
    if (canvas.dataset.view !== 'zebra') return;
    const input = event.target.closest?.('[data-index]');
    if (!input) return;
    state.selectedPartial = Number(input.dataset.index);
    draw(canvas, state.partials, state);
    paintDesignerObject();
    for (const row of tableBody.querySelectorAll('tr')) row.classList.remove('is-selected');
    input.closest('tr')?.classList.add('is-selected');
  });

  root.querySelector('[data-export]').addEventListener('click', () => {
    const description = root.querySelector('[data-ask]')?.value
      || root.querySelector('[data-roll-read]')?.textContent
      || state.profileName;
    const exported = zebraExport(state.partials, { ...heardOptions(), description });
    const blob = new Blob([exported.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exported.filename;
    link.click();
    URL.revokeObjectURL(url);
    const hint = root.querySelector('[data-export-hint]');
    if (hint) hint.textContent = exported.hint;
  });

  root.querySelector('[data-import]').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const partials = fromCsv(await file.text(), { filename: file.name });
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
        followProfile();
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
      followProfile();
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
    state.carried = carryControls(controls);
    state.hearFundamental = playedFundamental(controls.pitchScale, noteFrequency(state.note));
    markPlayedNote(root, state.hearFundamental);
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
    // Density 16 keeps only the lowest partials. A bright black hole puts its
    // new energy above that cut, so the grid has to cover the whole profile
    // or Hear and the 3D view stay on the dark body.
    if (coverProfile()) {
      publishShape(0);
      render();
      pushModes();
    }
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

  function setShapeNumber(selector, readout, value, digits) {
    const input = root.querySelector(selector);
    const out = readout ? root.querySelector(readout) : null;
    if (input) input.value = String(value);
    if (out) out.textContent = digits == null ? String(value) : Number(value).toFixed(digits);
  }

  function ensureDensityCount(count) {
    const select = root.querySelector('[data-density]');
    if (!select || !(count > 0)) return;
    const has = [...select.options].some((option) => Number(option.value) === count);
    if (!has) {
      const option = document.createElement('option');
      option.value = String(count);
      option.textContent = String(count);
      select.append(option);
    }
    select.value = String(count);
    densityChoice = count;
  }

  function receiveHandoff(payload) {
    if (!payload?.partials?.length) return;
    const controls = sanitizeControls(payload.controls || {});
    state.carried = carryControls(controls);
    state.controls = controls;
    state.bodyMeta = {
      material: payload.material || '',
      shape: payload.shape || '',
      size: payload.size || 'medium',
      objectName: payload.objectName || payload.name || '',
    };
    state.profileName = payload.name || 'From generator';
    fields.preset.value = controls.preset;
    fields.stiffness.value = String(controls.stiffness);
    fields.brightness.value = String(controls.brightness);
    fields.damping.value = String(controls.damping);
    fields.oddEven.value = String(controls.oddEven);
    fields.seed.value = String(controls.seed);
    readouts.stiffness.textContent = controls.stiffness.toFixed(2);
    readouts.brightness.textContent = controls.brightness.toFixed(2);
    readouts.damping.textContent = controls.damping.toFixed(2);
    readouts.oddEven.textContent = controls.oddEven.toFixed(2);
    const nameInput = root.querySelector('[data-name]');
    if (nameInput) nameInput.value = state.profileName;
    const exciter = root.querySelector('[data-exciter]');
    if (payload.exciter && exciter) exciter.value = payload.exciter;
    if (payload.hardness != null) setShapeNumber('[data-hardness]', '[data-hardness-out]', payload.hardness, 2);
    if (payload.velocity != null) setShapeNumber('[data-velocity]', '[data-velocity-out]', payload.velocity, 2);
    setShapeNumber('[data-tune]', '[data-tune-out]', 0, 0);
    const detune = Number(payload.detune) || 0;
    setShapeNumber('[data-detune]', '[data-detune-out]', Math.round(detune * 100), 0);
    setShapeNumber('[data-modal-decay]', '[data-modal-decay-out]', 0, 0);
    setShapeNumber('[data-decay-kf]', '[data-decay-kf-out]', 0, 0);
    setShapeNumber('[data-absorb]', '[data-absorb-out]', 0, 0);
    setShapeNumber('[data-disperse]', '[data-disperse-out]', 0, 0);
    setShapeNumber('[data-normalize]', '[data-normalize-out]', 0, 0);
    const position = payload.position ?? 0.18;
    setShapeNumber('[data-position]', '[data-position-out]', position, 2);
    state.detune = detune;
    state.position = position;
    state.exciter = payload.exciter || state.exciter;
    state.hardness = payload.hardness ?? state.hardness;
    state.velocity = payload.velocity ?? state.velocity;
    ensureDensityCount(payload.partials.length);
    readPlayControls();
    state.hearFundamental = playedFundamental(controls.pitchScale, noteFrequency(state.note));
    const copy = payload.partials.map((partial) => ({
      ratio: partial.ratio,
      gainDb: partial.gainDb,
      decay: partial.decay,
    }));
    pushHistory();
    state.profilePartials = copy;
    state.partials = copy;
    state.custom = true;
    publishShape(0);
    render();
    pushModes();
  }

  readPlayControls();
  rebuild();
  updateHistoryButtons();
  showRoot();
  root.addEventListener('pointerdown', () => primeAudio(state), true);
  installGestureUnlock(root, () => {
    const ctx = beginAudio(state.audio);
    if (ctx) state.audio = ctx;
    return state.audio;
  });
  root.querySelector('[data-note="A4"]')?.setAttribute('aria-pressed', 'true');
  window.addEventListener('resize', () => {
    draw(canvas, state.partials, state);
    paintDesignerObject();
  });
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => {
    draw(canvas, state.partials, state);
    paintDesignerObject();
  };
  if (typeof scheme.addEventListener === 'function') scheme.addEventListener('change', onScheme);
  else scheme.addListener(onScheme);

  function setShareStatus(text) {
    const el = root.querySelector('[data-share-status]');
    if (el) el.textContent = text || '';
  }

  root.querySelector('[data-share]')?.addEventListener('click', async () => {
    const profile = profileFromState();
    const encoded = encodeProfile(profile);
    const url = `${location.origin}${location.pathname}${location.search}#p=${encoded}`;
    history.replaceState(null, '', `#p=${encoded}`);
    if (url.length > 12000) {
      setShareStatus('This profile is too long for a link. Export the CSV instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus('Link copied. It stores the recipe, and any partial edits.');
    } catch {
      setShareStatus('The link is in the address bar.');
    }
  });

  const shared = decodeProfile(location.hash);
  if (shared?.partials?.length) {
    receiveHandoff(shared);
    setShareStatus('Opened a shared profile.');
  } else if (shared?.controls) {
    applyRecipe(shared, { hear: false, history: false });
    setShareStatus('Opened a shared profile.');
  }

  return { receiveHandoff };
}

function markPlayedNote(root, hz) {
  let best = null;
  let bestCents = 50;
  for (const name of NOTE_BUTTONS) {
    const cents = Math.abs(1200 * Math.log2(noteFrequency(name) / hz));
    if (cents < bestCents) {
      bestCents = cents;
      best = name;
    }
  }
  for (const key of root.querySelectorAll('[data-note]')) {
    key.setAttribute('aria-pressed', String(Boolean(best) && key.dataset.note === best));
  }
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
  // Drop partials Zebra rings past about 12 kHz at A4, instead of folding
  // them under a neighbor. Folding made the list unsorted and pulled real
  // modes off their ratios.
  const limit = ZEBRA_PARTIAL_LIMIT_HZ / A4_HZ;
  const kept = partials
    .filter((partial) => partial.ratio > 0 && partial.ratio <= limit)
    .sort((a, b) => a.ratio - b.ratio);
  if (kept.length) return kept;
  const lowest = [...partials].sort((a, b) => a.ratio - b.ratio)[0];
  return lowest ? [{ ...lowest, ratio: Math.min(lowest.ratio, limit) }] : [];
}

function playHeard(state, recipe) {
  const AudioCtx = audioContextClass();
  if (!AudioCtx) throw new Error('This browser cannot play audio.');
  prepareAudioSession();
  if (!state.audio) state.audio = new AudioCtx();
  const ctx = state.audio;
  // Safari stays silent unless a buffer is started in this gesture, before any await.
  const resumed = resumeInGesture(ctx);
  playSilentUnlock(ctx);
  const exciter = recipe.exciter || state.exciter;
  const zebra = state.canvas?.dataset.view === 'zebra';
  const fundamental = state.hearFundamental || noteFrequency(state.note);
  const partials = audiblePartials(state.partials, { fundamental, sampleRate: ctx.sampleRate });
  const seconds = heardSeconds(partials, { exciter, zebra });
  const samples = renderPreview(partials, {
    fundamental,
    velocity: state.velocity,
    position: state.position,
    exciter,
    hardness: state.hardness,
    file: state.file,
    sampleRate: ctx.sampleRate,
    seconds,
    impulse: false,
    // The exciter model collapses a gong or a chandelier to a click, so the
    // Bright / Dark / Long partials never reach the speaker. Hear plays the
    // partial list itself.
    matchGains: true,
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
  state.objectStrike = performance.now();
  state.kickObject?.();
  const root = state.canvas?.closest('#modal-app');
  Promise.resolve(resumed).then(() => {
    if (ctx.state === 'suspended' || ctx.state === 'interrupted') setPlayError(root, SILENT_MODE_HINT);
  }).catch(() => setPlayError(root, SILENT_MODE_HINT));
}

function drawZebra(canvas, partials, state) {
  if (!canvas || canvas.hidden) return;
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
    camera: defaultCamera(),
    style: state.drawStyle || 'fast',
    colors,
    invertPanel: canvas.dataset.panel !== 'cream',
    selected: state.hoverPartial >= 0 ? state.hoverPartial : state.selectedPartial,
    detune: state.detune || 0,
    position: state.position,
    now: performance.now(),
    fitMotion: state.fit,
    slices: state.slicesReady ? sampleSlices(state.slices, performance.now()) : undefined,
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
    fundamental: state.hearFundamental || noteFrequency(state.note),
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
  const ctx = beginAudio(state.audio);
  if (!ctx) return null;
  state.audio = ctx;
  const pending = resumeInGesture(ctx);
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
  const AudioCtx = audioContextClass();
  if (!AudioCtx) throw new Error('This browser cannot play audio.');
  prepareAudioSession();
  if (!state.audio) state.audio = new AudioCtx();
  // Start resume in this turn, before any await, so the user gesture still counts.
  const resumed = resume ? resumeInGesture(state.audio) : null;
  if (!state.workletReady && !state.workletFailed && !state.workletLoading) {
    state.workletLoading = (async () => {
      try {
        await state.audio.audioWorklet.addModule('/modal-preview-resonator.worklet.js');
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
  if (down) {
    state.objectStrike = performance.now();
    state.kickObject?.();
    primeAudio(state);
  }
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
  state.objectStrike = 0;
  state.kickObject?.();
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
  const fundamental = state.hearFundamental || noteFrequency(state.note);
  const shape = audio.createWaveShaper();
  shape.curve = limiterCurve();
  shape.connect(audio.destination);
  state.fallback.push(shape);
  const master = audio.createGain();
  let ampSum = 0;
  const gains = state.partials.map((partial, index) => {
    const weight = strikeWeight(index, state.position);
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

