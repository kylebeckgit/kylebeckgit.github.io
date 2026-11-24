import { clipApprovedAt } from './clip-view.js';
import { considerReport } from './reporters.js';
import { PENDING_MAX_AGE_MS, POOL_CAP, RETENTION_MS } from './validate.js';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  userId TEXT,
  meta TEXT NOT NULL,
  audio BLOB,
  reports TEXT NOT NULL DEFAULT '[]',
  speech INTEGER NOT NULL DEFAULT 0,
  keepOptIn INTEGER NOT NULL DEFAULT 0,
  uploaderHash TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS upload_rates (
  userId TEXT PRIMARY KEY,
  times TEXT NOT NULL
);
`;

export function initUploadSchema(sql) {
  sql.exec(SCHEMA);
  const cols = [...sql.exec('PRAGMA table_info(uploads)')].map((row) => row.name || row.Name);
  if (!cols.includes('uploaderHash')) {
    sql.exec("ALTER TABLE uploads ADD COLUMN uploaderHash TEXT NOT NULL DEFAULT ''");
  }
}

export function insertUpload(sql, row) {
  sql.exec(
    'INSERT INTO uploads (id, status, createdAt, updatedAt, userId, meta, audio, reports, speech, keepOptIn, uploaderHash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    row.id, row.status, row.createdAt, row.updatedAt, row.userId || '', JSON.stringify(row.meta), row.audio, JSON.stringify(row.reports || []), row.speech ? 1 : 0, row.keepOptIn ? 1 : 0, row.uploaderHash || '',
  );
}

export function updateUpload(sql, id, fields) {
  const sets = [];
  const args = [];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    args.push(value);
  }
  args.push(id);
  sql.exec(`UPDATE uploads SET ${sets.join(', ')} WHERE id = ?`, ...args);
}

export function getUpload(sql, id) {
  const row = [...sql.exec('SELECT * FROM uploads WHERE id = ?', id)].map(rowFromCursor)[0];
  return row || null;
}

export function listUploads(sql, status) {
  const query = status
    ? [...sql.exec('SELECT id, status, createdAt, updatedAt, userId, meta, reports, speech, keepOptIn FROM uploads WHERE status = ? ORDER BY createdAt DESC', status)]
    : [...sql.exec('SELECT id, status, createdAt, updatedAt, userId, meta, reports, speech, keepOptIn FROM uploads ORDER BY createdAt DESC')];
  return query.map(rowFromCursor);
}

export function sortApprovedPool(rows) {
  return [...(rows || [])].sort((a, b) => {
    const delta = clipApprovedAt(a) - clipApprovedAt(b);
    if (delta !== 0) return delta;
    return String(a.id || '').localeCompare(String(b.id || ''));
  });
}

export function approvedPool(sql) {
  return sortApprovedPool(
    [...sql.exec("SELECT id, status, createdAt, updatedAt, userId, meta, reports, speech, keepOptIn FROM uploads WHERE status = 'approved' ORDER BY createdAt ASC")].map(rowFromCursor),
  );
}

export function deleteUpload(sql, id) {
  sql.exec('DELETE FROM uploads WHERE id = ?', id);
}

export function deleteRejectedAndExpired(sql, now, retentionMs = RETENTION_MS) {
  const cutoff = now - retentionMs;
  sql.exec("DELETE FROM uploads WHERE status = 'rejected'");
  sql.exec("DELETE FROM uploads WHERE status = 'removed'");
  sql.exec("DELETE FROM uploads WHERE status = 'approved' AND createdAt < ?", cutoff);
  sql.exec("DELETE FROM uploads WHERE status = 'pending' AND createdAt < ?", now - PENDING_MAX_AGE_MS);
}

export function countUploads(sql, status) {
  const rows = status
    ? [...sql.exec('SELECT COUNT(*) AS c FROM uploads WHERE status = ?', status)]
    : [...sql.exec('SELECT COUNT(*) AS c FROM uploads')];
  const row = rows[0] || {};
  const value = row.c ?? row.C ?? row['COUNT(*)'] ?? Object.values(row)[0];
  return Number(value) || 0;
}

export function evictOldestIfNeeded(sql) {
  const pool = approvedPool(sql);
  const evicted = [];
  while (pool.length > POOL_CAP) {
    const oldest = pool.shift();
    evicted.push(oldest.id);
    deleteUpload(sql, oldest.id);
  }
  return evicted;
}

export function clearPool(sql) {
  sql.exec('DELETE FROM uploads');
}

export function addReport(sql, id, reporterHash, now) {
  const row = getUpload(sql, id);
  if (!row || row.status !== 'approved') return null;
  const considered = considerReport(row.reports, reporterHash, row.uploaderHash);
  if (!considered.accepted) return { ...row, reports: considered.reports, accepted: false, reason: considered.reason };
  updateUpload(sql, id, { reports: JSON.stringify(considered.reports), updatedAt: now });
  return { ...row, reports: considered.reports, accepted: true };
}

function rowFromCursor(row) {
  const obj = {};
  for (const key of Object.keys(row)) obj[key] = row[key];
  if (typeof obj.meta === 'string') {
    try { obj.meta = JSON.parse(obj.meta); } catch { obj.meta = {}; }
  }
  if (typeof obj.reports === 'string') {
    try { obj.reports = JSON.parse(obj.reports); } catch { obj.reports = []; }
  }
  obj.speech = Boolean(obj.speech);
  obj.keepOptIn = Boolean(obj.keepOptIn);
  return obj;
}
