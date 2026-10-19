import { createHash, randomUUID } from 'node:crypto';
import { db, transaction } from './database.mjs';
import * as store from './store.mjs';
import { canEdit } from './access.mjs';
import { mergedCommercialFacts } from './commercial-facts.mjs';

db.exec('CREATE TABLE IF NOT EXISTS operational_evidence(source_id TEXT PRIMARY KEY, body TEXT NOT NULL)');
const hash = value => 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
export function readOperationalEvidence(sourceId) {
  const row = db.prepare('SELECT body FROM operational_evidence WHERE source_id=?').get(sourceId);
  return row ? JSON.parse(row.body) : { sourceId, revision: 0, documents: [], reviews: [] };
}
export function extractOperationalClaims(text, currency) {
  const claims = [];
  // Conservative labeled fields only. Arbitrary prose does not become a term.
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const quote = line.trim(); let match, field, value;
    if ((match = /^(?:artist fee|booking fee|fee)\s*:\s*(GBP|USD|EUR|INR)\s+((?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?)\s*$/i.exec(quote))) {
      if (match[1].toUpperCase() !== currency) continue;
      field = 'fee'; value = Number(match[2].replaceAll(',', ''));
      if (!Number.isFinite(value) || value > 1e9) continue;
    } else if ((match = /^availability\s*:\s*(available|unavailable|unconfirmed)\s*$/i.exec(quote))) {
      field = 'available'; value = match[1].toLowerCase() === 'available' ? true : match[1].toLowerCase() === 'unavailable' ? false : null;
    } else if ((match = /^(event date|load in|set length|deposit|contact)\s*:\s*(.{1,250})$/i.exec(quote))) {
      field = ({'event date':'date','load in':'loadIn','set length':'setLength','deposit':'deposit','contact':'contact'})[match[1].toLowerCase()];
      value = match[2].trim();
    }
    if (field) claims.push({ id: `c${index + 1}`, field, value, quote, line: index + 1 });
    if (claims.length >= 100) break;
  }
  return claims;
}
export function addOperationalDocument(snapshot, current, raw) {
  if (raw?.expectedRevision !== current.revision) throw fault('Operational evidence changed. Reload first.', 409);
  if (current.documents.length >= 30) throw fault('This decision has reached its 30-document limit.');
  if (!snapshot.memo.items.some(i => i.id === raw.artistId)) throw fault('Choose an artist in the saved pool.');
  for (const key of ['title', 'origin']) if (typeof raw[key] !== 'string' || !raw[key].trim() || raw[key].length > 300) throw fault(`${key} requires 1–300 characters.`);
  if (typeof raw.text !== 'string' || !raw.text.trim() || raw.text.length > 50000) throw fault('Supply 1–50000 characters of source document or email text.');
  if (!['quote', 'email', 'venue', 'contract', 'other'].includes(raw.kind)) throw fault('Choose a supported document kind.');
  const observed = new Date(raw.observedAt);
  if (!raw.observedAt || Number.isNaN(observed.valueOf()) || observed.valueOf() > Date.now() + 60000) throw fault('Supply a valid source observation date that is not in the future.');
  const digest = hash({ artistId: raw.artistId, text: raw.text, origin: raw.origin });
  if (current.documents.some(d => d.digest === digest)) throw fault('This source document is already recorded.', 409);
  const document = { id: randomUUID(), artistId: raw.artistId, kind: raw.kind, title: raw.title.trim(), origin: raw.origin.trim(),
    observedAt: observed.toISOString(), importedAt: new Date().toISOString(), text: raw.text, digest,
    claims: extractOperationalClaims(raw.text, snapshot.memo.currency ?? 'GBP'), provenance: 'organizer_supplied_unverified' };
  return { ...current, revision: current.revision + 1, documents: [...current.documents, document] };
}
export function reviewOperationalClaim(current, raw) {
  if (raw?.expectedRevision !== current.revision) throw fault('Operational evidence changed. Reload first.', 409);
  if (current.reviews.length >= 300) throw fault('Evidence review limit reached.');
  const document = current.documents.find(d => d.id === raw.documentId), claim = document?.claims.find(c => c.id === raw.claimId);
  if (!claim) throw fault('Unknown source claim.');
  if (!['accepted', 'rejected'].includes(raw.verdict)) throw fault('Choose accepted or rejected.');
  if (typeof raw.reason !== 'string' || raw.reason.trim().length < 10 || raw.reason.length > 1000) throw fault('Review reason requires 10–1000 characters.');
  return { ...current, revision: current.revision + 1, reviews: [...current.reviews, { documentId: document.id, claimId: claim.id,
    verdict: raw.verdict, reason: raw.reason.trim(), at: new Date().toISOString(), reviewer: 'organizer_session', documentDigest: document.digest }] };
}
export function operationalCoverage(snapshot, evidence = readOperationalEvidence(snapshot.id)) {
  const selected = snapshot.memo.slate?.selectedIds ?? [];
  const commercialFacts = mergedCommercialFacts(snapshot.id, evidence.commercialFacts ?? []);
  const artists = snapshot.memo.items.filter(i => selected.includes(i.id)).map(item => {
    const fields = {};
    for (const field of ['fee', 'available']) {
      const accepted = evidence.documents.filter(d => d.artistId === item.id).flatMap(d => d.claims.filter(c => c.field === field).filter(c => evidence.reviews.findLast(r => r.documentId === d.id && r.claimId === c.id)?.verdict === 'accepted').map(c => ({ documentId: d.id, claimId: c.id, value: c.value, quote: c.quote })));
      for (const fact of commercialFacts.filter(fact => fact.artistId === item.id)) {
        if (field === 'fee' && fact.agreedRate != null) accepted.push({ sourceId: fact.sourceId, origin: 'recorded_pipeline_response', value: fact.agreedRate });
        if (field === 'available' && ['accepted', 'declined'].includes(fact.response?.type)) accepted.push({ sourceId: fact.sourceId, origin: 'recorded_pipeline_response', value: fact.response.type === 'accepted' });
      }
      const values = [...new Set(accepted.map(c => JSON.stringify(c.value)))];
      fields[field] = { status: !accepted.length ? 'missing' : values.length > 1 ? 'conflicting' : accepted[0].value == null ? 'unknown' : accepted[0].value !== item.terms?.[field] ? 'differs_from_plan' : 'organizer_reviewed_match', sources: accepted };
    }
    return { artistId: item.id, name: item.name, fields };
  });
  return { revision: evidence.revision, artists, complete: artists.length > 0 && artists.every(a => Object.values(a.fields).every(f => f.status === 'organizer_reviewed_match')),
    caveat: 'Exact source quotations and organizer review establish traceability, not independent authentication, legal validity, current availability or a confirmed booking. No term is automatically applied.' };
}
export const operationalEvidenceDigest = sourceId => {
  const evidence = readOperationalEvidence(sourceId);
  return hash({ ...evidence, commercialFacts: mergedCommercialFacts(sourceId, evidence.commercialFacts ?? []) });
};
const evidenceResponse = (snapshot, evidence) => ({ evidence: { ...evidence, commercialFacts: mergedCommercialFacts(snapshot.id, evidence.commercialFacts ?? []) }, coverage: operationalCoverage(snapshot, evidence) });
export function registerOperationalRoutes(app) {
  app.use('/api/operational-evidence', (req, res, next) => canEdit(req) ? next() : res.status(401).json({ error: 'Organizer access required for commercial documents.' }));
  app.get('/api/operational-evidence/:id', (req, res) => {
    const snapshot = store.load(req.params.id); if (!snapshot) return res.status(404).json({ error: 'Saved decision not found.' });
    const evidence = readOperationalEvidence(snapshot.id); res.json(evidenceResponse(snapshot, evidence));
  });
  app.post('/api/operational-evidence/:id/:action', (req, res) => {
    const snapshot = store.load(req.params.id); if (!snapshot) return res.status(404).json({ error: 'Saved decision not found.' });
    try {
      const evidence = transaction(() => {
        const current = readOperationalEvidence(snapshot.id);
        const next = req.params.action === 'documents' ? addOperationalDocument(snapshot, current, req.body)
          : req.params.action === 'review' ? reviewOperationalClaim(current, req.body) : null;
        if (!next) throw fault('Unknown operational evidence action.', 404);
        db.prepare('INSERT INTO operational_evidence(source_id,body) VALUES(?,?) ON CONFLICT(source_id) DO UPDATE SET body=excluded.body').run(snapshot.id, JSON.stringify(next));
        db.prepare('UPDATE snapshots SET pinned=1 WHERE id=?').run(snapshot.id);
        return next;
      });
      res.status(201).json(evidenceResponse(snapshot, evidence));
    } catch (error) { res.status(error.status ?? 400).json({ error: error.message }); }
  });
}
