// The numbers quoted in README, the Devpost draft and the claims audit are generated from
// the results JSON, never typed by hand. Each appears between markers:
//   <!--claim:withdrawal-->7 of 9<!--/claim-->
// `node scripts/claims.mjs --update` rewrites every marked value; `--check` (CI) fails
// if any marked value differs from a fresh computation, or a file lost its markers.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const json = path => JSON.parse(readFileSync(join(repo, path), 'utf8'));
const pct = (n, d, digits = 1) => `${(100 * n / d).toFixed(digits)}%`;
const thousands = n => n.toLocaleString('en-US');
const countTests = dir => readdirSync(join(repo, dir)).filter(file => /\.(test|spec)\.mjs$/.test(file))
  .reduce((sum, file) => sum + (readFileSync(join(repo, dir, file), 'utf8').match(/^\s*test\(/gm) ?? []).length, 0);

export function computeClaims() {
  const evaluation = json('results/autopilot-evaluation.json'), rank = json('results/rank-vs-optimum.json').totals;
  const shocks = json('results/shocks.json').breakdown.solvable, sensitivity = json('results/sensitivity.json').totals;
  const comparable = evaluation.partA.filter(row => row.feasible && row.rankComparable);
  return {
    withdrawal: `${comparable.filter(row => row.evidenceWithdrawalChangesDecision).length} of ${comparable.length}`,
    rankDiffers: pct(rank.differsAffinity, rank.topKFeasible),
    rankDiffersCount: `${thousands(rank.differsAffinity)} of ${thousands(rank.topKFeasible)}`,
    rankDiffersOrdinal: pct(rank.differsOrdinal, rank.topKFeasible, 0),
    unbookable: pct(rank.topKInfeasible, rank.scenarios, 0),
    scenarios: thousands(rank.scenarios),
    shockViolations: `${shocks.violationResponses}/${shocks.returnedResponses}`,
    shockRate: pct(shocks.violationResponses, shocks.returnedResponses),
    noiseMean: `${Math.round(sensitivity.meanShare * 100)}%`,
    noiseRobust: `${sensitivity.robustUnderNoise} of ${sensitivity.briefs}`,
    // The featured Booking Desk brief (the recorded New York run) under the same fee noise.
    featuredNoise: (row => `${row.feeNoise.withdrawalChanges} of ${row.feeNoise.draws}`)(json('results/sensitivity.json').rows.find(row => row.brief === 'New York: watch a recorded Qloo research run')),
    unitTests: String(countTests('tests')),
    browserTests: String(countTests('browser')),
  };
}

// The evidence page's claim table, generated from the same numbers (public/claims.json).
const LIMIT = 'Evidence influences the decision; ticket sales are not measured; fees are illustrative.';
const SOURCE = path => `https://github.com/codewithanshuman/houselights/blob/main/${path}`;
export function claimTable(c) {
  return { version: '1.0', generatedBy: 'scripts/claims.mjs', rows: [
    { claim: `Withdrawing Qloo evidence changes the decision in ${c.withdrawal} briefs with a complete Qloo ranking.`, status: 'verified', limit: `${LIMIT} Under ±20% fee noise it changes in ${c.noiseMean} of draws, robustly in ${c.noiseRobust} briefs.`, source: SOURCE('results/autopilot-evaluation.md'), reproduce: 'npm run evaluate:autopilot' },
    { claim: `Where Qloo's top-ranked acts are bookable, the optimizer still chooses differently in ${c.rankDiffers} of seeded scenarios (${c.rankDiffersCount}); ${c.rankDiffersOrdinal} with the old ordinal fit.`, status: 'verified', limit: `${LIMIT} All differences come from one near-tie brief.`, source: SOURCE('results/rank-vs-optimum.md'), reproduce: 'npm run evaluate:rank-vs-optimum' },
    { claim: `In ${c.unbookable} of ${c.scenarios} scenarios Qloo's top-ranked acts cannot be booked; the optimizer finds the best bookable bill or says none exists.`, status: 'verified', limit: 'The main contribution is constraint handling, not re-ranking Qloo.', source: SOURCE('results/rank-vs-optimum.md'), reproduce: 'npm run evaluate:rank-vs-optimum' },
    { claim: 'Fee-noise and near-tie band sensitivity of the findings above.', status: 'verified', limit: '"7 of 9" is a point estimate at the published, illustrative fees.', source: SOURCE('results/sensitivity.md'), reproduce: 'npm run evaluate:sensitivity' },
    { claim: `${c.shockViolations} re-prompted LLM responses (${c.shockRate}) broke a hard rule on comparable solvable shocks; Houselights broke none.`, status: 'verified (by construction)', limit: 'An exact optimizer cannot break a hard rule; this is not evidence of better judgement.', source: SOURCE('results/shocks.md'), reproduce: 'npm run reproduce:shocks' },
    { claim: 'Every pinned Autopilot recording replays exactly under the scoring version that produced it.', status: 'verified', limit: 'Qloo responses are unsigned: digests show records are unchanged, not that Qloo sent them.', source: SOURCE('server/autopilot-pins.mjs'), reproduce: 'npm run reproduce:autopilot' },
    { claim: 'Blind reviews by promoters, venue programmers or bookers.', status: 'pending', limit: 'None collected yet; the live count is shown below.', source: SOURCE('docs/usability-test-kit.md'), reproduce: null, live: 'reviews' },
    { claim: 'First-time usability sessions.', status: 'pending', limit: '0 genuine sessions recorded. Developer dry runs and automated browser tests are excluded.', source: SOURCE('docs/usability-test-kit.md'), reproduce: null },
    { claim: 'Ticket sales, attendance or profit improvement from following Houselights.', status: 'not measured', limit: 'No real outcome data exists for these decisions.', source: SOURCE('docs/claims-audit.md'), reproduce: null },
  ] };
}

// The same table as HTML, written into evidence.html between markers so it is part of the
// first paint. public/claims-table.js fills in the live review count and the copy buttons.
const esc = value => String(value).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const badgeClass = status => /^verified/.test(status) ? 'badge-good' : /pending/.test(status) ? 'badge-warn' : 'badge-muted';
const copyButton = command => `<code>${esc(command)}</code> <button type="button" class="button subtle small" data-copy="${esc(command)}" aria-label="Copy command: ${esc(command)}">Copy</button>`;
export function claimTableHtml(table) {
  const rows = table.rows.map(row => `<tr><th scope="row">${esc(row.claim)} <a href="${esc(row.source)}">source</a></th><td><span class="badge ${badgeClass(row.status)}">${esc(row.status)}</span></td><td>${esc(row.limit)}${row.live ? ` <strong data-live="${esc(row.live)}">…</strong> completed so far.` : ''}</td><td>${row.reproduce ? copyButton(row.reproduce) : '—'}</td></tr>`).join('');
  return `<div class="table-scroll"><table class="data-table"><caption>Claims and their evidence</caption><thead><tr><th scope="col">Claim</th><th scope="col">Status</th><th scope="col">Limit</th><th scope="col">Reproduce</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p class="path-note">Reproduce everything at once with ${copyButton('npm run verify:all')}</p>`;
}
const TABLE_MARKER = /(<!-- claim-table:begin[^>]*-->)[\s\S]*?(<!-- claim-table:end -->)/;
export const inlineClaimTable = (html, table) => html.replace(TABLE_MARKER, (_, begin, end) => begin + claimTableHtml(table) + end);

export const CLAIM_FILES = ['README.md', 'docs/devpost-description.md', 'docs/claims-audit.md', 'docs/submission.md'];
const MARKER = /<!--claim:([a-zA-Z]+)-->(.*?)<!--\/claim-->/g;

export function applyClaims(text, claims) {
  const problems = [];
  const updated = text.replace(MARKER, (match, key, value) => {
    if (!(key in claims)) { problems.push(`unknown claim "${key}"`); return match; }
    if (value !== claims[key]) problems.push(`${key}: "${value}" should be "${claims[key]}"`);
    return `<!--claim:${key}-->${claims[key]}<!--/claim-->`;
  });
  return { updated, problems, markers: (text.match(MARKER) ?? []).length };
}

if (import.meta.url === `file:///${process.argv[1]?.replaceAll('\\', '/').replace(/^\//, '')}`) {
  const claims = computeClaims(), update = process.argv.includes('--update'), report = [];
  let failed = false;
  for (const file of CLAIM_FILES) {
    const path = join(repo, file), text = readFileSync(path, 'utf8'), { updated, problems, markers } = applyClaims(text, claims);
    if (!markers) { report.push(`${file}: no claim markers`); failed = true; continue; }
    if (update && updated !== text) writeFileSync(path, updated);
    if (problems.length && !update) { failed = true; report.push(...problems.map(p => `${file}: ${p}`)); }
    else report.push(`${file}: ${markers} marked numbers ${update && problems.length ? 'updated' : 'current'}`);
  }
  const tablePath = join(repo, 'public', 'claims.json'), table = JSON.stringify(claimTable(claims), null, 2) + '\n';
  const current = (() => { try { return readFileSync(tablePath, 'utf8'); } catch { return ''; } })();
  if (update && current !== table) writeFileSync(tablePath, table);
  if (!update && current.replace(/\r\n/g, '\n') !== table) { failed = true; report.push('public/claims.json: stale'); } else report.push(`public/claims.json: ${update && current !== table ? 'updated' : 'current'}`);
  const pagePath = join(repo, 'public', 'evidence.html'), page = readFileSync(pagePath, 'utf8'), inlined = inlineClaimTable(page, claimTable(claims));
  if (!TABLE_MARKER.test(page)) { failed = true; report.push('public/evidence.html: no claim-table markers'); }
  else if (update && inlined !== page) { writeFileSync(pagePath, inlined); report.push('public/evidence.html: claim table updated'); }
  else if (!update && inlined !== page) { failed = true; report.push('public/evidence.html: claim table stale'); }
  else report.push('public/evidence.html: claim table current');
  console.log(JSON.stringify(claims));
  console.log(report.join('\n'));
  if (failed) { console.error('Claim numbers drifted from the results JSON. Run: node scripts/claims.mjs --update'); process.exit(1); }
}
