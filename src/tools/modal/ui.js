import { PRESETS, NOTE_BUTTONS, buildPartials, toCsv, fromCsv, noteFrequency, defaultControls, sanitizeControls } from './engine.js';

export function mount(root) {
  const describeUrl = (root.dataset.describeUrl || '').trim();
  const membershipOn = root.dataset.membership === 'true';
  const state = {
    controls: defaultControls(),
    partials: buildPartials(defaultControls()),
    custom: false,
    note: 'A4',
    playing: [],
    audio: null,
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

  function rebuild() {
    readControls();
    state.partials = buildPartials(state.controls);
    state.custom = false;
    render();
  }

  function render() {
    draw(canvas, state.partials);
    tableBody.innerHTML = state.partials.map((partial, index) => `
      <tr>
        <th scope="row">${index + 1}</th>
        <td><input type="number" step="0.0001" min="0.0001" data-index="${index}" data-field="ratio" value="${partial.ratio.toFixed(4)}" aria-label="Partial ${index + 1} ratio"></td>
        <td><input type="number" step="0.01" data-index="${index}" data-field="gainDb" value="${partial.gainDb.toFixed(2)}" aria-label="Partial ${index + 1} gain"></td>
        <td><input type="number" step="0.001" min="0.001" data-index="${index}" data-field="decay" value="${partial.decay.toFixed(3)}" aria-label="Partial ${index + 1} decay"></td>
      </tr>`).join('');
  }

  fields.preset.addEventListener('change', rebuild);
  for (const name of ['stiffness', 'brightness', 'damping', 'oddEven']) {
    fields[name].addEventListener('input', rebuild);
  }
  fields.seed.addEventListener('change', rebuild);
  root.querySelector('[data-random]').addEventListener('click', () => {
    fields.seed.value = String(1 + Math.floor(Math.random() * 999999));
    rebuild();
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
    state.partials[index][field] = value;
    state.custom = true;
    draw(canvas, state.partials);
  });

  root.querySelector('[data-keys]').addEventListener('click', (event) => {
    const button = event.target.closest('[data-note]');
    if (!button) return;
    state.note = button.dataset.note;
    for (const key of root.querySelectorAll('[data-note]')) key.setAttribute('aria-pressed', String(key === button));
    play(state);
  });
  root.querySelector('[data-stop]').addEventListener('click', () => stop(state));

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
      state.partials = fromCsv(await file.text());
      state.custom = true;
      render();
      setMessage('');
    } catch (error) {
      setMessage(error.message);
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

  rebuild();
  root.querySelector('[data-note="A4"]')?.setAttribute('aria-pressed', 'true');
  window.addEventListener('resize', () => draw(canvas, state.partials));
}

function draw(canvas, partials) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 220;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#fbf8f2';
  ctx.fillRect(0, 0, width, height);
  const min = Math.min(...partials.map((p) => p.ratio));
  const max = Math.max(...partials.map((p) => p.ratio));
  const logMin = Math.log(min);
  const logMax = Math.log(max === min ? min * 1.01 : max);
  const pad = 16;
  ctx.strokeStyle = '#d8d0c1';
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.stroke();
  for (const partial of partials) {
    const x = pad + ((Math.log(partial.ratio) - logMin) / (logMax - logMin)) * (width - pad * 2);
    const gain = Math.max(-80, Math.min(0, partial.gainDb));
    const bar = ((gain + 80) / 80) * (height - pad * 2);
    ctx.fillStyle = partial.gainDb > -18 ? '#d4421c' : '#1f1d1a';
    ctx.fillRect(x - 1.5, height - pad - bar, 3, bar);
  }
}

function stop(state) {
  for (const node of state.playing) {
    try { node.stop(); } catch { /* already stopped */ }
  }
  state.playing = [];
}

function play(state) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  if (!state.audio) state.audio = new AudioCtx();
  state.audio.resume();
  stop(state);
  const now = state.audio.currentTime + 0.02;
  const fundamental = noteFrequency(state.note);
  const master = state.audio.createGain();
  master.gain.value = 0.2;
  master.connect(state.audio.destination);
  for (const partial of state.partials) {
    if (partial.gainDb < -72) continue;
    const osc = state.audio.createOscillator();
    const gain = state.audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = Math.min(20000, fundamental * partial.ratio);
    const peak = Math.min(0.2, 10 ** (partial.gainDb / 20));
    gain.gain.setValueAtTime(Math.max(peak, 0.0001), now);
    const seconds = Math.min(8, Math.max(0.08, partial.decay));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + seconds + 0.05);
    state.playing.push(osc);
  }
}
