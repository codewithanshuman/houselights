// Captures one organizer session on a brand-new event through the production
// workspace functions with live Qloo: create → research → decide → revise →
// decide again on the same evidence → compare. LLM features are off so research
// is bounded and planned by rules. Writes only public projections.
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..');
const output = resolve(process.argv[2] ?? join(repo, 'public', 'workspace-example.json'));
if (process.env.QLOO_MODE === 'mock' || !process.env.QLOO_API_KEY) { console.error('A live Qloo key is required; synthetic sessions are never published as recorded examples.'); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), 'houselights-workspace-capture-'));
process.env.DATA_DIR = dir;
process.env.LLM_MODE = 'off';
process.env.EVENT_RESEARCH_BUDGET = '22';
const illustrative = 'Illustrative demonstration value, not a quote.';
const brief = { name: 'Night Shift Soul Revue', city: 'Chicago', venue: '700-capacity club (illustrative)', date: '2027-04-16', direction: 'Modern soul with a jazz-funk edge',
  audience: '25–40 year-old soul and R&B fans who follow Leon Bridges and Erykah Badu', objectives: ['Fill a 700-capacity room', 'Book one act the audience is likely to discover'],
  anchors: ['Leon Bridges', 'Erykah Badu'], currency: 'USD', constraints: { budget: 22000, slots: 2 },
  candidates: [
    { name: 'Thundercat', fee: 12000, feeStatus: 'estimate', availability: 'assumed', genre: 'jazz-funk', notes: illustrative },
    { name: 'Durand Jones & The Indications', fee: 7000, feeStatus: 'estimate', availability: 'assumed', genre: 'soul', notes: illustrative },
    { name: 'Masego', fee: 9000, feeStatus: 'estimate', availability: 'assumed', genre: 'r&b', notes: illustrative },
    { name: 'Lianne La Havas', fee: 11000, feeStatus: 'estimate', availability: 'unconfirmed', genre: 'soul', notes: illustrative },
    { name: 'Thee Sacred Souls', fee: 5500, feeStatus: 'estimate', availability: 'assumed', genre: 'soul', notes: illustrative },
    { name: 'Nao', fee: null, availability: 'unconfirmed', genre: 'r&b', notes: 'Fee unknown: no quote requested yet.' },
  ],
  commercial: { capacity: 700, ticketPrice: 55, otherCosts: 9000 } };
try {
  const { createEvent, reviseEvent, loadEvent, compareRuns } = await import('../server/events.mjs');
  const { researchEvent, decideEvent, eventView } = await import('../server/events-api.mjs');
  const { closeQloo } = await import('../server/qloo.mjs');
  const { db } = await import('../server/database.mjs');
  const startedAt = Date.now();
  const event = createEvent(brief);
  const research = await researchEvent(event);
  console.error(`research: ${research.status}, ${research.callsUsed} calls, unresolved ${research.unresolved.join(', ') || 'none'}`);
  if (research.status !== 'complete') throw new Error(`Research was ${research.status}, not complete; refusing to publish. ${research.failedCalls?.map(row => `${row.id} ${row.tool} ${row.error}`).join('; ') ?? ''} ${research.errors.join(' ')}`);
  if (research.mode !== 'live') throw new Error('Research was not live.');
  const first = await decideEvent(loadEvent(event.id), { revision: 1, maxCalls: 6 });
  console.error(`decision 1: ${first.summary.names.join(' + ')} (${first.callsUsed} calls, ${first.status})`);
  if (first.status === 'partial') throw new Error('The first decision lost Qloo calls; refusing to publish a degraded example.');
  const revised = structuredClone(brief);
  revised.constraints.budget = 15000;
  Object.assign(revised.candidates.find(row => row.name === 'Masego'), { fee: 9500, feeStatus: 'quoted', availability: 'confirmed', notes: 'Illustrative quote typed for the demonstration.' });
  reviseEvent(loadEvent(event.id), revised, 'Sponsor cut the artist budget to $15,000; Masego quote received');
  const second = await decideEvent(loadEvent(event.id), { revision: 2, maxCalls: 0 });
  console.error(`decision 2: ${second.summary.names.join(' + ')} (planning)`);
  await closeQloo();
  const final = loadEvent(event.id);
  const receipts = [...final.research.snapshot.receipts];
  if (receipts.some(row => row.source !== 'qloo')) throw new Error('A non-Qloo receipt was produced; refusing to publish.');
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const file = { version: '1.0', kind: 'recorded-organizer-session', capturedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(),
    environment: { node: process.version, commit, qlooHost: new URL(process.env.QLOO_BASE_URL ?? 'https://hackathon.api.qloo.com').host, llm: 'off (rule-planned research)',
      harness: JSON.parse(readFileSync(join(repo, 'node_modules', '@qloo', 'qloo-harness', 'package.json'), 'utf8')).version },
    providerCalls: research.callsUsed + first.callsUsed + second.callsUsed,
    disclosure: 'A brand-new event created through the organizer workspace functions for this demonstration. Fees, availability, venue size and ticket price were typed as illustrative inputs, not real quotes. Qloo research and Autopilot calls were live.',
    event: eventView(final), research: { receipts }, runs: [first, second], comparison: compareRuns(final, first.id, second.id) };
  writeFileSync(output, JSON.stringify(file, null, 2) + '\n');
  db.close();
  console.log(JSON.stringify({ output, providerCalls: file.providerCalls, research: research.callsUsed, decision1: first.callsUsed, decisions: [first.summary.names, second.summary.names], lineupChanged: file.comparison.lineupChanged }, null, 2));
} finally {
  // The database may still hold the directory open after a failure; cleanup must not hide the real error.
  try { (await import('../server/database.mjs')).db.close(); } catch {}
  try { rmSync(dir, { recursive: true, force: true }); } catch (error) { console.error(`Could not remove ${dir}: ${error.code}`); }
}
