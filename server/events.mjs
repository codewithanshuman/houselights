// Organizer events: a promoter-created brief with revisions, Qloo research and
// Autopilot decisions. Records are private (organizer access only) and never
// enter the public snapshot table, whose IDs act as shareable bearer links.
import { randomBytes } from 'node:crypto';
import { db, transaction } from './database.mjs';
import { optimizeSlate } from './optimizer.mjs';

db.exec('CREATE TABLE IF NOT EXISTS organizer_events(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const finite = value => typeof value === 'number' && Number.isFinite(value);
const low = value => String(value ?? '').trim().toLowerCase();
export const CURRENCIES = ['GBP', 'USD', 'EUR', 'INR'];
export const FEE_STATUSES = ['quoted', 'estimate', 'unknown'];
export const AVAILABILITIES = ['confirmed', 'assumed', 'unconfirmed', 'unavailable'];
export const LIMITS = { events: 200, runs: 20, candidates: 8, anchors: 3, objectives: 6 };

// Strip control characters; keep ordinary Unicode text.
function clean(value, field, { max, required = false } = {}) {
  if (value == null || value === '') { if (required) throw fault(`${field} is required.`); return null; }
  if (typeof value !== 'string') throw fault(`${field} must be text.`);
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !text) throw fault(`${field} is required.`);
  if (text.length > max) throw fault(`${field} must be at most ${max} characters.`);
  return text || null;
}
function number(value, field, { min = 0, max, integer = false, required = false } = {}) {
  if (value == null || value === '') { if (required) throw fault(`${field} is required.`); return null; }
  if (!finite(value) || value < min || value > max || (integer && !Number.isInteger(value))) throw fault(`${field} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`);
  return value;
}
const only = (value, allowed, field) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault(`${field} must be an object.`);
  const unknown = Object.keys(value).filter(name => !allowed.includes(name));
  if (unknown.length) throw fault(`${field} has unsupported field(s): ${unknown.join(', ')}.`);
  return value;
};

/** Validates a complete promoter brief. Unknown fees stay null; nothing is defaulted into a fact. */
export function validateBrief(raw) {
  only(raw, ['name', 'city', 'venue', 'date', 'direction', 'audience', 'objectives', 'anchors', 'currency', 'constraints', 'candidates', 'commercial', 'picks'], 'Brief');
  const brief = {
    name: clean(raw.name, 'Event name', { max: 120, required: true }),
    city: clean(raw.city, 'City', { max: 100, required: true }),
    venue: clean(raw.venue, 'Venue', { max: 120 }),
    date: null,
    direction: clean(raw.direction, 'Programming direction', { max: 200 }),
    audience: clean(raw.audience, 'Target audience', { max: 300 }),
    objectives: [], anchors: [],
    currency: raw.currency ?? 'USD',
  };
  if (raw.date != null && raw.date !== '') {
    if (typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || Number.isNaN(Date.parse(`${raw.date}T00:00:00Z`)) || new Date(`${raw.date}T00:00:00Z`).toISOString().slice(0, 10) !== raw.date) throw fault('Date must be a real calendar date in YYYY-MM-DD form.');
    brief.date = raw.date;
  }
  if (!CURRENCIES.includes(brief.currency)) throw fault(`Currency must be one of ${CURRENCIES.join(', ')}.`);
  if (raw.objectives != null) {
    if (!Array.isArray(raw.objectives) || raw.objectives.length > LIMITS.objectives) throw fault(`Provide at most ${LIMITS.objectives} objectives.`);
    brief.objectives = raw.objectives.map((value, index) => clean(value, `Objective ${index + 1}`, { max: 160 })).filter(Boolean);
  }
  if (!Array.isArray(raw.anchors) || raw.anchors.length < 1 || raw.anchors.length > LIMITS.anchors) throw fault('Name 1–3 audience reference artists (the acts this audience already loves).');
  brief.anchors = raw.anchors.map((value, index) => clean(value, `Audience reference artist ${index + 1}`, { max: 100, required: true }));
  if (new Set(brief.anchors.map(low)).size !== brief.anchors.length) throw fault('Audience reference artists must be different.');
  const c = only(raw.constraints ?? {}, ['budget', 'slots', 'maxPerGenre', 'discoveryMin', 'riskTolerance'], 'Constraints');
  if (!Array.isArray(raw.candidates) || raw.candidates.length < 2 || raw.candidates.length > LIMITS.candidates) throw fault(`List 2–${LIMITS.candidates} candidate artists.`);
  const candidates = raw.candidates.map((row, index) => {
    const label = `Candidate ${index + 1}`;
    only(row, ['name', 'fee', 'feeStatus', 'availability', 'genre', 'lock', 'exclude', 'notes'], label);
    const candidate = { name: clean(row.name, `${label} name`, { max: 100, required: true }), fee: number(row.fee, `${label} fee`, { max: 1e9 }),
      feeStatus: row.feeStatus ?? null, availability: row.availability ?? 'unconfirmed', genre: clean(row.genre, `${label} genre`, { max: 60 }),
      lock: row.lock === true, exclude: row.exclude === true, notes: clean(row.notes, `${label} notes`, { max: 200 }) };
    if (candidate.fee == null) {
      if (candidate.feeStatus != null && candidate.feeStatus !== 'unknown') throw fault(`${label}: a ${candidate.feeStatus} fee needs an amount.`);
      candidate.feeStatus = 'unknown';
    } else {
      candidate.feeStatus ??= 'estimate';
      if (!['quoted', 'estimate'].includes(candidate.feeStatus)) throw fault(`${label}: fee status must be "quoted" or "estimate" when a fee is entered.`);
    }
    if (!AVAILABILITIES.includes(candidate.availability)) throw fault(`${label}: availability must be one of ${AVAILABILITIES.join(', ')}.`);
    if (candidate.lock && candidate.exclude) throw fault(`${label}: an artist cannot be both locked and excluded.`);
    if (candidate.lock && (candidate.fee == null || !['confirmed', 'assumed'].includes(candidate.availability))) throw fault(`${label}: a locked artist needs a fee and confirmed or assumed availability.`);
    return candidate;
  });
  if (new Set(candidates.map(row => low(row.name))).size !== candidates.length) throw fault('Candidate artists must be different.');
  const anchorSet = new Set(brief.anchors.map(low));
  const overlap = candidates.filter(row => anchorSet.has(low(row.name)));
  if (overlap.length) throw fault(`${overlap.map(row => row.name).join(', ')} is listed as both an audience reference and a candidate. References describe the audience; candidates are booked.`);
  const slots = number(c.slots, 'Lineup size', { min: 1, max: 6, integer: true, required: true });
  if (slots > candidates.length) throw fault('Lineup size cannot exceed the number of candidates.');
  brief.constraints = {
    budget: number(c.budget, 'Artist budget', { max: 1e9, required: true }), slots,
    maxPerGenre: number(c.maxPerGenre, 'Maximum acts per genre', { min: 1, max: slots, integer: true }) ?? slots,
    discoveryMin: number(c.discoveryMin, 'Discovery minimum', { min: 0, max: slots, integer: true }) ?? 0,
    riskTolerance: number(c.riskTolerance, 'Evidence risk tolerance', { min: 0, max: 100 }) ?? 50,
  };
  if (candidates.filter(row => row.lock).length > slots) throw fault('More artists are locked than there are lineup slots.');
  brief.candidates = candidates;
  if (raw.commercial != null) {
    const m = only(raw.commercial, ['capacity', 'ticketPrice', 'otherCosts'], 'Commercial assumptions');
    brief.commercial = { capacity: number(m.capacity, 'Capacity assumption', { min: 1, max: 1e6, integer: true }), ticketPrice: number(m.ticketPrice, 'Ticket price assumption', { max: 1e5 }), otherCosts: number(m.otherCosts, 'Other costs assumption', { max: 1e9 }) };
    if (Object.values(brief.commercial).every(value => value == null)) brief.commercial = null;
  } else brief.commercial = null;
  // Organizer-chosen Qloo matches for ambiguous names: name -> { id, name }.
  brief.picks = {};
  if (raw.picks != null) {
    if (!raw.picks || typeof raw.picks !== 'object' || Array.isArray(raw.picks)) throw fault('Qloo matches must be an object.');
    const names = new Set([...brief.anchors, ...candidates.map(row => row.name)].map(low));
    for (const [name, pick] of Object.entries(raw.picks)) {
      if (!names.has(low(name))) throw fault(`A Qloo match was chosen for "${String(name).slice(0, 60)}", which is not in this brief.`);
      only(pick, ['id', 'name'], `Qloo match for ${name}`);
      if (typeof pick.id !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(pick.id)) throw fault(`Qloo match for ${name} needs a valid entity ID.`);
      brief.picks[clean(name, 'Matched name', { max: 100, required: true })] = { id: pick.id, name: clean(pick.name, 'Qloo match name', { max: 180, required: true }) };
    }
  }
  return brief;
}

const now = () => new Date().toISOString();
function persist(event) {
  event.updatedAt = now();
  const body = JSON.stringify(event);
  if (body.length > 12_000_000) throw fault('This event has too much saved history. Delete older decision runs first.', 413);
  db.prepare('INSERT INTO organizer_events(id,body,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(event.id, body, event.createdAt, event.updatedAt);
  return event;
}
export function loadEvent(id) {
  if (typeof id !== 'string' || !/^ev_[a-f0-9]{20}$/.test(id)) return null;
  const row = db.prepare('SELECT body FROM organizer_events WHERE id=?').get(id);
  return row ? JSON.parse(row.body) : null;
}
export function listEvents() {
  return db.prepare('SELECT body FROM organizer_events ORDER BY updated_at DESC').all().map(row => summary(JSON.parse(row.body)));
}
export function summary(event) {
  const latest = event.revisions.at(-1), lastRun = event.runs.at(-1);
  return { id: event.id, name: latest.brief.name, city: latest.brief.city, date: latest.brief.date, revisions: event.revisions.length, createdAt: event.createdAt, updatedAt: event.updatedAt,
    research: event.research ? { status: event.research.status, revision: event.research.revision, mode: event.research.mode, completedAt: event.research.completedAt } : null,
    runs: event.runs.length, latestDecision: lastRun ? { runId: lastRun.id, revision: lastRun.revision, names: lastRun.summary.names, mode: lastRun.mode, status: lastRun.status } : null };
}
export function createEvent(rawBrief) {
  const brief = validateBrief(rawBrief);
  return transaction(() => {
    if (db.prepare('SELECT COUNT(*) AS n FROM organizer_events').get().n >= LIMITS.events) throw fault(`At most ${LIMITS.events} events can be stored. Delete an older event first.`, 409);
    const createdAt = now();
    return persist({ id: `ev_${randomBytes(10).toString('hex')}`, version: 1, createdAt, updatedAt: createdAt, revisions: [{ revision: 1, createdAt, note: 'Created', brief }], research: null, runs: [] });
  });
}
export function reviseEvent(event, rawBrief, note) {
  const brief = validateBrief(rawBrief), cleanNote = clean(note, 'Revision note', { max: 200 }) ?? 'Revised';
  const previous = event.revisions.at(-1).brief;
  if (JSON.stringify(previous) === JSON.stringify(brief)) throw fault('Nothing changed in this revision.', 409);
  event.revisions.push({ revision: event.revisions.length + 1, createdAt: now(), note: cleanNote, brief });
  return persist(event);
}
export function deleteEvent(id) { return db.prepare('DELETE FROM organizer_events WHERE id=?').run(id).changes > 0; }
export function saveResearch(event, research) { event.research = research; return persist(event); }
// Evidence a decision run gathers becomes part of the event's research, so later
// revisions decide on everything learned so far. Only measured flags are added;
// a missing or failed answer never removes earlier evidence.
export function mergeRunEvidence(event, run) {
  const snapshot = event.research?.snapshot;
  if (!snapshot || !run.receipts.length) return event;
  const known = new Set(snapshot.receipts.map(row => row.id));
  snapshot.receipts.push(...run.receipts.filter(row => !known.has(row.id)));
  for (const item of snapshot.memo.items) {
    const learned = run.items.find(row => row.id === item.id);
    if (!learned) continue;
    item.evidence ??= {}; item.evidenceReceipts ??= {};
    for (const kind of ['rank', 'local', 'comparison', 'trends']) {
      if (!learned.evidence?.[kind] || item.evidence[kind]) continue;
      item.evidence[kind] = true;
      item.evidenceReceipts[kind] = learned.evidenceReceipts?.[kind] ?? [];
      if (kind === 'local') item.local = learned.local;
      if (kind === 'trends') item.momentum = learned.momentum;
      if (kind === 'rank') Object.assign(item, { fit: learned.fit, rank: learned.rank, of: learned.of, rankCoverage: learned.rankCoverage });
      item.receipts = [...new Set([...(item.receipts ?? []), ...item.evidenceReceipts[kind]])];
    }
  }
  event.research.augmentedBy = [...(event.research.augmentedBy ?? []), run.id];
  return event;
}
export function addRun(event, run) {
  if (event.runs.length >= LIMITS.runs) throw fault(`At most ${LIMITS.runs} decision runs are kept per event. Start a new event to continue.`, 409);
  event.runs.push(run); return persist(event);
}

// What changed between two briefs, in organizer terms.
export function briefChanges(before, after) {
  const changes = [];
  for (const [field, label] of [['budget', 'Artist budget'], ['slots', 'Lineup size'], ['maxPerGenre', 'Max per genre'], ['discoveryMin', 'Discovery minimum'], ['riskTolerance', 'Evidence risk tolerance']])
    if (before.constraints[field] !== after.constraints[field]) changes.push(`${label}: ${before.constraints[field]} → ${after.constraints[field]}`);
  const byName = new Map(before.candidates.map(row => [low(row.name), row]));
  for (const row of after.candidates) {
    const old = byName.get(low(row.name));
    if (!old) { changes.push(`Added candidate ${row.name}`); continue; }
    for (const [field, label] of [['fee', 'fee'], ['feeStatus', 'fee status'], ['availability', 'availability'], ['genre', 'genre'], ['lock', 'lock'], ['exclude', 'exclusion']])
      if (old[field] !== row[field]) changes.push(`${row.name} ${label}: ${old[field] ?? '—'} → ${row[field] ?? '—'}`);
    byName.delete(low(row.name));
  }
  for (const row of byName.values()) changes.push(`Removed candidate ${row.name}`);
  for (const field of ['name', 'city', 'venue', 'date', 'direction', 'audience']) if (before[field] !== after[field]) changes.push(`${field[0].toUpperCase() + field.slice(1)}: ${before[field] ?? '—'} → ${after[field] ?? '—'}`);
  if (JSON.stringify(before.anchors) !== JSON.stringify(after.anchors)) changes.push(`Audience references: ${before.anchors.join(', ')} → ${after.anchors.join(', ')}`);
  if (JSON.stringify(before.commercial) !== JSON.stringify(after.commercial)) changes.push('Commercial assumptions changed');
  for (const [name, pick] of Object.entries(after.picks ?? {})) if (before.picks?.[name]?.id !== pick.id) changes.push(`Qloo match for ${name}: ${pick.name}`);
  return changes;
}

// Research must be redone when the audience, market or candidate list changes;
// fees, availability and constraints can be revised against existing evidence.
export function researchStale(event, brief) {
  const research = event.research;
  if (!research || research.status !== 'complete') return 'No completed Qloo research exists for this event yet.';
  const used = event.revisions.find(row => row.revision === research.revision).brief;
  if (low(used.city) !== low(brief.city)) return `The market changed from ${used.city} to ${brief.city}.`;
  if (JSON.stringify(used.anchors.map(low)) !== JSON.stringify(brief.anchors.map(low))) return 'The audience reference artists changed.';
  if (JSON.stringify(used.picks ?? {}) !== JSON.stringify(brief.picks ?? {})) return 'The chosen Qloo matches for ambiguous names changed.';
  // Names Qloo could not resolve are reported, not treated as new candidates.
  const known = new Set([...research.snapshot.memo.items.flatMap(item => [low(item.name), low(item.originalName)]), ...(research.unresolved ?? []).map(low)]);
  const added = brief.candidates.filter(row => !known.has(low(row.name)));
  if (added.length) return `New candidate(s) ${added.map(row => row.name).join(', ')} have no Qloo evidence yet.`;
  return null;
}

/** Inputs for the existing research agent (buildMemo) from a validated brief. */
export function researchInput(brief) {
  return { city: brief.city, anchors: brief.anchors, offers: brief.candidates.map(row => row.name), picks: brief.picks ?? {},
    terms: Object.fromEntries(brief.candidates.map(row => [row.name, { fee: row.fee, genre: row.genre ?? '', available: ['confirmed', 'assumed'].includes(row.availability) }])),
    constraints: { budget: brief.constraints.budget, slots: brief.constraints.slots, maxPerGenre: brief.constraints.maxPerGenre, discoveryMin: brief.constraints.discoveryMin, riskTolerance: brief.constraints.riskTolerance, lockedIds: [], excludedIds: [] },
    currency: brief.currency, exampleBookingTerms: false };
}

/**
 * The research snapshot with a revision's commercial terms and constraints
 * applied. Cultural evidence is reused unchanged; only promoter inputs move.
 */
export function revisionSource(event, revision) {
  const brief = event.revisions.find(row => row.revision === revision)?.brief;
  if (!brief) throw fault('Revision not found.', 404);
  const stale = researchStale(event, brief);
  if (stale) throw fault(`Run Qloo research again before deciding: ${stale}`, 409);
  const snapshot = event.research.snapshot;
  const byName = new Map(brief.candidates.map(row => [low(row.name), row]));
  const lockedIds = [], excludedIds = [];
  const items = snapshot.memo.items.map(item => {
    const row = byName.get(low(item.originalName)) ?? byName.get(low(item.name));
    if (!row) {
      // Removed candidates are excluded; Qloo discoveries stay as unquoted leads.
      if (!item.found) excludedIds.push(item.id);
      return { ...item, terms: { ...item.terms, available: false, fee: item.found ? null : item.terms.fee, feeStatus: 'unknown', availabilityStatus: 'unconfirmed' } };
    }
    if (row.lock) lockedIds.push(item.id);
    if (row.exclude) excludedIds.push(item.id);
    return { ...item, terms: { fee: row.fee, genre: row.genre ?? '', available: ['confirmed', 'assumed'].includes(row.availability), feeStatus: row.feeStatus, availabilityStatus: row.availability } };
  });
  const constraints = { ...brief.constraints, lockedIds, excludedIds };
  const check = optimizeSlate(items, constraints);
  if (check.status === 'invalid') throw fault(check.reasons.join(' '));
  return { brief, source: { receipts: snapshot.receipts, memo: { ...snapshot.memo, items, constraints: check.constraints, currency: brief.currency, exampleBookingTerms: false } },
    context: { name: brief.name, venue: brief.venue, date: brief.date, direction: brief.direction, audience: brief.audience, objectives: brief.objectives, commercial: brief.commercial } };
}

const pick = run => run?.packet?.recommendation;
export function compareRuns(event, a, b) {
  const left = event.runs.find(row => row.id === a), right = event.runs.find(row => row.id === b);
  if (!left || !right) throw fault('Choose two saved decision runs from this event.', 404);
  const briefOf = run => event.revisions.find(row => row.revision === run.revision).brief;
  const recL = pick(left.run), recR = pick(right.run);
  const lineup = rec => rec ? rec.names : [];
  return {
    runs: [left, right].map(run => ({ id: run.id, revision: run.revision, createdAt: run.createdAt, mode: run.mode, status: run.status, ...run.summary })),
    briefChanges: left.revision === right.revision ? [] : briefChanges(briefOf(left), briefOf(right)),
    lineupChanged: JSON.stringify([...lineup(recL)].sort()) !== JSON.stringify([...lineup(recR)].sort()),
    added: lineup(recR).filter(name => !lineup(recL).includes(name)), removed: lineup(recL).filter(name => !lineup(recR).includes(name)),
    feeDelta: recL && recR ? Math.round((recR.totalFee - recL.totalFee) * 100) / 100 : null,
    scoreDelta: recL && recR ? Math.round((recR.policyScore - recL.policyScore) * 100) / 100 : null,
    robustness: [recL?.robustness ?? null, recR?.robustness ?? null],
    strategies: [left.run.packet.strategies.map(row => ({ label: row.label, names: row.names, totalFee: row.totalFee })), right.run.packet.strategies.map(row => ({ label: row.label, names: row.names, totalFee: row.totalFee }))],
    evidence: [left.evidenceReceipts ?? null, right.evidenceReceipts ?? null],
    note: `${left.evidenceReceipts != null && right.evidenceReceipts != null && left.evidenceReceipts !== right.evidenceReceipts
      ? `The runs decided on different amounts of Qloo evidence (${left.evidenceReceipts} vs ${right.evidenceReceipts} receipts), so score changes mix brief edits with new evidence.`
      : 'Both runs decided on the same Qloo evidence, so differences come from the brief.'} Policy points are an internal objective, not demand.`,
  };
}
