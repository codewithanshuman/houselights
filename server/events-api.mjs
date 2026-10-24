import { randomBytes } from 'node:crypto';
import { Run, isMock } from './qloo.mjs';
import { buildMemo } from './agent.mjs';
import { routeQuota } from './access.mjs';
import { runAutopilot } from './autopilot.mjs';
import { publicReceipt } from './autopilot-integrity.mjs';
import { renderPacketHtml, researchClient, interruptOnClose, PACKET_CSP } from './autopilot-api.mjs';
import { createEvent, loadEvent, listEvents, reviseEvent, deleteEvent, saveResearch, addRun, mergeRunEvidence, revisionSource, compareRuns, researchInput, summary, briefChanges, researchStale } from './events.mjs';

const fault = (message, status = 400) => Object.assign(new Error(message), { status });
const positive = (value, fallback) => Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
const running = new Set();

// The event as the workspace needs it: full briefs and research, run summaries only.
export function eventView(event) {
  const latest = event.revisions.at(-1);
  return { ...summary(event), revisions: event.revisions.map((row, index) => ({ ...row, changes: index ? briefChanges(event.revisions[index - 1].brief, row.brief) : [] })),
    research: event.research ? { ...event.research, snapshot: undefined, items: event.research.snapshot?.memo.items.map(({ id, name, originalName, found, rank, of, fit, local, momentum, evidence }) => ({ id, name, originalName: originalName ?? null, found: found === true, rank, of, fit, local, momentum, evidence })) ?? [],
      receipts: event.research.snapshot?.receipts.length ?? 0 } : null,
    researchStale: researchStale(event, latest.brief),
    runs: event.runs.map(({ run: _run, ...rest }) => rest) };
}

async function research(event, revision) {
  const brief = event.revisions.find(row => row.revision === revision).brief;
  const startedAt = new Date().toISOString(), trace = [], unresolved = [], errors = [];
  const budget = Math.min(30, positive(process.env.EVENT_RESEARCH_BUDGET, 24));
  const run = new Run({ budget, deadlineMs: 150000, emit: event => {
    if (event.type === 'needs_input') unresolved.push({ name: event.name, choices: (event.candidates ?? []).filter(row => row.name && row.id).slice(0, 5).map(row => ({ name: String(row.name).slice(0, 180), id: String(row.id).slice(0, 100) })) });
    if (event.type === 'error') errors.push(String(event.text ?? '').slice(0, 200));
    if (['stage', 'plan', 'needs_input', 'error'].includes(event.type) && trace.length < 60) trace.push({ type: event.type, text: String(event.text ?? event.name ?? '').slice(0, 200) });
  } });
  let memo = null;
  try { memo = await buildMemo(researchInput(brief), run); }
  catch (error) { errors.push('The research run stopped unexpectedly. Receipts collected so far are kept.'); console.error('Event research failed:', error); }
  const mode = run.mode === 'mock' || run.receipts.some(row => row.source === 'synthetic') ? 'synthetic' : 'live';
  const resolvedNames = new Set((memo?.items ?? []).flatMap(item => [item.name, item.originalName].filter(Boolean).map(name => name.toLowerCase())));
  const missing = brief.candidates.filter(row => !resolvedNames.has(row.name.toLowerCase())).map(row => row.name);
  const unusable = memo && memo.items.length < 2;
  return { revision, mode, status: memo && !unusable ? 'complete' : 'failed', startedAt, completedAt: new Date().toISOString(), callsUsed: run.used, callBudget: budget,
    unresolved: [...new Set([...unresolved.map(row => row.name), ...missing])], choices: unresolved, errors: unusable ? [...errors, 'Fewer than two candidates could be resolved.'] : errors, trace,
    snapshot: memo && !unusable ? { memo: { ...memo, eval: undefined, base: undefined }, receipts: run.receipts.map(publicReceipt) } : null,
    receipts: run.receipts.length };
}

/** Runs Autopilot on one brief revision, stores the run and merges new evidence into the event. */
export async function decideEvent(event, { revision, maxCalls, shouldStop = () => false }) {
  const { source, context, brief } = revisionSource(event, revision);
  context.unresolved = event.research.unresolved ?? [];
  // Per-run receipt prefixes keep IDs unique once evidence is merged into the event.
  const run = maxCalls > 0 ? new Run({ budget: maxCalls, receiptPrefix: `a${event.runs.length + 1}-`, deadlineMs: 150000 }) : null;
  const mode = !run ? 'planning' : run.mode === 'mock' || isMock() || event.research.mode === 'synthetic' ? 'synthetic' : 'live';
  const result = await runAutopilot(source, { maxCalls }, { research: run ? researchClient(run) : null, mode, brief: context, shouldStop });
  const stored = { ...result, receipts: result.receipts.map(publicReceipt) };
  const rec = stored.packet.recommendation;
  const entry = { id: `run_${randomBytes(8).toString('hex')}`, revision, createdAt: new Date().toISOString(), mode, status: result.status, callsUsed: run ? run.used : 0, researchMode: event.research.mode,
    evidenceReceipts: source.receipts.length + stored.receipts.length,
    summary: { names: rec?.names ?? [], totalFee: rec?.totalFee ?? null, policyScore: rec?.policyScore ?? null, feasible: !!rec, strategies: stored.packet.strategies.length, decisionChanged: stored.packet.research.decisionChanged, budget: brief.constraints.budget },
    run: stored };
  const latest = loadEvent(event.id);
  mergeRunEvidence(latest, { id: entry.id, receipts: stored.receipts, items: stored.items });
  addRun(latest, entry);
  return entry;
}

/** Runs Qloo research for the latest revision and stores it, keeping earlier complete research on failure. */
export async function researchEvent(event) {
  const revision = event.revisions.at(-1).revision;
  const result = await research(event, revision);
  const current = loadEvent(event.id);
  if (result.status === 'complete' || !current.research || current.research.status !== 'complete') saveResearch(current, result);
  else { current.lastFailedResearch = { ...result, snapshot: undefined }; saveResearch(current, current.research); }
  return result;
}

export function registerEventRoutes(app) {
  const handle = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) return res.status(error.status).json({ error: error.message });
      console.error('Unexpected event request failure:', error);
      return res.status(500).json({ error: 'The request could not be completed.' });
    }
  };
  const eventFor = id => { const event = loadEvent(id); if (!event) throw fault('Event not found.', 404); return event; };
  const exclusive = async (id, fn) => {
    if (running.has(id)) throw fault('This event is already running research or a decision. Wait for it to finish.', 409);
    running.add(id);
    try { return await fn(); } finally { running.delete(id); }
  };

  app.get('/api/events', handle(async (_req, res) => res.json({ events: listEvents() })));
  app.post('/api/events', handle(async (req, res) => res.status(201).json(eventView(createEvent(req.body?.brief)))));
  app.get('/api/events/:id', handle(async (req, res) => res.json(eventView(eventFor(req.params.id)))));
  app.delete('/api/events/:id', handle(async (req, res) => { if (!deleteEvent(req.params.id)) throw fault('Event not found.', 404); res.json({ deleted: true }); }));
  app.post('/api/events/:id/revisions', handle(async (req, res) => {
    const event = eventFor(req.params.id);
    if (running.has(event.id)) throw fault('Wait for the running step to finish before revising.', 409);
    res.status(201).json(eventView(reviseEvent(event, req.body?.brief, req.body?.note)));
  }));
  app.post('/api/events/:id/research', handle(async (req, res) => {
    const event = eventFor(req.params.id);
    if (!isMock() && !process.env.QLOO_API_KEY) throw fault('Qloo is not configured on this server. Set QLOO_API_KEY, or use synthetic development mode.', 503);
    if (!routeQuota(req, 'event-research', { minuteLimit: 3, dayLimit: 60 })) throw fault('Research limit reached. Try again later; revising fees and constraints does not need new research.', 429);
    await exclusive(event.id, async () => {
      const result = await researchEvent(event);
      res.status(result.status === 'complete' ? 201 : 502).json({ ...eventView(loadEvent(event.id)), attempt: { status: result.status, errors: result.errors, unresolved: result.unresolved, callsUsed: result.callsUsed } });
    });
  }));
  app.post('/api/events/:id/autopilot', handle(async (req, res) => {
    const event = eventFor(req.params.id);
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const unknown = Object.keys(body).filter(name => !['revision', 'maxCalls'].includes(name));
    if (unknown.length) throw fault(`Unsupported field(s): ${unknown.join(', ')}.`);
    const revision = body.revision ?? event.revisions.at(-1).revision, maxCalls = body.maxCalls ?? 8;
    if (!Number.isInteger(revision)) throw fault('Revision must be a whole number.');
    if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > 16) throw fault('Choose 0–16 Qloo calls (0 plans from saved evidence).');
    if (maxCalls > 0 && !isMock() && !process.env.QLOO_API_KEY) throw fault('Qloo is not configured on this server. Choose 0 calls to plan from saved evidence.', 503);
    if (maxCalls > 0 && !routeQuota(req, 'event-autopilot', { minuteLimit: 4, dayLimit: 120 })) throw fault('Decision research limit reached. Try again later or plan with 0 calls.', 429);
    await exclusive(event.id, async () => {
      const entry = await decideEvent(event, { revision, maxCalls, shouldStop: interruptOnClose(res) });
      if (!res.writableEnded && !res.destroyed) res.status(201).json({ ...entry, event: eventView(loadEvent(event.id)) });
    });
  }));
  app.get('/api/events/:id/runs/:runId', handle(async (req, res) => {
    const entry = eventFor(req.params.id).runs.find(row => row.id === req.params.runId);
    if (!entry) throw fault('Decision run not found.', 404);
    res.json(entry);
  }));
  app.get('/api/events/:id/runs/:runId/packet', handle(async (req, res) => {
    const event = eventFor(req.params.id), entry = event.runs.find(row => row.id === req.params.runId);
    if (!entry) throw fault('Decision run not found.', 404);
    const name = `houselights-${event.id}-${entry.id}`;
    if (req.query.format === 'md') { res.set('Content-Disposition', `attachment; filename="${name}.md"`); return res.type('text/markdown').send(entry.run.packet.markdown); }
    res.set('Content-Security-Policy', PACKET_CSP);
    res.set('Content-Disposition', `inline; filename="${name}.html"`);
    return res.type('html').send(renderPacketHtml(entry.run.packet, entry.run.currency, entry.mode === 'synthetic' ? 'Synthetic Qloo fixtures — not real evidence.' : ''));
  }));
  app.get('/api/events/:id/compare', handle(async (req, res) => res.json(compareRuns(eventFor(req.params.id), String(req.query.a ?? ''), String(req.query.b ?? '')))));
}
