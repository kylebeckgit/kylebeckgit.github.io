// Describe-first flow. The reading is local on purpose: this preview does not call a model.

import { describePrompt, fileSlug, STARTERS } from './recipes.js';

const ALLOWANCE = 8;
const STORAGE_KEY = 'modal-describe-preview-uses';

export function mountStudio(root, api) {
  const askText = root.querySelector('[data-ask]');
  const askButton = root.querySelector('[data-ask-btn]');
  const refineText = root.querySelector('[data-refine-text]');
  const refineButton = root.querySelector('[data-refine-btn]');
  const backButton = root.querySelector('[data-step-back]');
  const cards = root.querySelector('[data-cards]');
  const results = root.querySelector('[data-results]');
  const thread = root.querySelector('[data-thread]');
  const allowance = root.querySelector('[data-allowance]');
  const status = root.querySelector('[data-studio-status]');
  const nameInput = root.querySelector('[data-name]');
  if (!askText || !cards) return;

  const turns = [];
  const future = [];
  let selected = 0;
  const openButton = root.querySelector('[data-open-designer]');

  const used = () => {
    try { return Number(sessionStorage.getItem(STORAGE_KEY) || '0') || 0; } catch { return 0; }
  };
  const setUsed = (count) => {
    try { sessionStorage.setItem(STORAGE_KEY, String(count)); } catch { /* private mode */ }
  };
  const showAllowance = () => {
    const left = Math.max(0, ALLOWANCE - used());
    if (allowance) allowance.textContent = `${left} of ${ALLOWANCE} describes left in this session. Nothing is sent.`;
  };

  function setStatus(text) {
    if (status) status.textContent = text;
  }

  function render() {
    const turn = turns[turns.length - 1];
    if (!turn) {
      results.hidden = true;
      return;
    }
    results.hidden = false;
    thread.innerHTML = turn.thread.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
    cards.innerHTML = turn.variations.map((variation, index) => `
      <article class="var-card${index === selected ? ' is-selected' : ''}" data-variation="${index}" aria-pressed="${index === selected}">
        <h3>${escapeHtml(variation.name)}</h3>
        <p>${escapeHtml(variation.line)}</p>
        <button type="button" class="btn" data-hear="${index}">Hear</button>
      </article>`).join('');
    if (backButton) backButton.disabled = turns.length < 2;
    const forwardButton = root.querySelector('[data-gen-forward]');
    if (forwardButton) forwardButton.disabled = future.length === 0;
    const backRoll = root.querySelector('[data-gen-back]');
    if (backRoll) backRoll.disabled = turns.length < 2;
    if (openButton) openButton.disabled = !turn.variations[selected];
    if (nameInput) nameInput.value = turn.variations[selected]?.name || nameInput.value;
  }

  function choose(index, hear) {
    const turn = turns[turns.length - 1];
    const variation = turn?.variations[index];
    if (!variation) return;
    selected = index;
    turn.selected = index;
    api.applyRecipe(variation, { hear });
    render();
  }

  function pushTurn(prompt, current) {
    const count = used();
    if (count >= ALLOWANCE) {
      setStatus(`This session has used its ${ALLOWANCE} describes. The starters under More still play.`);
      return false;
    }
    const variations = describePrompt(prompt, current);
    if (variations[0].reading) setStatus(variations[0].reading);
    else if (!variations[0].recognized && !current) setStatus('No material was named, so this was read as a metal plate.');
    else setStatus('');
    const previous = turns[turns.length - 1];
    if (previous) previous.selected = selected;
    future.length = 0;
    turns.push({
      thread: previous ? [...previous.thread, prompt] : [prompt],
      variations,
      selected: 0,
    });
    selected = 0;
    setUsed(count + 1);
    showAllowance();
    choose(0, true);
    return true;
  }

  askButton?.addEventListener('click', () => {
    const prompt = askText.value.trim();
    if (!prompt) {
      setStatus('Try describing an object.');
      return;
    }
    turns.length = 0;
    pushTurn(prompt, null);
  });
  askText.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      askButton?.click();
    }
  });

  refineText?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      refineButton?.click();
    }
  });

  refineButton?.addEventListener('click', () => {
    const prompt = refineText.value.trim();
    const turn = turns[turns.length - 1];
    if (!turn) {
      setStatus('Describe a sound before refining it.');
      return;
    }
    if (!prompt) {
      setStatus('Say what should change.');
      return;
    }
    if (pushTurn(prompt, turn.variations[selected])) refineText.value = '';
  });

  function stepBack() {
    if (turns.length < 2) return false;
    future.push(turns.pop());
    setStatus('');
    choose(rememberedIndex(turns[turns.length - 1]), false);
    return true;
  }

  function stepForward() {
    const next = future.pop();
    if (!next) return false;
    turns.push(next);
    setStatus('');
    choose(rememberedIndex(next), false);
    return true;
  }

  backButton?.addEventListener('click', () => { stepBack(); });
  root.querySelector('[data-gen-back]')?.addEventListener('click', () => { stepBack(); });
  root.querySelector('[data-gen-forward]')?.addEventListener('click', () => { stepForward(); });
  openButton?.addEventListener('click', () => {
    const variation = turns[turns.length - 1]?.variations[selected];
    if (!variation || !api.openInDesigner) return;
    api.openInDesigner(variation);
  });

  cards.addEventListener('click', (event) => {
    const hear = event.target.closest('[data-hear]');
    if (!hear) return;
    choose(Number(hear.dataset.hear), true);
  });

  root.querySelector('[data-starters]')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-starter]');
    if (!button) return;
    const recipe = STARTERS[Number(button.dataset.starter)];
    if (!recipe) return;
    turns.length = 0;
    future.length = 0;
    selected = 0;
    turns.push({ thread: [recipe.name], variations: [recipe], selected: 0 });
    results.hidden = true;
    api.applyRecipe(recipe, { hear: true });
    if (nameInput) nameInput.value = recipe.name;
    if (openButton) openButton.disabled = false;
    setStatus(recipe.line);
  });

  nameInput?.addEventListener('input', () => {
    api.setName(nameInput.value);
  });

  root.querySelector('[data-share]')?.addEventListener('click', async () => {
    const profile = api.profileFromState();
    const encoded = encodeProfile(profile);
    const url = `${location.origin}${location.pathname}${location.search}#p=${encoded}`;
    history.replaceState(null, '', `#p=${encoded}`);
    if (url.length > 12000) {
      setStatus('This profile is too long for a link. Export the CSV instead.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied. It stores the recipe, and any partial edits.');
    } catch {
      setStatus('The link is in the address bar.');
    }
  });

  showAllowance();
  const controller = {
    showFresh(prompt, hear = true) {
      const variations = describePrompt(prompt);
      const previous = turns[turns.length - 1];
      if (previous) previous.selected = selected;
      future.length = 0;
      turns.push({ thread: [prompt], variations, selected: 0 });
      selected = 0;
      if (variations[0].reading) setStatus(variations[0].reading);
      choose(0, hear);
      return variations;
    },
    current() {
      return turns[turns.length - 1]?.variations[selected] || null;
    },
  };
  const starterRoot = root.querySelector('[data-starters]');
  if (starterRoot) {
    starterRoot.innerHTML = STARTERS.map((recipe, index) =>
      `<button type="button" class="btn" data-starter="${index}">${escapeHtml(recipe.name)}</button>`).join('');
  }
  return controller;
}

export function rememberedIndex(turn) {
  const count = turn?.variations?.length || 0;
  if (!count) return 0;
  const index = Number.isInteger(turn.selected) ? turn.selected : 0;
  return Math.max(0, Math.min(index, count - 1));
}

export function encodeProfile(profile) {
  const json = JSON.stringify(profile);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function decodeProfile(hash) {
  const match = /^#p=([\w-]+)/.exec(hash || '');
  if (!match) return null;
  try {
    const padded = match[1].replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((match[1].length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const profile = JSON.parse(new TextDecoder().decode(bytes));
    if (!profile || typeof profile !== 'object') return null;
    return profile;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

export { fileSlug };
