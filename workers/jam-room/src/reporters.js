// Identify reporters and uploaders by a salted hash of their IP.
// Raw IPs are never stored. A missing IP cannot file a report.

export async function hashReporterId(salt, ip) {
  const secret = String(salt || '');
  const value = String(ip || '').trim();
  if (!secret || !value) return '';
  const data = new TextEncoder().encode(`${secret}\n${value}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function distinctReporterCount(hashes) {
  const ids = new Set();
  for (const hash of hashes || []) {
    const id = String(hash || '');
    if (id) ids.add(id);
  }
  return ids.size;
}

export function roomSizeFromHashes(hashes) {
  return Math.max(1, distinctReporterCount(hashes));
}

export function considerReport(reports, reporterHash, uploaderHash) {
  const current = Array.isArray(reports) ? reports.map(String) : [];
  const hash = String(reporterHash || '');
  if (!hash) return { reports: current, accepted: false, reason: 'missing' };
  if (uploaderHash && hash === String(uploaderHash)) {
    return { reports: current, accepted: false, reason: 'uploader' };
  }
  if (current.includes(hash)) return { reports: current, accepted: false, reason: 'duplicate' };
  return { reports: [...current, hash], accepted: true };
}
