const DEFAULT_API = 'https://jam-room.kbsound.workers.dev';

export async function sendAdminRequest({ api, path, method = 'GET', token, fetch: post } = {}) {
  const secret = String(token || '').trim();
  if (!secret) return { ok: false, message: 'Enter the admin token.' };
  const url = `${String(api || DEFAULT_API).replace(/\/$/, '')}${path}`;
  try {
    const request = post || globalThis.fetch;
    const res = await request(url, {
      method,
      headers: { 'X-Admin-Token': secret },
    });
    if (res.status === 404) return { ok: false, status: 404, message: 'That token was not accepted.' };
    if (!res.ok) return { ok: false, status: res.status, message: 'The request failed.' };
    try {
      return { ok: true, status: res.status, data: await res.json() };
    } catch {
      return { ok: false, status: res.status, message: 'The request failed.' };
    }
  } catch {
    return { ok: false, message: 'The request failed.' };
  }
}

export function mountJamAdmin(root, options = {}) {
  if (!root) return null;
  const api = root.getAttribute('data-api-url') || DEFAULT_API;
  const tokenInput = root.querySelector('[data-admin-token]');
  const statusEl = root.querySelector('[data-admin-status]');
  const listEl = root.querySelector('[data-admin-list]');
  const loadBtn = root.querySelector('[data-admin-load]');
  const killBtn = root.querySelector('[data-admin-kill]');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text || '';
  }

  function token() {
    return String(tokenInput?.value || '').trim();
  }

  async function request(path, method = 'GET') {
    const result = await sendAdminRequest({
      api,
      path,
      method,
      token: token(),
      fetch: options.fetch,
    });
    if (!result.ok) {
      setStatus(result.message);
      return null;
    }
    return result.data;
  }

  function render(uploads) {
    if (!listEl) return;
    listEl.replaceChildren();
    if (!uploads?.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'No clips in the room.';
      listEl.append(empty);
      return;
    }
    for (const clip of uploads) {
      const row = document.createElement('div');
      row.className = 'clip';
      const label = document.createElement('span');
      const when = clip.createdAt ? new Date(clip.createdAt).toLocaleString() : '';
      label.textContent = `${clip.status || 'unknown'} · ${clip.speech ? 'voice' : (clip.meta?.kind || 'clip')} · ${when}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        const result = await request(`/admin/remove/${clip.id}`, 'POST');
        if (result?.ok) {
          setStatus('Removed.');
          await load();
        }
      });
      row.append(label, remove);
      listEl.append(row);
    }
  }

  async function load() {
    const result = await request('/admin/uploads');
    if (!result) return;
    render(result.uploads || []);
    setStatus(`Loaded ${result.uploads?.length || 0} clip${(result.uploads?.length || 0) === 1 ? '' : 's'}.`);
  }

  loadBtn?.addEventListener('click', () => { load(); });
  killBtn?.addEventListener('click', async () => {
    if (!window.confirm('Clear every clip in the room?')) return;
    const result = await request('/admin/kill', 'POST');
    if (result?.ok) {
      setStatus('The pool is empty.');
      render([]);
    }
  });

  return { load };
}
