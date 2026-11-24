// Throttle tally broadcasts to at most one leading send per window,
// then flush the latest tally on the trailing edge so a burst of votes
// is not missing its last update.

export const TALLY_MIN_MS = 250;

export function planTallySend(lastSentAt, nowMs, minMs = TALLY_MIN_MS) {
  const now = Number(nowMs);
  const min = Math.max(0, Number(minMs) || TALLY_MIN_MS);
  if (lastSentAt == null || !Number.isFinite(Number(lastSentAt))) return { send: true, delayMs: 0 };
  const last = Number(lastSentAt);
  if (!Number.isFinite(now) || now - last >= min) return { send: true, delayMs: 0 };
  return { send: false, delayMs: min - (now - last) };
}

export function createTallyBroadcaster(options = {}) {
  const minMs = options.minMs ?? TALLY_MIN_MS;
  const schedule = options.setTimeout || setTimeout;
  const cancel = options.clearTimeout || clearTimeout;
  const clock = options.now || Date.now;
  let lastAt = null;
  let timer = null;
  let pending = false;

  function flush(now) {
    if (timer != null) {
      cancel(timer);
      timer = null;
    }
    pending = false;
    lastAt = now;
    if (typeof options.send === 'function') options.send(now);
  }

  function request(now = clock()) {
    const plan = planTallySend(lastAt, now, minMs);
    if (plan.send) {
      flush(now);
      return plan;
    }
    pending = true;
    if (timer == null) {
      timer = schedule(() => {
        timer = null;
        if (!pending) return;
        flush(clock());
      }, plan.delayMs);
    }
    return plan;
  }

  function clear() {
    if (timer != null) cancel(timer);
    timer = null;
    pending = false;
  }

  return {
    request,
    flush,
    clear,
    get lastAt() { return lastAt; },
    get pending() { return pending; },
  };
}
