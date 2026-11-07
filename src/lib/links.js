// A checkout link is live only when packs.json has a real https URL.
// A TODO placeholder (or any non-URL) stays a non-link "Coming soon" state.
export function isLiveUrl(url) {
  if (typeof url !== 'string') return false;
  const value = url.trim();
  if (!/^https:\/\/\S+$/.test(value)) return false;
  if (/TODO|PLACEHOLDER/i.test(value)) return false;
  return true;
}
