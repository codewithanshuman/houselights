import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db, consumeQuota } from './database.mjs';
import { Run, isMock } from './qloo.mjs';
import { loadJudgeCase } from './judge.mjs';
import { runAutopilot, moneyFormatter } from './autopilot.mjs';
import { publicReceipt } from './autopilot-integrity.mjs';
import { packetHtml } from './autopilot-packet.mjs';

db.exec('CREATE TABLE IF NOT EXISTS autopilot_runs(id TEXT PRIMARY KEY, body TEXT NOT NULL, created_at TEXT NOT NULL)');
const recordedPath = fileURLToPath(new URL('../public/autopilot-recorded.json', import.meta.url));
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const address = req => createHash('sha256').update(req.ip ?? 'unknown').digest('hex');
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const PACKET_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'";
export const publicAutopilotReceipt = publicReceipt;

export function publicAutopilotRun(result) {
  return { ...result, receipts: result.receipts.map(publicReceipt) };
}

// Version 2 packets render from structured data; earlier saved runs only carry
// Markdown, which is shown escaped and unchanged.
export function renderPacketHtml(packet, currency, notice = '') {
  if (packet?.version === '2.0') return packetHtml(packet, moneyFormatter(currency ?? packet.currency ?? 'USD'), { notice });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Houselights decision packet</title></head><body><pre style="white-space:pre-wrap;font:14px/1.5 system-ui,sans-serif;max-width:860px;margin:2rem auto">${escapeHtml((notice ? notice + '\n\n' : '') + (packet?.markdown ?? ''))}</pre></body></html>`;
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

// A client that disconnects interrupts research at the next step; the partial
// result is still saved and labelled.
export function researchClient(run) {
  return { call: (...args) => run.call(...args), used: () => run.used };
}
export function interruptOnClose(res) {
  let closed = false;
  res.on('close', () => { if (!res.writableEnded) closed = true; });
  return () => closed;
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
    const result = await runAutopilot(judgeAutopilotSource(record), body, { research: researchClient(run), mode, shouldStop: interruptOnClose(res) });
    if (result.receipts.some(receipt => receipt.source === 'synthetic')) result.mode = result.packet.mode = 'synthetic';
    const saved = saveAutopilotRun({ caseId: record.id, caseTitle: record.title, createdAt: new Date().toISOString(), researchCalls: run.used, providerCalls: result.mode === 'synthetic' ? 0 : run.used, ...publicAutopilotRun(result) });
    if (!res.writableEnded && !res.destroyed) res.status(201).json(saved);
  }));
  // The checked-in provider-backed record, exported as a packet. No provider calls.
  app.get('/api/autopilot/recorded/packet', handle(async (req, res) => {
    let file;
    try { file = JSON.parse(readFileSync(recordedPath, 'utf8')); } catch { throw fault('No recorded Autopilot run is published.', 404); }
    const notice = `Recorded provider-backed run captured ${file.capturedAt} (${file.providerCalls} Qloo workflow calls). Replayed without new provider calls.`;
    if (req.query.format === 'md') {
      res.set('Content-Disposition', 'attachment; filename="houselights-autopilot-recorded.md"');
      return res.type('text/markdown').send(`> ${notice}\n\n${file.run.packet.markdown}`);
    }
    res.set('Content-Security-Policy', PACKET_CSP);
    return res.type('html').send(renderPacketHtml(file.run.packet, file.run.currency, notice));
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
    res.set('Content-Security-Policy', PACKET_CSP);
    res.set('Content-Disposition', `inline; filename="${name}.html"`);
    return res.type('html').send(renderPacketHtml(saved.packet, saved.currency, saved.mode === 'synthetic' ? 'Synthetic Qloo fixtures — not real evidence.' : ''));
  }));
}
