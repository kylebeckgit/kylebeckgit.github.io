// Shared Zebra profile export for the generator and the designer.
// The CSV, filename, and hint come from zebraExport so both tabs
// write the same file for the same sound.

import { zebraExport } from './engine.js';

export function exportDescription(sound) {
  return String(sound?.description || sound?.name || sound?.profileName || 'Modal profile');
}

export function exportFromSound(sound, extra = {}) {
  const referenceHz = Number(sound?.referenceHz || sound?.refHz || sound?.playReferenceHz);
  const fundamental = Number(sound?.fundamental);
  return zebraExport(sound?.partials || [], {
    fundamental: fundamental > 0 ? fundamental : undefined,
    sampleRate: extra.sampleRate || 48000,
    referenceHz: referenceHz > 0 ? referenceHz : undefined,
    description: exportDescription(sound),
    ...extra,
  });
}

export function canUseAnchorDownload(link) {
  return Boolean(link && 'download' in link);
}

export function downloadExport(exported, doc = globalThis.document, win = globalThis.window) {
  const blob = new Blob([exported.csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = doc.createElement('a');
  const supported = canUseAnchorDownload(link);
  link.href = url;
  if (supported) link.download = exported.filename;
  link.rel = 'noopener';
  doc.body.appendChild(link);
  if (supported) {
    link.click();
  } else if (typeof win?.open === 'function') {
    const opened = win.open(url, '_blank');
    if (!opened && win.location) win.location.assign(url);
  } else if (win?.location) {
    win.location.assign(url);
  }
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return exported;
}
