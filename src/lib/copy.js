// Bracket notes and blank strings stay in the data files and are not rendered.
// Replace a note with final text (no "[") and rebuild to show that block again.
export function isPlaceholder(value) {
  if (typeof value !== 'string') return true;
  const text = value.trim();
  return text.length === 0 || text.includes('[');
}

export function visible(value) {
  return isPlaceholder(value) ? '' : value.trim();
}

export function mediaSrc(value) {
  const text = visible(value);
  return /^(https?:\/\/|\/)/.test(text) ? text : '';
}

// About stays off the nav until bio or music has real text.
// The /about/ route is still built.
export function aboutInNav(copy) {
  return [copy.about.bio, copy.about.music].some((item) => !isPlaceholder(item));
}
