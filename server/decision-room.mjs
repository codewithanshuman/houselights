import { db, transaction, consumeQuota } from './database.mjs';
import * as store from './store.mjs';
import { canEdit } from './access.mjs';
import { buildDecisionProof, decisionFingerprint } from './decision-proof.mjs';
import { optimizeSlate } from './optimizer.mjs';
import { buildBookingPacket } from './operations.mjs';
import { createHash } from 'node:crypto';
import * as pipelineStore from './pipeline-store.mjs';
import { operationalEvidenceDigest, operationalCoverage } from './operational-evidence.mjs';

db.exec('CREATE TABLE IF NOT EXISTS decision_sessions(id TEXT PRIMARY KEY, body TEXT NOT NULL)');
const readSession = id => {
  const row = db.prepare('SELECT body FROM decision_sessions WHERE id=?').get(id);
  return row ? JSON.parse(row.body) : { sourceId: id, revision: 0, state: 'review_required', events: [], packet: null };
};
export function reviewScopeDigest(snapshot) {
  const pipeline = pipelineStore.load(snapshot.id);
  const terms = (snapshot.memo.slate?.selectedIds ?? []).map(id => {
    const deal = pipeline?.deals.find(d => d.artistId === id);
    return { id, agreedRate: deal?.agreedRate ?? null, proposedOffers: deal?.negotiation?.counteroffers.filter(c => c.direction === 'proposed') ?? [] };
  });
  return 'sha256:' + createHash('sha256').update(JSON.stringify({ proof: snapshot.decisionProof?.proofDigest, input: decisionFingerprint(snapshot), evidence: operationalEvidenceDigest(snapshot.id), terms })).digest('hex');
}
export function decisionSession(snapshot) {
  const session = readSession(snapshot.id);
  if (['approved_for_planning', 'draft_ready'].includes(session.state) && session.approvedScopeDigest !== reviewScopeDigest(snapshot)) {
    return { ...session, state: 'review_required', packet: null, invalidated: true, invalidationReason: 'Evidence or commercial terms changed after approval. Review the current scope again.' };
  }
  return session;
}
function checkCommercialConsistency(snapshot) {
  const pipeline = pipelineStore.load(snapshot.id);
  for (const deal of pipeline?.deals ?? []) {
    if (deal.agreedRate != null && deal.agreedRate !== snapshot.memo.items.find(i => i.id === deal.artistId)?.terms?.fee) throw fault('Recorded agreed fees differ from the optimized plan. Save a scenario with the new fees and build its proof before approval.', 409);
  }
  const coverage = operationalCoverage(snapshot);
  if (coverage.artists.some(a => Object.values(a.fields).some(f => ['conflicting', 'differs_from_plan'].includes(f.status)))) throw fault('Reviewed commercial evidence conflicts with the plan. Resolve conflicts or save revised assumptions before approval.', 409);
}
export function requirePlanningApproval(snapshot, expectedRevision) {
  validProof(snapshot); checkCommercialConsistency(snapshot);
  const session = decisionSession(snapshot);
  if (!['approved_for_planning', 'draft_ready'].includes(session.state)) throw fault('Approve the current proof in Decision Room before this planning action. Evidence or term changes require renewed review.', 409);
  if (expectedRevision !== session.revision) throw fault('Decision approval revision changed. Reload before acting.', 409);
  return { decisionRevision: session.revision, proofDigest: snapshot.decisionProof.proofDigest, scopeDigest: session.approvedScopeDigest, scope: 'Planning only; no external action authorized.' };
}
export function authorizePipelineEvent(snapshot, event) {
  // Incoming facts and notes remain recordable even when approval is revoked.
  const gated = ['approve_pitch', 'send_outreach', 'complete_follow_up', 'update_logistics'].includes(event?.type)
    || event?.type === 'record_counteroffer' && event.direction === 'proposed';
  if (!gated) return null;
  const approval = requirePlanningApproval(snapshot, event.expectedDecisionRevision);
  if (event.type === 'record_counteroffer') {
    const fee = snapshot.memo.items.find(i => i.id === event.artistId)?.terms?.fee;
    if (typeof event.amount !== 'number' || event.amount > fee) throw fault('A proposed counteroffer above the approved fee needs a new optimized scenario and proof.', 409);
  }
  return approval;
}
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
function validProof(snapshot) {
  if (!snapshot.decisionProof || snapshot.decisionProof.inputDigest !== decisionFingerprint(snapshot)) throw fault('Build a current decision proof before this action.', 409);
  return snapshot.decisionProof;
}

export function transitionDecision(snapshot, session, raw) {
  const proof = validProof(snapshot);
  if (raw?.expectedRevision !== session.revision) throw fault('Decision review changed. Reload before acting.', 409);
  if (session.events.length >= 100) throw fault('Decision review history limit reached. Build a new proof.', 409);
  const action = raw.action, next = structuredClone(session);
  let detail;
  if (action === 'approve') {
    checkCommercialConsistency(snapshot);
    if (raw.expectedScopeDigest !== reviewScopeDigest(snapshot)) throw fault('Review scope changed. Reload the current evidence and terms before approval.', 409);
    if (session.state !== 'review_required') throw fault('Only a decision awaiting review can be approved.', 409);
    if (proof.status === 'blocked' || !proof.baseline.feasible) throw fault('Blocking proof findings must be resolved before approval.', 422);
    const required = proof.findings.filter(row => row.severity === 'review').map(row => row.id);
    if (!Array.isArray(raw.acknowledgedFindings) || required.some(id => !raw.acknowledgedFindings.includes(id)) || raw.acknowledgedFindings.some(id => !required.includes(id))) throw fault('Explicitly acknowledge every review finding. Unknown finding IDs are rejected.');
    if (typeof raw.reason !== 'string' || raw.reason.trim().length < 10 || raw.reason.length > 1000) throw fault('Approval requires a reason of 10–1000 characters.');
    next.state = 'approved_for_planning';
    next.approvedScopeDigest = reviewScopeDigest(snapshot); next.invalidated = false; delete next.invalidationReason;
    detail = { reason: raw.reason.trim(), acknowledgedFindings: required, scope: 'Planning approval only. No external communication, payment, contract or confirmed booking.' };
  } else if (action === 'defer') {
    if (!['review_required', 'approved_for_planning', 'draft_ready'].includes(session.state)) throw fault('This decision is already deferred.', 409);
    if (typeof raw.reason !== 'string' || !raw.reason.trim() || raw.reason.length > 1000) throw fault('Deferral requires a reason of 1–1000 characters.');
    next.state = 'deferred'; next.packet = null; detail = { reason: raw.reason.trim() };
  } else if (action === 'reopen') {
    if (!['deferred', 'approved_for_planning', 'draft_ready'].includes(session.state)) throw fault('This decision is already awaiting review.', 409);
    next.state = 'review_required'; next.packet = null; detail = { reason: 'Previous planning approval revoked; a fresh approval is required.' };
  } else if (action === 'draft') {
    requirePlanningApproval(snapshot, raw.expectedRevision);
    if (session.state !== 'approved_for_planning') throw fault('Approve this decision before generating an authorized planning draft.', 409);
    next.packet = buildBookingPacket(snapshot, raw.event);
    next.state = 'draft_ready'; detail = { event: next.packet.event, draftCount: next.packet.holdRequests.length, sent: false };
  } else throw fault('Unknown decision action.');
  next.revision++;
  next.events.push({ sequence: next.revision, action, from: session.state, to: next.state, at: new Date().toISOString(), actor: 'organizer_session',
    proofDigest: proof.proofDigest, detail });
  return next;
}

export function registerDecisionRoutes(app) {
  app.get('/api/decision/:id', (req, res) => {
    const source = store.load(req.params.id);
    if (!source) return res.status(404).json({ error: 'Saved run not found.' });
    const proof = source.decisionProof && source.decisionProof.inputDigest === decisionFingerprint(source) ? source.decisionProof : null;
    const session = decisionSession(source), editable = canEdit(req);
    res.json({ sourceId: source.id, proof, editable, reviewScopeDigest: editable ? reviewScopeDigest(source) : undefined, commercialCoverage: editable ? operationalCoverage(source) : undefined, session: editable ? session : { state: session.state, revision: session.revision },
      model: 'Deterministic proof and challenge engine over saved Qloo evidence. Planning approval is distinct from booking confirmation.' });
  });
  app.post('/api/decision/:id/:action', (req, res) => {
    const source = store.load(req.params.id);
    if (!source) return res.status(404).json({ error: 'Saved run not found.' });
    try {
      const action = req.params.action;
      if (action === 'proof') {
        const minute = Math.floor(Date.now() / 60000);
        if (!consumeQuota([{ key: `decision-proof:${minute}`, limit: 12, expires: (minute + 1) * 60000 }])) return res.status(429).json({ error: 'Proof computation limit reached. Saved reports remain readable.' });
        const proof = buildDecisionProof(source);
        const id = store.save({ ...source, id: undefined, createdAt: undefined, parentId: source.id, decisionProof: proof });
        return res.status(201).json({ id, proof });
      }
      if (action === 'preview') {
        const budget = req.body?.budget;
        if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 0 || budget > 1e9) throw fault('Preview budget must be between 0 and 1000000000.');
        return res.json({ sourceId: source.id, saved: false, slate: optimizeSlate(source.memo.items, { ...source.memo.constraints, budget }),
          basis: 'Budget-only scenario; all other saved assumptions stay fixed. No Qloo calls or booking changes.' });
      }
      if (action !== 'transition') return res.status(404).json({ error: 'Unknown decision action.' });
      const session = transaction(() => {
        const current = decisionSession(source), next = transitionDecision(source, current, req.body);
        db.prepare('INSERT INTO decision_sessions(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(source.id, JSON.stringify(next));
        db.prepare('UPDATE snapshots SET pinned=1 WHERE id=?').run(source.id);
        return next;
      });
      return res.json({ session });
    } catch (error) { res.status(error.status ?? 400).json({ error: error.message }); }
  });
}
