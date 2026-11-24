// Public shape for approved clips. The server speech column is
// authoritative: it forces 100% wet resonance and drops slice
// metadata so the client cannot chop a voice clip into hits.

export function publicMeta(meta = {}, speech, keepOptIn) {
  const isSpeech = Boolean(speech);
  return {
    kind: meta.kind === 'unpitched' ? 'unpitched' : 'pitched',
    f0Hz: meta.f0Hz || null,
    recordedMidi: meta.recordedMidi ?? null,
    centsOffset: meta.centsOffset || 0,
    targetMidi: meta.targetMidi ?? null,
    slices: isSpeech ? [] : (Array.isArray(meta.slices) ? meta.slices : []),
    durationMs: meta.durationMs || 0,
    resonanceMix: isSpeech ? 1 : (meta.resonanceMix ?? 0.4),
    speech: isSpeech,
    hasSpeech: isSpeech,
    keepOptIn: Boolean(keepOptIn ?? meta.keepOptIn),
  };
}

export function clipApprovedAt(row) {
  const n = Number(row?.approvedAt ?? row?.meta?.approvedAt ?? row?.createdAt);
  return Number.isFinite(n) ? n : 0;
}

export function clipAudioPath(id, version) {
  const base = `/uploads/${id}/audio`;
  const v = Number(version);
  return Number.isFinite(v) && v > 0 ? `${base}?v=${v}` : base;
}

export function publicClip(row) {
  const speech = Boolean(row?.speech || row?.hasSpeech);
  const approvedAt = clipApprovedAt(row);
  return {
    id: row.id,
    createdAt: row.createdAt,
    approvedAt,
    meta: publicMeta(row.meta, speech, row.keepOptIn),
    speech,
    hasSpeech: speech,
    keepOptIn: Boolean(row.keepOptIn),
    audioUrl: row.audioUrl || clipAudioPath(row.id, approvedAt),
  };
}
