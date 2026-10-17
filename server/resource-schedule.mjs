// Adapted from PartDrop server/src/store.ts nextSlot (MIT).
// Copyright (c) 2026 Konstantin Saifoulline. See licenses/partdrop-MIT.txt.
// Explicit timestamps and supplied reservations replace PartDrop's live shop clock.
export function firstFreeSlot(reservations, earliest, durationMs) {
  if (!Number.isFinite(earliest) || !Number.isFinite(durationMs) || durationMs <= 0) throw new Error('Invalid scheduling interval.');
  let start = earliest;
  const ordered = reservations.map(row => ({ start: Date.parse(row.start), end: Date.parse(row.end) }));
  if (ordered.some(row => !Number.isFinite(row.start) || !Number.isFinite(row.end) || row.end <= row.start)) throw new Error('Invalid reservation.');
  ordered.sort((a,b)=>a.start-b.start);
  for (const row of ordered) {
    if (start + durationMs <= row.start) break;
    if (row.end > start) start = row.end;
  }
  return { start: new Date(start).toISOString(), end: new Date(start + durationMs).toISOString() };
}
