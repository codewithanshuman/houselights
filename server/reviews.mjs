import { randomBytes, randomInt, createHash } from 'node:crypto';
import { db, transaction } from './database.mjs';
import * as store from './store.mjs';
const id = () => randomBytes(18).toString('base64url');
const digest = text => createHash('sha256').update(text).digest('hex');
const read = studyId => { const row = db.prepare('SELECT body FROM studies WHERE id=?').get(studyId); return row ? JSON.parse(row.body) : null; };

export function createStudy(raw) {
  if (!Array.isArray(raw?.sourceIds) || raw.sourceIds.length < 1 || raw.sourceIds.length > 20) throw new Error('Choose 1–20 saved benchmark briefs.');
  if (!Array.isArray(raw.reviewers) || raw.reviewers.length < 1 || raw.reviewers.length > 30 || raw.reviewers.some(label => typeof label !== 'string' || !label.trim() || label.length > 80)) throw new Error('Provide 1–30 reviewer labels, with no private contact information.');
  if (new Set(raw.reviewers).size !== raw.reviewers.length) throw new Error('Reviewer labels must be unique.');
  const cases = [], fingerprints = new Set();
  for (const sourceId of raw.sourceIds) {
    const snapshot = store.load(sourceId), benchmark = snapshot?.benchmark;
    if (benchmark?.status !== 'compared') throw new Error('Each source needs a feasible Qloo/LLM comparison. Unavailable or invalid controls cannot enter a study.');
    if (fingerprints.has(benchmark.briefDigest)) throw new Error('Repeated versions of the same brief are not independent cases.');
    fingerprints.add(benchmark.briefDigest);
    const names = ids => ids.map(artistId => {
      const item = snapshot.memo.items.find(item => item.id === artistId);
      return { name: item.name, fee: item.terms.fee, genre: item.terms.genre };
    });
    cases.push({ caseId: id(), sourceId, fingerprint: benchmark.briefDigest,
      brief: { city: benchmark.brief.city, audiencePreferences: benchmark.brief.audiencePreferences, currency: benchmark.brief.currency,
        budget: benchmark.brief.constraints.budget, slots: benchmark.brief.constraints.slots },
      qloo: names(benchmark.qloo.selectedIds), control: names(benchmark.control.selectedIds), synthetic: benchmark.evidenceMode !== 'live',
      identical: [...benchmark.qloo.selectedIds].sort().join('|') === [...benchmark.control.selectedIds].sort().join('|') });
  }
  const studyId = id(), invitations = raw.reviewers.map(label => ({ label, token: id(), assignments: Object.fromEntries(cases.map(item => [item.caseId, randomInt(2) === 0 ? 'qloo' : 'control'])) }));
  const study = { id: studyId, createdAt: new Date().toISOString(), cases,
    reviewers: invitations.map(({ label, token, assignments }) => ({ label, tokenHash: digest(token), assignments })),
    protocol: 'Prefer the lineup you would book for this brief, independently of Qloo scores. Compare cultural fit, program breadth and booking practicality. No optimizer scores or source labels are shown. Roles are organizer-supplied, not verified.' };
  db.prepare('INSERT INTO studies(id,body) VALUES(?,?)').run(studyId, JSON.stringify(study));
  cases.forEach(item => store.retain(item.sourceId));
  return { id: studyId, caseCount: cases.length, invitations: invitations.map(({ label, token }) => ({ label, url: `/review.html#${studyId}:${token}` })), protocol: study.protocol };
}
function invitation(studyId, token) {
  const study = read(studyId), tokenHash = typeof token === 'string' ? digest(token) : '';
  const reviewer = study?.reviewers.find(item => item.tokenHash === tokenHash);
  if (!reviewer) throw new Error('Review invitation not found.');
  return { study, reviewer };
}
export function blindReview(studyId, token) {
  const { study, reviewer } = invitation(studyId, token);
  return { protocol: study.protocol, submitted: !!db.prepare('SELECT 1 FROM ballots WHERE study_id=? AND reviewer_hash=?').get(studyId, reviewer.tokenHash),
    cases: study.cases.map(item => ({ caseId: item.caseId, brief: item.brief, synthetic: item.synthetic,
      a: item[reviewer.assignments[item.caseId]], b: item[reviewer.assignments[item.caseId] === 'qloo' ? 'control' : 'qloo'] })) };
}
export function submitBallot(studyId, token, raw) {
  const { study, reviewer } = invitation(studyId, token);
  if (!Array.isArray(raw?.judgments) || raw.judgments.length !== study.cases.length || new Set(raw.judgments.map(item => item.caseId)).size !== study.cases.length) throw new Error('Provide one judgment for each brief.');
  const judgments = raw.judgments.map(item => {
    if (!study.cases.some(entry => entry.caseId === item.caseId) || !['a', 'b', 'tie', 'abstain'].includes(item.preference) || typeof item.reason !== 'string' || item.reason.trim().length < 12 || item.reason.length > 2000) throw new Error('Choose A, B, tie or abstain and give a reason of 12–2000 characters for each brief.');
    return { caseId: item.caseId, preference: item.preference, reason: item.reason.trim() };
  });
  transaction(() => {
    if (db.prepare('SELECT 1 FROM ballots WHERE study_id=? AND reviewer_hash=?').get(studyId, reviewer.tokenHash)) throw new Error('This invitation has already submitted a ballot.');
    db.prepare('INSERT INTO ballots(study_id,reviewer_hash,body) VALUES(?,?,?)').run(studyId, reviewer.tokenHash, JSON.stringify({ at: new Date().toISOString(), judgments }));
  });
  return { submitted: true, message: 'Your independent preference was recorded. Source identities remain concealed.' };
}
export function studyReport(studyId) {
  const study = read(studyId);
  if (!study) throw new Error('Study not found.');
  const ballots = db.prepare('SELECT reviewer_hash,body FROM ballots WHERE study_id=?').all(studyId);
  const cases = study.cases.map(item => ({ caseId: item.caseId, sourceId: item.sourceId, city: item.brief.city,
    synthetic: item.synthetic, identical: item.identical, qloo: 0, control: 0, tie: 0, abstain: 0, reasons: [] }));
  for (const row of ballots) {
    const reviewer = study.reviewers.find(item => item.tokenHash === row.reviewer_hash);
    for (const vote of JSON.parse(row.body).judgments) {
      const result = cases.find(item => item.caseId === vote.caseId);
      const outcome = ['tie', 'abstain'].includes(vote.preference) ? vote.preference : vote.preference === 'a' ? reviewer.assignments[vote.caseId] : reviewer.assignments[vote.caseId] === 'qloo' ? 'control' : 'qloo';
      result[outcome]++; result.reasons.push({ preference: outcome, reason: vote.reason });
    }
  }
  return { id: studyId, invitedReviewers: study.reviewers.length, completedReviewers: ballots.length, distinctBriefs: cases.length, cases,
    conclusion: ballots.length ? 'Descriptive, blinded preference judgments; not a causal or statistically established benefit.' : 'No independent judgments collected yet.',
    limitations: ['Reviewers may evaluate multiple cases; votes are not independent samples.', 'Organizer supplies reviewer identity and role; neither is independently verified.', 'Identical lineups provide no evidence of system preference.', 'Synthetic briefs do not validate actual market relevance.'] };
}

export function registerReviewRoutes(app) {
  app.post('/api/studies', (req, res) => { try { res.status(201).json(createStudy(req.body)); } catch (error) { res.status(400).json({ error: error.message }); } });
  app.get('/api/studies/:id', (req, res) => { try { res.json(studyReport(req.params.id)); } catch (error) { res.status(404).json({ error: error.message }); } });
  app.get('/api/reviews/:id', (req, res) => { try { res.json(blindReview(req.params.id, req.get('x-review-token'))); } catch (error) { res.status(404).json({ error: error.message }); } });
  app.post('/api/reviews/:id/ballot', (req, res) => { try { res.json(submitBallot(req.params.id, req.get('x-review-token'), req.body)); } catch (error) { res.status(400).json({ error: error.message }); } });
}
