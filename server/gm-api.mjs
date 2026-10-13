import * as store from './store.mjs';
import { Run, isMock } from './qloo.mjs';
import { normalizeFestivalResearch, festivalWorkflowCount } from './festival-research.mjs';
import { runFestivalGM, reviseFestival, benchmarkFestival } from './gm.mjs';
import { planDates, buildThemeSeason } from './theme-season.mjs';

export function registerGMRoutes(app) {
  const hits = new Map();
  let date = '', count = 0;
  const limit = (req, res, next) => {
    const now = Date.now(), today = new Date(now).toISOString().slice(0, 10);
    if (date !== today) { date = today; count = 0; }
    for (const [ip, recent] of hits) if (recent.every(at => now - at >= 60000)) hits.delete(ip);
    const recent = (hits.get(req.ip) ?? []).filter(at => now - at < 60000);
    if (recent.length >= 6 || count >= 100) return res.status(429).json({ error: 'GM operation limit reached. Saved decisions remain readable.' });
    hits.set(req.ip, [...recent, now]); count++; next();
  };
  app.post('/api/gm/schedule', (req, res) => {
    try { res.json(planDates(req.body)); } catch (error) { res.status(400).json({ error: error.message }); }
  });
  app.post('/api/gm/:id/:action', limit, async (req, res) => {
    const source = store.load(req.params.id), action = req.params.action;
    if (!['run', 'benchmark', 'revise', 'season'].includes(action)) return res.status(404).json({ error: 'Unknown GM action.' });
    if (!source) return res.status(404).json({ error: 'Saved run not found.' });
    try {
      let snapshot;
      if (action === 'run') {
        if (!isMock() && !process.env.QLOO_API_KEY) return res.status(503).json({ error: 'Configure QLOO_API_KEY or use synthetic development mode.' });
        const input = normalizeFestivalResearch(source, req.body);
        const requestedBudget = Number(process.env.GM_CALL_BUDGET ?? 60);
        const budget = Number.isInteger(requestedBudget) && requestedBudget > 0 ? Math.min(120, requestedBudget) : 60;
        const expectedCalls = festivalWorkflowCount(source, input);
        if (expectedCalls > budget) return res.status(400).json({ error: `Research requires up to ${expectedCalls} workflows; configured budget is ${budget}. Reduce markets or slate size.`, expectedCalls });
        const offset = (source.receipts ?? []).reduce((max, receipt) => Math.max(max, Number(/^g(\d+)$/.exec(receipt.id)?.[1] ?? 0)), 0);
        const run = new Run({ budget, deadlineMs: 120000, receiptPrefix: 'g', receiptOffset: offset });
        snapshot = await runFestivalGM(source, input, run);
      } else if (action === 'revise') {
        const result = await reviseFestival(source, req.body);
        if (!result.snapshot) return res.status(result.status === 'rejected' ? 422 : 409).json(result);
        snapshot = result.snapshot;
      } else if (action === 'benchmark') {
        snapshot = { ...source, id: undefined, createdAt: undefined, parentId: source.id, benchmark: await benchmarkFestival(source) };
      } else {
        snapshot = { ...source, id: undefined, createdAt: undefined, parentId: source.id, themeSeason: buildThemeSeason(source, req.body) };
      }
      const id = store.save(snapshot);
      res.status(201).json({ id, snapshot: store.load(id) });
    } catch (error) { res.status(400).json({ error: error.message }); }
  });
}
