import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, consumeQuota } from './database.mjs';
import { Run, isMock } from './qloo.mjs';
import { loadJudgeCase } from './judge.mjs';
import { runAutopilot, packetHtml } from './autopilot.mjs';

db.exec('CREATE TABLE IF NOT EXISTS autopilot_runs(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL)');
const recordedPath = fileURLToPath(new URL('../public/autopilot-recorded.json', import.meta.url));
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const address = req => createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
const text = (value, max = 200) => typeof value === 'string' ? value.slice(0, max) : undefined;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const strings = value => Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 20).map(item => item.slice(0, 180)) : undefined;

// Public receipts keep the fields the research policy reads and the query scope
// needed to audit it. Coordinates, tags and raw provider payloads are omitted.
export function publicAutopilotReceipt(receipt) {
  const evidence = receipt.evidence ?? {};
  const args = Object.fromEntries(['entity', 'entity_type', 'within', 'group_a', 'group_b', 'target_type', 'entities', 'options', 'option_type', 'signals', 'signal_location', 'start_date', 'end_date', 'limit']
    .filter(key => receipt.args?.[key] !== undefined).map(key => [key, Array.isArray(receipt.args[key]) ? strings(receipt.args[key]) : typeof receipt.args[key] === 'number' ? receipt.args[key] : text(receipt.args[key])]));
  return { id: text(receipt.id, 20), tool: text(receipt.tool, 40), args, why: text(receipt.why), status: text(receipt.status, 20), source: receipt.source === 'qloo' ? 'qloo' : 'synthetic',
    cached: receipt.cached === true, attempts: finite(receipt.attempts) ?? null, ms: finite(receipt.ms) ?? null, fetchedAt: text(receipt.fetchedAt, 40), originalDigest: /^sha256:[a-f0-9]{64}$/.test(receipt.digest ?? '') ? receipt.digest : null,
    evidence: { kind: text(evidence.kind, 40), total: finite(evidence.total) ?? null,
      rows: (Array.isArray(evidence.rows) ? evidence.rows : []).slice(0, 50).map(row => Object.fromEntries(Object.entries({ id: text(row.id, 180), name: text(row.name, 180), affinity: finite(row.affinity), popularity: finite(row.popularity), change: finite(row.change), direction: text(row.direction, 20) }).filter(([, value]) => value !== undefined))),
      ...(evidence.kind === 'compare_audiences' ? { comparisonAvailable: evidence.comparisonAvailable === true, interpretable: evidence.interpretable === true, sharedNames: strings(evidence.sharedNames) ?? [] } : {}),
      ...(evidence.error ? { error: text(evidence.error, 40) } : {}) } };
}

export function publicAutopilotRun(result) {
  return { ...result, receipts: result.receipts.map(publicAutopilotReceipt) };
}

export function saveAutopilotRun(record) {
  const id = randomBytes(12).toString('hex');
  db.prepare('INSERT INTO autopilot_runs(id,body,created_at) VALUES(?,?,?)').run(id, JSON.stringify({ id, ...record }), new Date().toISOString());
  return loadAutopilotRun(id);
}
export function loadAutopilotRun(id) {
  if (typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id)) return null;
  const row = db.prepare('SELECT body FROM autopilot_runs WHERE id=?').get(id);
  return row ? JSON.parse(row.body) : null;
}

export function judgeAutopilotSource(record) {
  return { receipts: record.snapshot.receipts, memo: { ...record.snapshot.memo, exampleBookingTerms: true } };
}

export function registerAutopilotRoutes(app) {
  const handle = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: error.message });
      console.error('Unexpected autopilot request failure:', error);
      return res.status(500).json({ error: 'The request could not be completed.' });
    }
  };
  const caseFor = id => { const record = loadJudgeCase(id); if (!record) throw fault('Published judge case not found.', 404); return record; };
  // Public: deterministic planning over saved evidence. No provider calls.
  app.post('/api/judge/cases/:id/autopilot', handle(async (req, res) => {
    const record = caseFor(req.params.id);
    const minute = Math.floor(Date.now() / 60000), who = address(req);
    if (!consumeQuota([{ key: `autopilot:${minute}:${who}`, limit: 10, expires: (minute + 1) * 60000 }, { key: `autopilot-global:${minute}`, limit: 40, expires: (minute + 1) * 60000 }])) throw fault('Autopilot limit reached. Wait a minute before another plan.', 429);
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    if ('maxCalls' in body || 'maxRounds' in body) throw fault('Public planning makes no provider calls; research budgets are organizer-only.');
    const result = await runAutopilot(judgeAutopilotSource(record), { ...body, maxCalls: 0 }, { mode: 'planning' });
    res.json({ caseId: record.id, providerCalls: 0, persisted: false, ...publicAutopilotRun(result) });
  }));
  // Organizer: fresh provider-backed research from the published brief.
  app.post('/api/judge/cases/:id/autopilot/live', handle(async (req, res) => {
    const record = caseFor(req.params.id);
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const maxCalls = body.maxCalls ?? 10;
    const run = new Run({ budget: Number.isInteger(maxCalls) ? Math.max(0, Math.min(16, maxCalls)) : 0, receiptPrefix: 'a', deadlineMs: 150000 });
    const mode = run.mode === 'mock' || isMock() ? 'synthetic' : 'live';
    const result = await runAutopilot(judgeAutopilotSource(record), body, { research: { call: (...args) => run.call(...args), used: () => run.used }, mode });
    if (result.receipts.some(receipt => receipt.source === 'synthetic')) result.mode = result.packet.mode = 'synthetic';
    const saved = saveAutopilotRun({ caseId: record.id, caseTitle: record.title, createdAt: new Date().toISOString(), researchCalls: run.used, providerCalls: result.mode === 'synthetic' ? 0 : run.used, ...publicAutopilotRun(result) });
    res.status(201).json(saved);
  }));
  // The checked-in provider-backed record, exported as a packet. No provider calls.
  app.get('/api/autopilot/recorded/packet', handle(async (req, res) => {
    let file;
    try { file = JSON.parse(readFileSync(recordedPath, 'utf8')); } catch { throw fault('No recorded Autopilot run is published.', 404); }
    const notice = `> Recorded provider-backed run captured ${file.capturedAt} (${file.providerCalls} Qloo workflow calls). Replayed without new provider calls.\n\n`;
    if (req.query.format === 'md') {
      res.set('Content-Disposition', 'attachment; filename="houselights-autopilot-recorded.md"');
      return res.type('text/markdown').send(notice + file.run.packet.markdown);
    }
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    return res.type('html').send(packetHtml({ ...file.run.packet, markdown: notice + file.run.packet.markdown }));
  }));
  app.get('/api/autopilot/runs/:id', handle(async (req, res) => {
    const saved = loadAutopilotRun(req.params.id); if (!saved) throw fault('Autopilot run not found.', 404); res.json(saved);
  }));
  app.get('/api/autopilot/runs/:id/packet', handle(async (req, res) => {
    const saved = loadAutopilotRun(req.params.id); if (!saved) throw fault('Autopilot run not found.', 404);
    const name = `houselights-autopilot-${saved.id}`;
    if (req.query.format === 'md') {
      res.set('Content-Disposition', `attachment; filename="${name}.md"`);
      return res.type('text/markdown').send(saved.packet.markdown);
    }
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    res.set('Content-Disposition', `inline; filename="${name}.html"`);
    return res.type('html').send(packetHtml(saved.packet));
  }));
}
