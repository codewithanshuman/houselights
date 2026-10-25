// Builds the Booking Desk's static first screen from published evidence, so first paint
// shows the real bill with no API call and the path still works if the API is down.
//
// Writes public/judge-static.json (bill with and without Qloo evidence, the diff, the
// near-tie, fit basis, receipts with integrity results) and inlines the first screen
// into public/desk.html between the first-screen markers. Everything is computed by
// the same server code the live Booking Desk uses; tests/judge-static.test.mjs fails if
// either output drifts from a fresh computation. No provider calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { computeQlooContribution } from './build-qloo-contribution.mjs';

const repo = resolve(import.meta.dirname, '..');
const read = path => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const usd = value => value == null ? '—' : `$${Math.round(value).toLocaleString('en-US')}`;

export async function computeJudgeStatic() {
  const contribution = await computeQlooContribution();
  const { sourceReceiptDigest, receiptContentDigest } = await import('../server/autopilot-integrity.mjs');
  const { PINNED_MANIFESTS } = await import('../server/autopilot-pins.mjs');
  const record = read('public/autopilot-recorded.json'), run = record.run, packet = run.packet, manifest = run.integrity;
  const source = read('deploy/judge-cases.json').cases.find(row => row.title === record.caseTitle)?.snapshot;
  if (!source) throw new Error(`The recorded case "${record.caseTitle}" is not in deploy/judge-cases.json.`);
  const names = ids => ids.map(id => source.memo.items.find(item => item.id === id)?.name ?? id);
  const withQloo = contribution.withQloo, withoutQloo = contribution.withoutQloo;
  const leaving = withQloo.names.filter(name => !withoutQloo.names.includes(name)), entering = withoutQloo.names.filter(name => !withQloo.names.includes(name));
  const tie = packet.ties?.groups?.find(group => group.changesBill) ?? null;
  const pinned = PINNED_MANIFESTS['public/autopilot-recorded.json'];
  const listed = new Map(manifest.sourceReceipts.map(row => [row.id, row.contentDigest]));
  const runListed = new Map(manifest.receipts.map(row => [row.id, row.contentDigest]));
  const nameOf = id => source.memo.items.find(item => item.id === id)?.name ?? run.items.find(item => item.id === id)?.name ?? null;
  const rows = receipt => (receipt.evidence?.rows ?? []).slice(0, 12).map(row => ({ id: row.id ?? null, name: row.name ?? nameOf(row.id), ...(Number.isFinite(row.affinity) ? { affinity: row.affinity } : {}), ...(Number.isFinite(row.popularity) ? { popularity: row.popularity } : {}) }));
  const receipt = (row, origin) => {
    const contentDigest = origin === 'case' ? sourceReceiptDigest(row) : receiptContentDigest(row), manifestDigest = (origin === 'case' ? listed : runListed).get(row.id) ?? null;
    return { id: row.id, origin, tool: row.tool, status: row.status, fetchedAt: row.fetchedAt ?? null, why: row.why ?? null, originalDigest: row.originalDigest ?? null, rows: rows(row),
      integrity: { contentDigest, manifestDigest, matchesManifest: manifestDigest === contentDigest } };
  };
  const billActs = [...new Set([...withQloo.names, ...withoutQloo.names])];
  const acts = billActs.map(name => {
    const item = run.items.find(row => row.name === name);
    return { name, affinity: item?.affinity ?? null, rankReceipt: item?.evidenceReceipts?.rank?.[0] ?? null, receipts: Object.values(item?.evidenceReceipts ?? {}).flat() };
  });
  return {
    version: '1.0', caseId: contribution.caseId, caseTitle: record.caseTitle, capturedAt: record.capturedAt,
    brief: { city: packet.brief.city, anchors: packet.brief.anchors, budget: packet.brief.budget, slots: packet.brief.slots, candidates: packet.brief.candidates, currency: contribution.currency },
    withQloo: { names: withQloo.names, totalFee: withQloo.totalFee }, withoutQloo: { names: withoutQloo.names, totalFee: withoutQloo.totalFee },
    diff: { feeChange: withoutQloo.totalFee - withQloo.totalFee, leaving, entering, changed: contribution.changed },
    sameBillUnderAffinity: [...packet.recommendation.names].sort().join() === [...withQloo.names].sort().join(),
    fitBasis: { recordedRun: packet.fitBasis === 'qloo-affinity' ? 'Qloo affinity' : 'ordinal fallback', bookingDesk: 'ordinal fallback' },
    nearTie: tie ? { names: tie.names, scores: tie.scores, spread: tie.spread, band: packet.ties.band, tiedBill: tie.tiedNames, restsOnNearTie: packet.recommendation.restsOnNearTie === true } : null,
    acts,
    integrity: { manifestDigest: manifest.manifestDigest, pinnedDigest: pinned, pinMatches: manifest.manifestDigest === pinned, providerProvenance: 'Qloo responses are unsigned: digests show these records are unchanged since capture, not that Qloo sent them.' },
    receipts: [...source.receipts.map(row => receipt(row, 'case')), ...run.receipts.map(row => receipt(row, 'run'))]
  };
}

// The first screen, pre-rendered: one headline, the bill, the Qloo-off change and one switch.
export function firstScreenHtml(data) {
  const before = usd(data.withQloo.totalFee), after = usd(data.withoutQloo.totalFee);
  const summary = { caseId: data.caseId, brief: data.brief, withQloo: data.withQloo, withoutQloo: data.withoutQloo, diff: data.diff, nearTie: data.nearTie, fitBasis: data.fitBasis, acts: data.acts.map(({ name, affinity, rankReceipt }) => ({ name, affinity, rankReceipt })) };
  return `<!-- first-screen:begin (generated by scripts/build-judge-static.mjs; do not edit) -->
    <section id="first-screen" class="first-screen" aria-labelledby="first-screen-title">
      <p class="fs-kicker">${html(data.brief.city)} · ${html(data.brief.slots)} slots for fans of ${html(data.brief.anchors.join(', '))} · ${html(usd(data.brief.budget))} artist budget · fees are illustrative</p>
      <h1 id="first-screen-title">Book <span id="fs-bill">${html(data.withQloo.names.join(' + '))}</span> for <span id="fs-fee">${html(before)}</span>.</h1>
      <p class="fs-change" id="fs-change">Without Qloo evidence, the same rules book ${html(data.withoutQloo.names.join(' + '))} for ${html(after)}: <strong>${html(before)} → ${html(after)}</strong>.</p>
      <button type="button" class="fs-switch" id="qloo-switch" role="switch" aria-checked="true" aria-describedby="fs-change"><span class="fs-switch-track" aria-hidden="true"><span class="fs-switch-thumb"></span></span><span class="fs-switch-label">Qloo evidence <strong id="qloo-switch-state">on</strong></span></button>
      <div class="fs-diff" id="fs-diff" hidden></div>
      <p class="fs-announce sr-only" id="fs-announce" role="status" aria-live="polite"></p>
      <script type="application/json" id="judge-static">${JSON.stringify(summary).replace(/</g, '\\u003c')}</script>
    </section>
    <!-- first-screen:end -->`;
}

export function inlineFirstScreen(page, data) {
  const start = page.indexOf('<!-- first-screen:begin'), end = page.indexOf('<!-- first-screen:end -->');
  if (start < 0 || end < 0) throw new Error('public/desk.html is missing the first-screen markers.');
  return page.slice(0, start) + firstScreenHtml(data) + page.slice(end + '<!-- first-screen:end -->'.length);
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/').replace(/^\//, '')}`) {
  const data = await computeJudgeStatic();
  writeFileSync(join(repo, 'public', 'judge-static.json'), JSON.stringify(data, null, 2) + '\n');
  const pagePath = join(repo, 'public', 'desk.html');
  writeFileSync(pagePath, inlineFirstScreen(readFileSync(pagePath, 'utf8'), data));
  console.log(JSON.stringify({ written: ['public/judge-static.json', 'public/desk.html (first screen)'], bill: data.withQloo.names, withoutQloo: data.withoutQloo.names, receipts: data.receipts.length, allMatch: data.receipts.every(row => row.integrity.matchesManifest), pinMatches: data.integrity.pinMatches }));
}
