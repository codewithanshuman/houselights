import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import AxeBuilder from '@axe-core/playwright';
import { optimizeSlate } from '../server/optimizer.mjs';
import { buildDecisionProof } from '../server/decision-proof.mjs';
import { judgeMethods } from '../server/judge-comparison.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seedManifest=JSON.parse(readFileSync(join(root,'deploy','judge-cases.json'),'utf8'));
const seededCaseCount=seedManifest.cases.length;
const caseId = 'bf9b65d52eeff00e0e258917';
const tracedCaseId = '8be4d03ef4792ca9f1466983';
let app, dataDir, origin, output = '';

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function ready() {
  const deadline=Date.now()+60000;
  while (Date.now()<deadline) {
    if (app.exitCode != null) throw new Error(`Local Houselights exited early: ${output.slice(-1500)}`);
    try {
      const response = await fetch(`${origin}/api/judge/cases`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).cases.some(row => row.id === caseId)) return;
    } catch { /* Startup is still in progress. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Local Houselights did not load the saved judge case: ${output.slice(-1500)}`);
}

test.beforeAll(async () => {
  test.setTimeout(90000);
  dataDir = mkdtempSync(join(tmpdir(), 'houselights-browser-'));
  origin = `http://127.0.0.1:${await freePort()}`;
  const env = { ...process.env,
    HOST: '127.0.0.1', PORT: new URL(origin).port, DATA_DIR: dataDir,
    JUDGE_CASES_FILE: join(root, 'deploy', 'judge-cases.json'),
    PUBLIC_DEMO: '1', NODE_ENV: 'production', QLOO_MODE: 'mock', LLM_MODE: 'off',
    ORGANIZER_TOKEN: 'local-browser-regression-token-only-00000000',
  };
  delete env.QLOO_API_KEY;
  delete env.GROQ_API_KEY;
  app = spawn(process.execPath, ['server/index.mjs'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  app.stdout.on('data', chunk => { output += chunk; });
  app.stderr.on('data', chunk => { output += chunk; });
  await ready();
});

// As in the unit tests, each case gets its own request budget. A fast runner otherwise
// exhausts the server's real per-IP quota across the whole suite.
test.beforeEach(() => {
  const quotas = new DatabaseSync(join(dataDir, 'houselights.sqlite'));
  try { quotas.exec('PRAGMA busy_timeout=5000; DELETE FROM quotas;'); } finally { quotas.close(); }
});

// Opens the "Go deeper" panels that hold Autopilot and the original research timeline.
async function openDeeper(page){
  for(const id of ['go-deeper-research','go-deeper-autopilot'])await page.locator(`#${id}`).evaluate(node=>{node.open=true;});
}

test.afterAll(async () => {
  if (app && app.exitCode == null) {
    app.kill();
    await Promise.race([
      new Promise(resolve => app.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
  }
  if (dataDir && existsSync(dataDir) && dirname(dataDir) === tmpdir())
    rmSync(dataDir, { recursive: true, force: true });
});

test('first paint shows the real bill and the Qloo-off change with no API call', { tag: '@cross-browser' }, async ({ page }) => {
  // The first screen is inlined at build time: block every API call and it still renders.
  await page.route('**/api/**',route=>route.abort());
  await page.goto(`${origin}/desk.html`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#first-screen-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
  await expect(page.locator('#fs-change')).toContainText('$13,500 → $9,000');
  await expect(page.locator('#first-screen h1')).toHaveCount(1);
  await expect(page.locator('#first-screen button')).toHaveCount(1);
  await expect(page.locator('#step-brief-body')).toContainText('Fans of Leon Bridges');
  await expect(page.locator('#step-receipt-body [data-receipt]')).not.toHaveCount(0);
  // Status strip and shock teaser sit below the four steps.
  const below=await page.evaluate(()=>{const s=document.getElementById('step-receipt'),strip=document.querySelector('.judge-status-strip'),shock=document.querySelector('.judge-shock-study');return !!(s.compareDocumentPosition(strip)&Node.DOCUMENT_POSITION_FOLLOWING)&&!!(s.compareDocumentPosition(shock)&Node.DOCUMENT_POSITION_FOLLOWING);});
  expect(below).toBe(true);
});

test('keyboard only: the Qloo switch changes the decision, announces it once and keeps focus', { tag: '@cross-browser' }, async ({ page, browserName }) => {
  const experimentPosts=[];page.on('request',request=>{if(request.method()==='POST'&&/\/experiment$/.test(request.url()))experimentPosts.push(request.url());});
  await page.goto(`${origin}/desk.html`);
  const sw=page.getByRole('switch',{name:/Qloo evidence/});
  await expect(sw).toHaveAttribute('aria-checked','true');
  // WebKit, like Safari, does not move Tab focus to links by default (and its Windows
  // build ignores Option/Alt+Tab), so the skip-link step is checked in Chromium and Firefox.
  if(browserName!=='webkit'){await page.keyboard.press('Tab');await expect(page.locator('.skip-link')).toBeFocused();}
  await page.keyboard.press('Enter');
  await sw.focus();await page.keyboard.press('Space');
  await expect(sw).toHaveAttribute('aria-checked','false');await expect(sw).toBeFocused();
  await expect(page.locator('#first-screen-title')).toHaveText('Book Jordan Rakei + Hiatus Kaiyote for $9,000.');
  await expect(page.locator('#fs-diff')).toContainText('−$4,500');
  await expect(page.locator('#fs-diff .act-out')).toContainText('Michael Kiwanuka, Sault');
  await expect(page.locator('#fs-diff .act-in')).toContainText('Jordan Rakei, Hiatus Kaiyote');
  await expect(page.locator('#fs-announce')).toHaveText(/^Decision changed\. Without Qloo evidence the bill is Jordan Rakei \+ Hiatus Kaiyote/);
  await page.keyboard.press('Enter');await expect(sw).toHaveAttribute('aria-checked','true');
  await expect(page.locator('#first-screen-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
  expect(experimentPosts).toEqual([]);
});

test('the bill step explains the choice, draws the near-tie and badges the fit basis', { tag: '@cross-browser' }, async ({ page }) => {
  const recorded=JSON.parse(readFileSync(join(root,'public','autopilot-recorded.json'),'utf8')).run.packet;
  let release,held=false;const pending=new Promise(resolve=>{release=resolve;});
  await page.route(/\/api\/judge\/cases\/[a-f0-9]{24}$/,async route=>{held=true;await pending;await route.continue();});
  try {
  await page.goto(`${origin}/desk.html`);
  const glance=page.locator('#decision-glance');
  await expect(glance.locator('.glance-book strong')).toHaveText(recorded.recommendation.names.join(' + '));
  await expect(glance).toContainText('WATCH OUT');await expect(glance).toContainText('YOUR CALL');
  await expect(glance.locator('.glance-grid')).not.toContainText('policy points');
  await expect(glance.locator('.fit-badge')).toHaveText('Fit: Qloo affinity');
  await expect(page.locator('#judge-form .fit-badge')).toHaveText('Fit: ordinal fallback');
  const figure=glance.locator('figure.near-tie');
  await expect(figure.locator('svg[role=img]')).toHaveAttribute('aria-label',/Sault 0\.9580 and Jordan Rakei 0\.9579/);
  await expect(figure).toContainText('Coin flip, your call.');
  await expect(glance).toContainText('Qloo affinity 0.9770');
  await expect.poll(()=>held).toBe(true);
  await expect(page.locator('#judge-workspace')).toBeHidden();
  await glance.getByRole('link',{name:'Try a budget cut ↓'}).click();
  release();
  await expect(page.locator('#judge-tight-budget')).toBeFocused();await expect(page.locator('#judge-tight-budget')).toBeInViewport();
  // Not just in the viewport: visible, not under the sticky step bar.
  await expect.poll(()=>page.evaluate(()=>{const r=document.getElementById('judge-tight-budget').getBoundingClientRect();return !!document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#judge-tight-budget');})).toBe(true);
  await page.locator('.glance-glossary summary').click();
  await expect(page.locator('.glance-glossary')).toContainText('Qloo publishes no margin of error');
  } finally {release();}
});

test('receipt drawer shows the saved Qloo row with the act highlighted, digests and integrity', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto(`${origin}/desk.html`);
  const trigger=page.locator('#step-receipt-body [data-entity="Sault"]');
  await trigger.focus();await page.keyboard.press('Enter');
  const drawer=page.locator('#receipt-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('tr.is-highlight')).toContainText(/sault/i);
  await expect(drawer.locator('tr.is-highlight')).toContainText('0.9580');
  await expect(drawer.locator('.integrity-ok')).toContainText('Integrity check passed');
  await expect(drawer.locator('.digests code').first()).toHaveText(/^sha256:[0-9a-f]{64}$/);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();await expect(trigger).toBeFocused();
});

test('step 3 re-runs the withdrawal live, and the opened receipt clears the sticky form', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto(`${origin}/desk.html`);
  await page.locator('.booking-path').getByRole('link',{name:/Check the receipt/}).click();
  await expect(page.locator('#step-receipt')).toBeFocused();
  await page.getByRole('button',{name:'Re-run it live in the Booking Desk ↓'}).click();
  const comparison=page.locator('.judge-evidence-comparison');
  await expect(comparison).toContainText('Selection changed.',{timeout:30000});
  await expect(comparison.locator('.judge-evidence-columns strong').nth(1)).toHaveText('Jordan Rakei + Hiatus Kaiyote');
  await comparison.locator('[data-receipt-index]').first().click();
  await expect(page.locator('#judge-receipts details[open] summary').first()).toContainText('rank');
  for(const width of [1280,900,375]){
    await page.setViewportSize({width,height:800});
    await page.locator('#judge-receipts details[open]').first().scrollIntoViewIfNeeded();
    const overlap=await page.evaluate(()=>{const a=document.querySelector('#judge-receipts details[open]').getBoundingClientRect(),b=document.getElementById('judge-form').getBoundingClientRect();return a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;});
    expect(overlap,`receipt overlaps the experiment form at ${width}px`).toBe(false);
  }
});

test('the budget field explains bad input and clamps out-of-range values', async ({ page }) => {
  await page.goto(`${origin}/desk.html`);
  await expect(page.locator('#judge-workspace')).toBeVisible();
  const field=page.locator('#judge-budget'),error=page.locator('#judge-budget-error');
  await expect(field).toHaveAttribute('inputmode','decimal');await expect(field).toHaveAttribute('max','10000000');
  await field.fill('');await page.getByRole('button',{name:/Recalculate and check/}).click();
  await expect(error).toHaveText('Enter an artist budget in US dollars, for example 14500.');await expect(field).toHaveAttribute('aria-invalid','true');
  await field.fill('25000000');await page.getByRole('button',{name:/Recalculate and check/}).click();
  await expect(field).toHaveValue('10000000');await expect(error).toContainText('allowed range is $0 to $10,000,000');
});

test('matched Qloo withdrawal opens the exact saved receipts', async ({ page }) => {
  await page.goto(`${origin}/desk.html#${caseId}`);await openDeeper(page);
  await expect(page.locator('#judge-title')).toContainText('New York');
  // Synchronize with the real replay response before asserting its rendered receipts.
  // The application allows this request 20 seconds; the text assertion alone waited five.
  const replay = page.waitForResponse(response => response.url().includes(`/api/judge/cases/${caseId}/experiment`) && response.request().method() === 'POST', { timeout: 20000 });
  await page.getByRole('button', { name: 'Compare with Qloo evidence removed' }).click();
  expect((await replay).ok()).toBe(true);
  const comparison = page.locator('.judge-evidence-comparison');
  await expect(comparison).toContainText('MATCHED EVIDENCE TEST');
  await expect(comparison).toContainText('Same candidate pool, fees, availability, scoring policy and booking constraints.');
  await expect(comparison.getByRole('button', { name: 'Receipt v1' })).toBeVisible();
  await comparison.getByRole('button', { name: 'Receipt v1' }).click();
  const exactReceipt = page.locator('#judge-receipts details').filter({ has: page.locator('summary').getByText(/^v1 · rank · ok$/) });
  await expect(exactReceipt).toHaveAttribute('open', '');
  await expect(exactReceipt.locator('summary')).toBeFocused();
  await expect(exactReceipt.locator('pre')).toContainText('"id": "v1"');
  expect(new URL(page.url()).hash).toBe(`#${caseId}`);

  await page.locator('#judge-agent-trace').getByRole('button', { name: 'Receipt r11' }).click();
  const timelineReceipt = page.locator('#judge-receipts details').filter({ has: page.locator('summary').getByText(/^r11 · where_popular · ok$/) });
  await expect(timelineReceipt).toHaveAttribute('open', '');
  await expect(timelineReceipt.locator('summary')).toBeFocused();
});

test('budget plus evidence withdrawal is labeled as a combined change on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/desk.html#${caseId}`);
  await expect(page.locator('#judge-title')).toContainText('New York');
  await page.getByRole('button', { name: 'Compare with Qloo evidence removed' }).click();
  await expect(page.locator('.judge-evidence-comparison')).toContainText('MATCHED EVIDENCE TEST');
  await page.locator('#judge-budget').fill('10000');
  await page.getByRole('button', { name: 'Recalculate and check' }).click();
  const comparison = page.locator('.judge-evidence-comparison');
  await expect(comparison).toContainText('COMBINED-CHANGE REPLAY');
  await expect(comparison).toContainText('Evidence and booking inputs changed');
  await expect(comparison).toContainText('The bill difference cannot be attributed to Qloo evidence alone.');
  await expect(comparison).not.toContainText('MATCHED EVIDENCE TEST');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('anonymous visitor can follow the homepage challenge through proof and limits', async ({ page }) => {
  await page.goto(`${origin}/index.html`);
  await page.getByRole('link', { name: /Try the booking challenge/ }).click();
  await expect(page).toHaveURL(new RegExp(`/desk\\.html#${tracedCaseId}$`));
  await expect(page.locator('#judge-title')).toContainText('New York');
  await page.getByRole('button', { name: 'Cut budget below this bill’s cost' }).click();
  await expect(page.locator('#judge-result h3')).toHaveText('Michael Kiwanuka + Jordan Rakei');
  await expect(page.locator('#judge-status')).toContainText('Experiment complete');
  await page.locator('#judge-proof-link').click();
  await expect(page).toHaveURL(new RegExp(`/proof-lab\\.html#${tracedCaseId}$`));
  await expect(page.locator('.proof-headline')).toContainText('Michael Kiwanuka + Sault');
  await page.getByRole('link', { name: 'Evidence & limits' }).first().click();
  await expect(page).toHaveURL(/\/evidence\.html$/);
  await expect(page.locator('#review-status')).toContainText('0 completed reviewers');
  await expect(page.locator('#agent-trace-status')).toContainText(`1 of ${seededCaseCount} public cases have a complete saved application-event sequence`);
  await expect(page.locator('#agent-trace-link')).toBeVisible();
});

test('genuine agent run exposes recorded plan, ordered tool events, and matched Qloo decision proof', async ({ page }) => {
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);await openDeeper(page);
  await expect(page.locator('#judge-title')).toContainText('recorded Qloo research run');
  await expect(page.locator('#judge-qloo-preview')).toContainText('The choice changes under matched assumptions.');
  await expect(page.locator('.judge-trace-summary')).toContainText('31 recorded events · 18/18 receipts linked');
  await expect(page.locator('.agent-stage-list')).toContainText('Model-selected checks');
  await expect(page.locator('.agent-stage-list')).toContainText('Charlotte Day Wilson');
  await expect(page.locator('.agent-stage-list')).toContainText('Exact optimization found a feasible bill');
  await page.locator('.judge-trace-full summary').click();
  await expect(page.locator('.judge-trace-full .agent-trace-list li')).toHaveCount(31);
  await page.locator('.judge-trace-full').getByRole('button', { name: 'Receipt r1', exact: true }).click();
  const firstReceipt = page.locator('#judge-receipts details').filter({ has: page.locator('summary').getByText(/^r1 · describe · ok$/) });
  await expect(firstReceipt).toHaveAttribute('open', '');
  await expect(firstReceipt.locator('summary')).toBeFocused();
  await page.getByRole('button', { name: /Run the matched test and inspect receipts/ }).click();
  await expect(page.locator('.judge-evidence-comparison')).toContainText('MATCHED EVIDENCE TEST');
  await expect(page.locator('.judge-evidence-comparison')).toContainText('Jordan Rakei + Hiatus Kaiyote');
  await expect(page.locator('#judge-status')).toContainText('Experiment complete');
});

test('mobile judge workflow retains the previous result and recovers after a failed replay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  await expect(page.locator('#judge-result h3')).toHaveText('Michael Kiwanuka + Sault');
  await page.route(`**/api/judge/cases/${tracedCaseId}/experiment`, route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary test outage' }),
  }));
  await page.getByRole('button', { name: 'Cut budget below this bill’s cost' }).click();
  await expect(page.locator('#judge-status')).toContainText('The previous result is still displayed; no new experiment completed.');
  await expect(page.locator('#judge-result h3')).toHaveText('Michael Kiwanuka + Sault');
  await expect(page.getByRole('button', { name: 'Cut budget below this bill’s cost' })).toBeEnabled();
  await page.unroute(`**/api/judge/cases/${tracedCaseId}/experiment`);
  await page.getByRole('button', { name: 'Cut budget below this bill’s cost' }).click();
  await expect(page.locator('#judge-result h3')).toHaveText('Michael Kiwanuka + Jordan Rakei');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('anonymous core path has no page-level horizontal overflow on narrow phone and tablet', async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/index.html', `/desk.html#${tracedCaseId}`, `/proof-lab.html#${tracedCaseId}`, '/evidence.html']) {
      await page.goto(origin + path);
      if (path.startsWith('/desk.html')) await expect(page.locator('#judge-title')).toContainText('New York');
      if (path.startsWith('/proof-lab.html')) await expect(page.locator('#with-lineup')).toContainText('Michael Kiwanuka');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${path}`).toBe(true);
    }
  }
});

test('judge can withdraw one receipt, rehearse a cancellation, and cannot write private records', async ({ page }) => {
  await page.goto(`${origin}/desk.html#${caseId}`);
  await expect(page.locator('#judge-title')).toContainText('New York');
  await page.locator('.judge-guided-challenges summary').click();
  await page.getByRole('button', { name: 'Remove ranking evidence' }).click();
  await expect(page.locator('#judge-result')).toContainText('Evidence state: blocked');
  await page.getByRole('button', { name: 'Reset assumptions' }).click();
  await page.getByRole('button', { name: 'Rehearse a cancellation' }).click();
  await expect(page.locator('#judge-status')).toContainText('Experiment complete');
  await expect(page.locator('#judge-result')).toContainText('Survivors');
  for (const path of ['/api/judge/cases', '/api/experiments', '/api/financial/jobs']) {
    const response = await page.request.post(origin + path, { data: {} });
    expect(response.status(), `anonymous write to ${path}`).toBe(401);
  }
});

test('Proof Lab changes signal groups against the same recorded case', async ({ page }) => {
  await page.goto(`${origin}/proof-lab.html#${tracedCaseId}`);
  await expect(page.locator('#with-lineup')).toHaveText('Michael Kiwanuka + Sault');
  const without = await page.locator('#without-lineup').textContent();
  const controls = page.locator('#signal-controls input[type=checkbox]');
  await expect(controls).toHaveCount(4);
  for (let index = 0; index < 4; index++) await controls.nth(index).uncheck();
  await expect(page.locator('#signal-mask')).toContainText('0 OF 4 SIGNAL GROUPS RETAINED');
  await expect(page.locator('#signal-lineup')).toHaveText(without);
  await page.getByText('Inspect receipt-level counterfactuals').click();
  await expect(page.locator('#receipt-ablations tbody tr').first()).toBeVisible();
});

test('incomplete older case discloses missing agent events and insufficient ranking', async ({ page }) => {
  await page.goto(`${origin}/desk.html#5031a69f837e1c28ce045422`);await openDeeper(page);
  await expect(page.locator('#judge-title')).toContainText('Mumbai');
  await expect(page.locator('#judge-agent-trace')).toContainText('no saved model-step event log');
  await expect(page.locator('#judge-qloo-preview')).toContainText('Not comparable: Qloo ranked 4 of 5 candidates');
  await expect(page.locator('#judge-qloo-preview')).not.toContainText('The choice changes under matched assumptions.');
  await expect(page.locator('#judge-qloo-preview')).not.toContainText('The choice stays the same under matched assumptions.');
  await expect(page.locator('#judge-source')).toContainText('Receipts only; no agent event log');
});

test('Proof Lab ignores an older case response after a newer selection finishes', async ({ page }) => {
  await page.goto(`${origin}/proof-lab.html#${tracedCaseId}`);
  await expect(page.locator('#with-lineup')).toHaveText('Michael Kiwanuka + Sault');
  const olderId='934e002267e2db9ccdc1b5a9',newerId='5031a69f837e1c28ce045422';
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  await page.route(`**/api/experiments/public/${olderId}`,async route=>{
    await gate;await route.continue();
  });
  const requested=page.waitForRequest(`**/api/experiments/public/${olderId}`);
  await page.locator('#case-select').selectOption(olderId);await requested;
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#case-status')).toContainText('previous report remains displayed');
  await page.locator('#case-select').selectOption(newerId);
  await expect(page.locator('#case-status')).toContainText('Mumbai');
  const completed=page.waitForResponse(`**/api/experiments/public/${olderId}`);
  release();await completed;await page.waitForLoadState('networkidle');
  await expect(page.locator('#main')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('#case-select')).toHaveValue(newerId);
  await expect(page.locator('#case-status')).toContainText('Mumbai');
  expect(new URL(page.url()).hash).toBe(`#${newerId}`);
  const download=page.waitForEvent('download');await page.locator('#download').click();
  expect((await download).suggestedFilename()).toBe(`houselights-proof-${newerId}.json`);
});

test('Proof Lab restores the displayed brief after a failed case switch and permits retry', async ({ page }) => {
  await page.goto(`${origin}/proof-lab.html#${tracedCaseId}`);
  await expect(page.locator('#with-lineup')).toHaveText('Michael Kiwanuka + Sault');
  const nextId='934e002267e2db9ccdc1b5a9';
  await page.route(`**/api/experiments/public/${nextId}`,route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.locator('#case-select').selectOption(nextId);
  await expect(page.locator('#case-status')).toContainText('its brief is selected again');
  await expect(page.locator('#case-select')).toHaveValue(tracedCaseId);
  await expect(page.locator('#with-lineup')).toHaveText('Michael Kiwanuka + Sault');
  await expect(page.locator('#download')).toBeEnabled();
  expect(new URL(page.url()).hash).toBe(`#${tracedCaseId}`);
  await page.unroute(`**/api/experiments/public/${nextId}`);
  await page.locator('#case-select').selectOption(nextId);
  await expect(page.locator('#case-status')).toContainText('Berlin');
  await expect(page.locator('#case-select')).toHaveValue(nextId);
});

test('recorded case clearly limits the comparison and remains usable on desktop and phone', async ({ page }, testInfo) => {
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    await page.goto(`${origin}/desk.html#${tracedCaseId}`);
    await expect(page.locator('#judge-qloo-preview')).toContainText('No matched saved first-trial LLM-only control');
    await expect(page.locator('#judge-qloo-preview')).toContainText('cannot establish superiority');
    await page.screenshot({path:testInfo.outputPath(`recorded-judge-${width}.png`),fullPage:false});
    await page.getByRole('button',{name:/Run the matched test and inspect receipts/}).click();
    await expect(page.locator('.judge-evidence-comparison')).toContainText('MATCHED EVIDENCE TEST');
    await expect(page.locator('#judge-result')).toContainText('No saved first-trial LLM control');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

test('booking desk connects all signals to a matched local comparison without more research', async ({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  const lab=page.locator('#booking-signal-lab');
  await expect(lab.getByRole('button',{pressed:true})).toHaveCount(4);
  await expect(lab.locator('.booking-lab-active')).toContainText('Michael Kiwanuka + Sault');
  let experiments=0;
  page.on('request',request=>{if(request.url().endsWith('/experiment')||request.url().endsWith('/api/memo'))experiments++;});
  for(let index=0;index<4;index++)await lab.locator('[data-booking-signal]').nth(index).click();
  await expect(lab.locator('.booking-lab-active')).toContainText('Jordan Rakei + Hiatus Kaiyote');
  await expect(lab.locator('.booking-lineup-diff')).toContainText('Sault');
  await expect(lab).toContainText('Original saved budget, pool, fees and policy remain identical');
  expect(experiments).toBe(0);
  await lab.getByRole('button',{name:/Receipt/}).first().click();
  await expect(page.locator('#judge-receipts details[open]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('budget presets and promoter export reflect the exact completed simulator result', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  await expect(page.locator('#booking-budget-output')).toContainText('14,500');
  await page.getByRole('button',{name:'80%',exact:true}).click();
  await expect(page.locator('#judge-budget')).toHaveValue('11600');
  await expect(page.locator('#booking-decision-card')).toHaveAttribute('data-pending','true');
  const completed=page.waitForResponse(`**/api/judge/cases/${tracedCaseId}/experiment`);
  await page.getByRole('button',{name:'Recalculate and check'}).click();
  const output=await (await completed).json();
  await expect(page.locator('#judge-status')).toContainText('Experiment complete');
  await expect(page.locator('#booking-decision-card')).toHaveAttribute('data-pending','false');
  const ids=output.snapshot.memo.slate.selectedIds;
  for(const id of ids)await expect(page.locator('.booking-selected')).toContainText(output.snapshot.memo.items.find(row=>row.id===id).name);
  await expect(page.locator('#booking-signal-lab .booking-lab-active')).toContainText('Michael Kiwanuka + Sault');
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download promoter brief'}).click();
  const file=await downloaded,text=readFileSync(await file.path(),'utf8');
  expect(text).toContain('Artist budget: $11,600');
  expect(text).toContain('Illustrative booking terms');
  expect(text).toContain('No matched saved first-trial LLM-only control');
});

test('booking desk cancellation preserves survivors and zero budget stays explicitly infeasible', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  await expect(page.locator('[data-booking-cancel]')).toHaveCount(2);
  const completed=page.waitForResponse(`**/api/judge/cases/${tracedCaseId}/experiment`);
  await page.locator('[data-booking-cancel]').first().click();
  const output=await (await completed).json();
  expect(output.comparison.survivorsPreserved).toBe(true);
  await expect(page.locator('#judge-status')).toContainText('Experiment complete');
  await page.getByRole('button',{name:'Reset assumptions'}).click();
  await page.locator('#judge-budget').fill('0');
  await page.getByRole('button',{name:'Recalculate and check'}).click();
  await expect(page.locator('.booking-verdict')).toHaveText('NO FEASIBLE BOOKING');
  await expect(page.locator('.booking-empty')).toContainText('will not silently relax');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('failed signal loading offers a retry without breaking the booking simulator', async ({page})=>{
  await page.route(`**/api/experiments/public/${tracedCaseId}`,route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  await expect(page.locator('#booking-signal-lab')).toContainText('booking simulator and saved receipts remain available');
  await expect(page.locator('.booking-selected')).toContainText('Michael Kiwanuka');
  await page.unroute(`**/api/experiments/public/${tracedCaseId}`);
  await page.getByRole('button',{name:'Retry signal comparison'}).click();
  await expect(page.locator('[data-booking-signal]')).toHaveCount(4);
});

test('failed booking replay keeps the decision visibly pending and exports only completed inputs', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  await expect(page.locator('.booking-selected')).toContainText('Michael Kiwanuka');
  await page.route(`**/api/judge/cases/${tracedCaseId}/experiment`,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test outage'})}));
  await page.getByRole('button',{name:'70%',exact:true}).click();
  await page.getByRole('button',{name:'Recalculate and check'}).click();
  await expect(page.locator('#judge-status')).toContainText('no new experiment completed');
  await expect(page.locator('#booking-decision-card')).toHaveAttribute('data-pending','true');
  await expect(page.locator('#booking-budget-output')).toContainText('10,150');
  await expect(page.locator('#booking-pending')).toContainText('last completed decision');
  const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download promoter brief'}).click();
  const text=readFileSync(await (await pending).path(),'utf8');
  expect(text).toContain('UNAPPLIED INPUTS');expect(text).toContain('Artist budget: $14,500');
});

test('signal switches retain keyboard focus and expose their pressed state', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  const first=page.locator('[data-booking-signal="0"]');
  await expect(first).toHaveAttribute('aria-pressed','true');
  await first.focus();await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-pressed','false');await expect(first).toBeFocused();
  await page.keyboard.press('Space');await expect(first).toHaveAttribute('aria-pressed','true');
  await page.locator('.booking-path').getByRole('link',{name:/Withdraw Qloo evidence/}).click();
  await expect(page.locator('#step-withdraw')).toBeFocused();
  expect(new URL(page.url()).hash).toBe(`#${tracedCaseId}`);
});

test('separate later LLM replication retains all trials and makes the cheaper control visible', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  const study=page.locator('#booking-independent-study');
  await expect(study).toContainText('3 / 3 declared attempts retained');
  await expect(study).toContainText('Michael Kiwanuka + Jordan Rakei');
  await expect(study).toContainText('$3,500 cheaper');
  await expect(study).toContainText('does not replace the original run');
  await study.locator('summary').click();
  await expect(study.locator('tbody tr')).toHaveCount(3);
  await expect(study.locator('pre')).toContainText('responseDigest');
  expect(await study.textContent()).not.toMatch(/PRIVATE-|Bearer |requestId|responseId/);
  await page.setViewportSize({width:320,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('infeasible Paris brief preserves the missing evidence and supports an explicit budget increase', async ({page})=>{
  const row=seedManifest.cases.find(row=>row.snapshot.memo.input.city==='Paris');
  const catalog=await (await page.request.get(origin+'/api/judge/cases')).json();
  const selected=catalog.cases.find(item=>item.title===row.title);
  await page.goto(`${origin}/desk.html#${selected.id}`);
  await expect(page.locator('.booking-verdict')).toHaveText('NO FEASIBLE BOOKING');
  await expect(page.locator('.booking-decision-metrics')).toContainText('No selection');
  await expect(page.locator('#judge-tight-budget')).toBeDisabled();
  await page.getByRole('button',{name:'125%',exact:true}).click();
  await page.getByRole('button',{name:'Recalculate and check'}).click();
  await expect(page.locator('.booking-verdict')).toHaveText('FEASIBLE PLANNING OPTION');
  await expect(page.locator('#booking-decision-card')).toContainText('Evidence state: blocked');
  await expect(page.locator('#booking-signal-lab')).toContainText('not ticket demand');
});

test('Autopilot replays the recorded provider-backed run without new research and opens its receipts', async ({page})=>{
  const errors=[],autopilotPosts=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('/autopilot'))autopilotPosts.push(request.url());});
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);await openDeeper(page);
  const panel=page.locator('#booking-autopilot');
  await expect(panel.locator('.autopilot-banner')).toContainText('RECORDED PROVIDER-BACKED RUN');
  await expect(panel.locator('.autopilot-banner')).toContainText('This page made no new provider calls');
  await expect(panel.getByRole('button',{name:/Recorded live run/})).toHaveAttribute('aria-pressed','true');
  await expect(panel.getByRole('button',{name:/Run fresh research/})).toHaveAttribute('aria-pressed','false');
  await expect(panel.locator('#autopilot-fresh-note')).toContainText('up to 10 live Qloo calls');
  await expect(panel.locator('.autopilot-timeline')).toContainText('Does the audience ranking hold without the New York location signal?');
  await expect(panel.locator('.autopilot-vulnerabilities')).toContainText('Without the New York location signal');
  await expect(panel.locator('.autopilot-packet-head h4')).toHaveText('Michael Kiwanuka + Sault');
  await expect(panel.locator('.autopilot-verdict')).toContainText('did not change');
  await panel.locator('.autopilot-justification').getByRole('button',{name:'Receipt a3'}).click();
  await expect(panel.locator('#autopilot-receipt-a3')).toHaveAttribute('open','');
  await expect(panel.locator('#autopilot-receipt-a3 pre')).toContainText('"source": "qloo"');
  await panel.locator('.autopilot-justification').getByRole('button',{name:'Receipt r9'}).first().click();
  await expect(page.locator('#judge-receipts details[open]')).toHaveCount(1);
  const downloaded=page.waitForEvent('download');
  await panel.getByRole('button',{name:'Download packet (.md)'}).click();
  const text=readFileSync(await (await downloaded).path(),'utf8');
  expect(text).toContain('Recorded provider-backed run captured');
  expect(text).toContain('## 10. Next actions');
  expect(autopilotPosts).toEqual([]);
  expect(errors).toEqual([]);
});

test('Autopilot planning replay re-plans a changed budget with zero provider calls', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);await openDeeper(page);
  const panel=page.locator('#booking-autopilot');
  await expect(panel.locator('.autopilot-banner')).toContainText('RECORDED');
  await panel.locator('#autopilot-budget').fill('12150');
  const planned=page.waitForResponse(`**/api/judge/cases/${tracedCaseId}/autopilot`);
  await panel.getByRole('button',{name:'Re-plan at this budget'}).click();
  const body=await (await planned).json();
  expect(body.providerCalls).toBe(0);
  await expect(panel.locator('.autopilot-banner')).toContainText('PLANNING REPLAY');
  await expect(panel.locator('.autopilot-banner')).toContainText('Brief changed from the published case');
  await expect(panel.locator('.autopilot-packet-head h4')).toHaveText('Michael Kiwanuka + Jordan Rakei');
  await expect(panel.locator('.autopilot-queue')).toContainText('Research the agent would run next');
  await expect(panel.locator('.autopilot-skipped summary')).toContainText('Questions the agent chose not to research');
  await panel.getByRole('button',{name:/Recorded live run/}).click();
  await expect(panel.locator('.autopilot-packet-head h4')).toHaveText('Michael Kiwanuka + Sault');
});

test('Autopilot plans other briefs from saved evidence and stays usable on a phone', async ({page})=>{
  await page.setViewportSize({width:375,height:812});
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);await openDeeper(page);
  await expect(page.locator('#booking-autopilot .autopilot-banner')).toContainText('RECORDED');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#judge-case').selectOption({label:'Mumbai: why a comparison is unavailable'});
  await expect(page.locator('#judge-title')).toContainText('Mumbai');
  const panel=page.locator('#booking-autopilot');
  await expect(panel.locator('.autopilot-banner')).toContainText('PLANNING REPLAY');
  await expect(panel.getByRole('button',{name:/Recorded live run/})).toHaveCount(0);
  await expect(panel.locator('.autopilot-queue')).toContainText('Ranking');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('a cancellation card keeps an edited budget instead of resetting the experiment', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  await expect(page.locator('[data-booking-cancel]')).toHaveCount(2);
  await page.getByRole('button',{name:'90%',exact:true}).click();
  await expect(page.locator('#judge-budget')).toHaveValue('13050');
  const completed=page.waitForResponse(`**/api/judge/cases/${tracedCaseId}/experiment`);
  await page.locator('[data-booking-cancel]').nth(1).click();
  const request=(await completed).request(),body=JSON.parse(request.postData());
  expect(body.budget).toBe(13050);
  expect(body.cancelId).toBeTruthy();
  await expect(page.locator('#judge-budget')).toHaveValue('13050');
  await expect(page.locator('#judge-status')).toContainText('Experiment complete');
});

test('Autopilot 2.0 compares strategies on common scenarios and links the organizer example', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);await openDeeper(page);
  const panel=page.locator('#booking-autopilot');
  await expect(panel.locator('.autopilot-banner').first()).toContainText('RECORDED PROVIDER-BACKED RUN');
  const table=panel.locator('table.autopilot-compare').first();
  await expect(table.locator('caption')).toContainText('same');
  await expect(table.locator('tbody tr')).toHaveCount(await panel.locator('.autopilot-strategies article').count());
  await expect(panel.locator('.autopilot-steps')).toContainText('Needs your approval');
  await expect(panel.getByRole('link',{name:/See an organizer plan a brand-new event/})).toHaveAttribute('href','/workspace.html#example');
});

test('the recorded organizer session replays a new event without provider calls', async ({page})=>{
  const posts=[];page.on('request',request=>{if(request.method()!=='GET')posts.push(request.url());});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/workspace.html#example`);
  const example=page.locator('#workspace-example');
  await expect(example.locator('.autopilot-banner').first()).toContainText('RECORDED ORGANIZER SESSION');
  await expect(example).toContainText('Night Shift Soul Revue');
  await expect(example).toContainText('The organizer revises the brief');
  await expect(example.locator('.workspace-compare')).toContainText('The recommended bill changed.');
  await expect(example.locator('#example-run-1 .autopilot-packet-head h4')).not.toHaveText('');
  await expect(page.locator('#workspace-app')).toBeHidden();
  expect(posts).toEqual([]);expect(errors).toEqual([]);
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('an organizer unlocks the workspace and completes a new event end to end', async ({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/workspace.html`);
  await expect(page.locator('#workspace-gate')).toBeVisible();
  await page.getByLabel('Organizer token').fill('wrong-token-value');
  await page.getByRole('button',{name:'Unlock workspace'}).click();
  await expect(page.locator('#gate-error')).toContainText('not accepted');
  await page.getByLabel('Organizer token').fill('local-browser-regression-token-only-00000000');
  await page.getByRole('button',{name:'Unlock workspace'}).click();
  await expect(page.locator('#workspace-app')).toBeVisible();
  await expect(page.locator('#workspace-mode')).toContainText('SYNTHETIC QLOO MODE');
  await page.getByRole('button',{name:'Fill an example brief'}).click();
  await page.getByLabel('Event name').fill('Browser Test Night');
  await page.getByRole('button',{name:'Create event'}).click();
  await expect(page.locator('#ws-status')).toContainText('Event created');
  await expect(page.locator('#event-list')).toContainText('Browser Test Night');
  await page.getByRole('button',{name:'Research with Qloo'}).click();
  await expect(page.locator('#research-output')).toContainText('SYNTHETIC QLOO DATA',{timeout:30000});
  await page.getByLabel('Extra research').selectOption('4');
  await page.getByRole('button',{name:'Run Autopilot'}).click();
  await expect(page.locator('#decide-output .autopilot-packet-head h4')).not.toHaveText('',{timeout:30000});
  await expect(page.locator('#decide-output')).toContainText('SYNTHETIC QLOO DATA');
  await page.locator('#brief-form input[name="budget"]').fill('15000');
  await page.getByLabel('What changed?').fill('Budget cut');
  await page.getByRole('button',{name:'Save as revision 2'}).click();
  await expect(page.locator('#ws-status')).toContainText('Saved revision 2');
  await page.getByLabel('Extra research').selectOption('0');
  await page.getByRole('button',{name:'Run Autopilot'}).click();
  await expect(page.locator('#decide-output')).toContainText('PLANNED FROM SAVED EVIDENCE · REVISION 2',{timeout:30000});
  await page.locator('[data-compare]').nth(0).check();await page.locator('[data-compare]').nth(1).check();
  await page.getByRole('button',{name:'Compare the two selected runs'}).click();
  await expect(page.locator('#compare-output')).toContainText('Artist budget: 22000 → 15000');
  const downloaded=page.waitForEvent('download');
  await page.locator('#decide-output').getByRole('button',{name:'Download printable packet (.html)'}).click();
  const file=readFileSync(await (await downloaded).path(),'utf8');
  expect(file).toContain('Browser Test Night');expect(file).toContain('Requires human approval');
  expect(errors).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('partial organizer research is shown as partial, with the incomplete calls named', async ({page})=>{
  // Mock Qloo never returns incomplete answers, so the research response is
  // rewritten to the outcome a timeout plus a partial Qloo answer produces.
  await page.route('**/api/events/*/research', async route=>{
    const response=await route.fetch(),body=await response.json();
    body.research={...body.research,status:'partial',incompleteCalls:[{id:'r11',tool:'rank',status:'error',error:'TIMEOUT'},{id:'r12',tool:'where_popular',status:'partial',error:null}]};
    await route.fulfill({response,json:body});
  });
  await page.goto(`${origin}/workspace.html`);
  await page.getByLabel('Organizer token').fill('local-browser-regression-token-only-00000000');
  await page.getByRole('button',{name:'Unlock workspace'}).click();
  await page.getByRole('button',{name:'Fill an example brief'}).click();
  await page.getByLabel('Event name').fill('Partial Research Night');
  await page.getByRole('button',{name:'Create event'}).click();
  await expect(page.locator('#ws-status')).toContainText('Event created');
  await page.getByRole('button',{name:'Research with Qloo'}).click();
  const warning=page.locator('#research-output .workspace-warning[role=alert]').first();
  await expect(warning).toContainText('Partial research: 2 Qloo call(s) did not return complete evidence (TIMEOUT, partial answer)',{timeout:30000});
  await expect(warning).toContainText('decisions on it are provisional');
  await expect(page.locator('#ws-status')).toContainText('Research partial');
  await expect(page.locator('#ws-status')).not.toContainText('Research complete');
  await expect(page.getByRole('button',{name:'Run Autopilot'})).toBeEnabled();
});

test('workspace and desk controls all have accessible names and headings stay in order', async ({page})=>{
  const audit=()=>page.evaluate(()=>{
    const unnamed=[...document.querySelectorAll('input:not([type=hidden]),select,textarea,button,a[href]')].filter(el=>el.offsetParent!==null).filter(el=>{
      const label=el.labels?.length?[...el.labels].map(l=>l.textContent).join(''):'';
      return !(el.getAttribute('aria-label')||label.trim()||(el.tagName!=='INPUT'&&el.tagName!=='SELECT'&&el.tagName!=='TEXTAREA'&&el.textContent.trim())||el.getAttribute('title'));
    }).map(el=>el.outerHTML.slice(0,80));
    const levels=[...document.querySelectorAll('h1,h2,h3,h4')].filter(el=>el.offsetParent!==null).map(el=>Number(el.tagName[1]));
    const skips=levels.filter((level,index)=>index&&level>levels[index-1]+1).length;
    return {unnamed,h1:levels.filter(level=>level===1).length,skips};
  });
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);await openDeeper(page);
  await expect(page.locator('#booking-autopilot .autopilot-banner').first()).toBeVisible();
  const desk=await audit();expect(desk.unnamed).toEqual([]);expect(desk.h1).toBe(1);
  await page.goto(`${origin}/workspace.html`);
  await page.getByLabel('Organizer token').fill('local-browser-regression-token-only-00000000');
  await page.getByRole('button',{name:'Unlock workspace'}).click();
  await expect(page.locator('#workspace-app')).toBeVisible();
  const workspace=await audit();expect(workspace.unnamed).toEqual([]);expect(workspace.h1).toBe(1);expect(workspace.skips).toBe(0);
  await page.goto(`${origin}/workspace.html#example`);
  await expect(page.locator('#example-run-1 .autopilot-packet-head h4')).not.toHaveText('');
  const example=await audit();expect(example.unnamed).toEqual([]);expect(example.h1).toBe(1);
});

test('shock study headlines report the like-for-like solvable rate, never the pooled 9.7%', async ({page})=>{
  await page.goto(`${origin}/desk.html#${tracedCaseId}`);
  await page.locator('.judge-shock-study summary').click();
  const teaser=page.locator('#judge-shock-teaser');
  await expect(teaser.locator('strong')).toHaveText('3/231');
  await expect(teaser).toContainText('because the prompt required a bill');
  await expect(teaser).not.toContainText('9.7');
  await page.goto(`${origin}/evidence.html`);
  await expect(page.locator('#shock-headline')).toContainText('On 77 solvable shocks, 3/231 re-prompted LLM responses (1.3%)');
  await expect(page.locator('#shock-stats')).toContainText('Briefs without a comparable Qloo ranking');
  await expect(page.locator('#shock-rows')).toContainText('not comparable (incomplete Qloo ranking)');
  await expect(page.locator('body')).not.toContainText('9.7%');
});

const PUBLIC_PAGES=['/home.html','/judge.html','/brief.html?plan=8be4d03ef4792ca9f1466983','/desk.html','/evidence.html','/proof-lab.html','/workspace.html#example','/demand.html','/financial.html','/review.html','/index.html','/no-such-page'];

test('every page passes axe WCAG 2.1 AA with no serious or critical issues, at desktop and phone width', async ({ page }) => {
  test.setTimeout(240000);
  // Check settled colours: a fade or shimmer caught mid-animation is not a contrast failure.
  await page.emulateMedia({reducedMotion:'reduce'});
  const failures=[];
  for(const path of PUBLIC_PAGES)for(const width of [1280,375]){
    await page.setViewportSize({width,height:900});
    await page.goto(`${origin}${path}`,{waitUntil:'networkidle'});
    const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa']).analyze();
    for(const v of results.violations.filter(v=>['serious','critical'].includes(v.impact)))failures.push(`${path} @${width}: ${v.id} (${v.nodes.length}) ${v.nodes[0].target.join(' ')}`);
    if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))failures.push(`${path} @${width}: horizontal overflow`);
  }
  expect(failures).toEqual([]);
});

test('no page logs a console error or uncaught exception on load', async ({ page }) => {
  test.setTimeout(120000);
  const errors=[];
  page.on('console',message=>{if(message.type()==='error')errors.push(`${page.url()}: ${message.text().slice(0,160)}`);});
  page.on('pageerror',error=>errors.push(`${page.url()}: ${error.message}`));
  for(const path of PUBLIC_PAGES.filter(path=>path!=='/no-such-page')){await page.goto(`${origin}${path}`,{waitUntil:'networkidle'});await page.waitForTimeout(400);}
  expect(errors).toEqual([]);
});

test('with the API down, the four-step path still works from recorded JSON', { tag: '@cross-browser' }, async ({ page }) => {
  await page.route('**/api/**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Service unavailable'})}));
  await page.goto(`${origin}/desk.html`);
  await expect(page.locator('#first-screen-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
  await page.getByRole('switch',{name:/Qloo evidence/}).click();
  await expect(page.locator('#fs-diff')).toContainText('−$4,500');
  await expect(page.locator('#decision-glance .glance-book strong')).toHaveText('Michael Kiwanuka + Sault');
  await page.locator('#step-receipt-body [data-entity="Sault"]').click();
  await expect(page.locator('#receipt-drawer .integrity-ok')).toContainText('Integrity check passed');
  await expect(page.locator('body')).not.toContainText('{"error"');
});

// Visual regression at the key states. Baselines live next to this spec, per browser and
// platform (Windows and Linux); the footer release hash differs between builds and is masked.
test('readable text and contained layout across organizer pages on desktop and phone', async ({page},testInfo)=>{
  test.setTimeout(90000);
  for(const width of [1366,390]){
    await page.setViewportSize({width,height:900});
    for(const path of ['index.html','judge.html','desk.html','proof-lab.html','evidence.html','demand.html','financial.html','workspace.html']){
      const response=await page.goto(`${origin}/${path}`);
      expect(response.status(),`${path} must be served`).toBe(200);
      if(path==='workspace.html'){
        await page.getByLabel('Organizer token').fill('local-browser-regression-token-only-00000000');
        await page.getByRole('button',{name:'Unlock workspace'}).click();
        await expect(page.locator('#workspace-app')).toBeVisible();
      }
      await page.evaluate(async()=>{await document.fonts.ready;});
      const small=await page.evaluate(()=>{
        const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),rows=[];
        while(walker.nextNode()){
          const node=walker.currentNode,parent=node.parentElement;
          if(!node.textContent.trim()||!parent||parent.closest('script,style,[aria-hidden="true"],.sr-only,[hidden]'))continue;
          const style=getComputedStyle(parent),range=document.createRange();range.selectNodeContents(node);
          if(![...range.getClientRects()].some(rect=>rect.width&&rect.height)||style.visibility==='hidden'||parent.checkVisibility&&!parent.checkVisibility({opacityProperty:true,visibilityProperty:true}))continue;
          if(parseFloat(style.fontSize)<11.99)rows.push({text:node.textContent.trim().slice(0,65),size:style.fontSize,tag:parent.tagName,className:parent.getAttribute('class')});
        }
        return rows;
      });
      if(path==='index.html'){
        await page.screenshot({path:testInfo.outputPath(`organizer-font-${width}.png`),fullPage:true});
        if(width===390){
          expect((await page.locator('#budget').boundingBox()).width).toBeGreaterThanOrEqual(90);
          const endpoints=await page.locator('.risk-label .range-ends > span').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right};}));
          expect(endpoints[0].right).toBeLessThanOrEqual(endpoints[1].left);
        }
      }
      if(path==='judge.html'){
        await page.locator('.tk-band-1').waitFor();
        const head=await page.locator('.tk-head').boundingBox(),band=await page.locator('.tk-band-1').boundingBox();
        expect(head.y+head.height,'ticket header must not cover the bill band').toBeLessThanOrEqual(band.y);
        expect(await page.locator('.tk-stats dt').evaluateAll(nodes=>nodes.every(node=>node.scrollWidth<=node.clientWidth+1)),'ticket statistic labels must fit their columns').toBe(true);
        expect(await page.locator('.tk-band').evaluateAll(nodes=>nodes.every(node=>node.scrollHeight<=node.clientHeight+1)),'ticket bands must fit without hidden lines').toBe(true);
        await page.locator('#plan-result').screenshot({path:testInfo.outputPath(`booking-font-${width}.png`)});
        await page.locator('.ticket-art').screenshot({path:testInfo.outputPath(`ticket-font-${width}.png`)});
      }
      expect(small,`${path} at ${width}px`).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${path} overflow at ${width}px`).toBe(true);
    }
  }
});

test.describe('visual states', { tag: '@visual' }, () => {
  test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });
  const mask = page => [page.locator('.site-release'), page.locator('.judge-status-strip')];
  test('first screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/desk.html`, { waitUntil: 'networkidle' });
    await expect(page.locator('#first-screen')).toHaveScreenshot('first-screen.png');
  });
  test('Qloo evidence off', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/desk.html`, { waitUntil: 'networkidle' });
    await page.getByRole('switch', { name: /Qloo evidence/ }).click();
    await expect(page.locator('#first-screen')).toHaveScreenshot('qloo-off.png');
  });
  test('near-tie', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/desk.html`, { waitUntil: 'networkidle' });
    await expect(page.locator('figure.near-tie')).toHaveScreenshot('near-tie.png');
  });
  test('receipt drawer', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${origin}/desk.html`, { waitUntil: 'networkidle' });
    await page.locator('#step-receipt-body [data-entity="Sault"]').click();
    await expect(page.locator('#receipt-drawer .integrity-ok')).toBeVisible();
    await expect(page.locator('#receipt-drawer')).toHaveScreenshot('receipt-drawer.png');
  });
  test('mobile first screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/desk.html`, { waitUntil: 'networkidle' });
    await expect(page).toHaveScreenshot('mobile-first-screen.png', { mask: mask(page) });
  });
});

test('the landing page shows the real plan and leads into the Booking Desk', { tag: '@cross-browser' }, async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/home.html`);
  await expect(page.locator('#hero-title')).toContainText('Book the bill');
  await expect(page.locator('.fan-card')).toHaveCount(7);
  await expect(page.locator('#plan-form')).toHaveCount(0);
  await expect(page.locator('[data-fan="bill"]')).toHaveText('Michael Kiwanuka + Sault');
  await expect(page.locator('[data-fan="fee"]')).toHaveText('$13,500');
  await expect(page.locator('[data-fan="off-bill"]')).toHaveText('Jordan Rakei + Hiatus Kaiyote');
  await expect(page.locator('[data-fan="off-fee"]')).toHaveText('$9,000 · a different bill');
  await expect(page.locator('[data-pipe="candidates"]')).toHaveAttribute('data-value', '8');
  await expect(page.locator('.pipeline-track .tl-step')).toHaveCount(4);
  await expect(page.locator('.qa')).toHaveCount(6);
  await expect(page.locator('.site-footer')).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.hero-cta').first().click();
  await expect(page).toHaveURL(/\/judge\.html/);
  await expect(page.locator('#plan-form')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Plan a show in under a minute.');
  await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
  await expect(page.locator('#hero-title')).toHaveCount(0);
  await page.locator('.site-brand').click();
  await expect(page.locator('#hero-title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('links shared before the split still open the right plan', async ({ page }) => {
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
  await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
  await page.goto(`${origin}/judge.html#planner`);
  await expect(page.locator('#plan-city')).toBeVisible();
  await page.goto(`${origin}/judge.html#plan-result`);
  await expect(page.locator('#result-title')).toBeVisible();
  await page.fill('#plan-city', 'Leeds');
  await page.fill('#plan-anchor', 'Arlo Parks');
  await page.locator('#plan-submit').click();
  await expect(page.locator('.result-meta')).toContainText('Leeds', { timeout: 30000 });
  await expect(page).toHaveURL(/\?plan=[a-f0-9]{24}/);
  const shared = page.url();
  await page.goto(shared);
  await expect(page.locator('.result-meta')).toContainText('Leeds');
});

test('a real plan leads to Financial Risk on that same plan; a synthetic one does not', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(`${origin}/judge.html`);
  const next = page.locator('.plan-next .hero-cta');
  await expect(next).toHaveText(/Run the finances/);
  await expect(next).toHaveAttribute('href', `/financial.html?plan=${tracedCaseId}`);
  await next.click();
  await expect(page.locator('#plan-case')).toHaveValue(tracedCaseId);
  await expect(page.locator('#plan-run-status')).toHaveText(/^Done: New York/, { timeout: 150000 });
  await page.goto(`${origin}/judge.html`);
  await page.fill('#plan-city', 'York');
  await page.fill('#plan-anchor', 'Arlo Parks');
  await page.locator('#plan-submit').click();
  await expect(page.locator('.result-meta')).toContainText('York', { timeout: 30000 });
  await expect(page.locator('.plan-next')).toHaveCount(0);
});

test('Why this bill states only saved facts, and each citation opens its receipt', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto(`${origin}/judge.html`);
  const why = page.locator('#why');
  await expect(why.locator('h3')).toHaveText('Why this bill');
  await expect(why).toContainText('Michael Kiwanuka ranks 1 of 8 for fans of Leon Bridges in New York.');
  await expect(why).toContainText('Of 28 possible bills, 8 fit every rule, and this one scores highest at $13,500.');
  await expect(why).toContainText('Sault is a coin flip with Jordan Rakei');
  await expect(why.locator('.why-call')).toContainText('Good call, with a watch-out');
  await expect(why.locator('.why-call')).toContainText('Holds in 80% of fee scenarios');
  await why.scrollIntoViewIfNeeded();
  await expect(why.locator('.why-line').first()).toHaveCSS('opacity', '1', { timeout: 5000 });
  await why.locator('.cite').first().click();
  await expect(page.locator('#receipt-body tr.is-highlight')).toContainText('Michael Kiwanuka');
  await page.locator('#receipt-close').click();
  // Alternatives are real bills from the checks, and trying one rebooks through the optimizer.
  await expect(page.locator('#why-drawer')).toBeHidden();
  await page.locator('#why-toggle').click();
  await expect(page.locator('#why-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#why-drawer')).toContainText('Michael Kiwanuka + Jordan Rakei');
  await expect(page.locator('#why-drawer')).toContainText('Wins 20% of fee scenarios');
  await page.locator('#why-drawer').getByRole('button', { name: 'Try it' }).first().click();
  await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Jordan Rakei for $10,000.');
  const diff = page.locator('.act-diff');
  await expect(diff.locator('.diff-title')).toHaveText('What changed from the original bill');
  await expect(diff.locator('li.is-out')).toContainText('Sault');
  await expect(diff.locator('li.is-in')).toContainText('Jordan Rakei');
  await expect(diff.locator('li.is-same')).toContainText('Michael Kiwanuka');
  await expect(diff.locator('.diff-total')).toContainText('−$3,500');
});

test('the bill difference shows what Qloo changes, and Why this bill steps aside with Qloo off', async ({ page }) => {
  await page.goto(`${origin}/judge.html`);
  const diff = page.locator('.act-diff');
  await expect(diff.locator('.diff-title')).toHaveText('What Qloo changes in the bill');
  await expect(diff.locator('li.is-out')).toHaveCount(2);
  await expect(diff.locator('li.is-in')).toHaveCount(2);
  await expect(diff.locator('.diff-total')).toContainText('$13,500 → $9,000');
  await page.locator('#plan-switch').click();
  await expect(page.locator('#result-title')).toContainText('Jordan Rakei + Hiatus Kaiyote');
  await expect(page.locator('#why')).toHaveCount(0);
  await expect(diff.locator('.diff-title')).toHaveText('What Qloo changes in the bill');
});

test('a call in the agent card opens to what Qloo returned', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto(`${origin}/judge.html`);
  await expect(page.locator('#agent-trace .agent-call-open').first()).toBeAttached({ timeout: 30000 });
  await expect(page.locator('#agent-trace .agent-replay')).toBeVisible({ timeout: 30000 });
  const rank = page.locator('#agent-trace .agent-call').filter({ hasText: 'Rank for this audience' });
  await page.locator('#agent-trace .agent-stage[data-stage="2"] .agent-stage-head').click();
  const open = rank.locator('.agent-call-open');
  await open.click();
  await expect(open).toHaveAttribute('aria-expanded', 'true');
  await expect(rank.locator('.agent-detail')).toContainText('Michael Kiwanuka');
  await expect(rank.locator('.agent-detail')).toContainText('0.977');
  await open.click();
  await expect(rank.locator('.agent-detail')).toBeHidden();
});

test('changing currency moves an untouched budget, and keeps one the visitor typed', async ({ page }) => {
  await page.goto(`${origin}/judge.html`);
  await page.selectOption('#plan-currency', 'INR');
  await expect(page.locator('#plan-budget')).toHaveValue('1900000');
  await page.selectOption('#plan-currency', 'USD');
  await expect(page.locator('#plan-budget')).toHaveValue('20000');
  await page.fill('#plan-budget', '31000');
  await page.selectOption('#plan-currency', 'EUR');
  await expect(page.locator('#plan-budget')).toHaveValue('31000');
});

test('a visitor can use the Demand Lab and the event portfolio from a saved plan, with no token or ID', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto(`${origin}/demand.html`);
  await expect(page.locator('#plan-status')).toContainText('Loaded');
  await expect(page.locator('input[name=save]')).toBeHidden();
  await expect(page.locator('#token')).toBeHidden();
  await page.locator('#run-plan').click();
  await expect(page.locator('#result-summary')).toContainText('feasible');
  await page.goto(`${origin}/index.html`);
  await page.getByRole('button', { name: /Event portfolio/ }).first().click();
  await page.locator('#portfolio-rehearsal').click();
  await expect(page.locator('#portfolio-status')).toContainText('real saved plan');
  await expect(page.locator('#portfolio-events [data-field=name]').first()).not.toHaveValue(/Illustrative/);
  await page.locator('#portfolio-run').click();
  await expect(page.locator('#portfolio-status')).not.toHaveText('Working…');
});

test('the planning tools fit a phone, before and after a run', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await page.goto(`${origin}/demand.html`);
  await expect(page.locator('#run-plan')).toBeEnabled();
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.locator('#run-plan').click();
  await expect(page.locator('#result-summary')).toContainText('feasible');
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.goto(`${origin}/index.html`);
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('a visitor can run the Festival GM on a saved plan', { tag: '@cross-browser' }, async ({ page }) => {
  const refused = [];
  page.on('response', response => { if (response.status() === 401) refused.push(response.url()); });
  await page.goto(`${origin}/index.html`);
  await page.getByRole('button', { name: /Festival GM/ }).first().click();
  const plan = await page.locator('#gm-examples option[value^="case:"]').first().getAttribute('value');
  await page.selectOption('#gm-examples', plan);
  await expect(page.locator('#gm-run')).toBeEnabled();
  await page.locator('#gm-run').click();
  await expect(page).toHaveURL(/\/m\//, { timeout: 60000 });
  expect(refused).toEqual([]);
});

test('a dropped act can be replaced by a fresh Qloo search, leaving the plan unchanged', { tag: '@cross-browser' }, async ({ page }) => {
  await page.goto(`${origin}/judge.html`);
  await page.getByRole('button', { name: 'Drop Sault and rebook' }).click();
  const replan = page.locator('#replan');
  await expect(replan.locator('h3')).toHaveText('Sault can’t play');
  await replan.getByRole('button', { name: 'Find a replacement with Qloo' }).click();
  await expect(replan.locator('.replan-acts li').first()).toBeVisible({ timeout: 20000 });
  await expect(replan.locator('.replan-acts')).toContainText('Michael Kiwanuka');
  await expect(replan.locator('.replan-acts')).not.toContainText('Sault');
  await expect(replan.locator('.solid-note')).toContainText('Synthetic development data');
  await replan.locator('.cite').first().click();
  await expect(page.locator('#receipt-body')).toContainText('What Qloo returned');
  await page.locator('#receipt-close').click();
  await page.locator('#plan-reset').click();
  await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
  await expect(page.locator('#replan')).toHaveCount(0);
});

test('the promoter brief prints the plan from its saved record', async ({ page }) => {
  await page.goto(`${origin}/judge.html`);
  await expect(page.locator('.plan-brief')).toHaveAttribute('href', `/brief.html?plan=${tracedCaseId}`);
  await page.locator('.plan-brief').click();
  await expect(page.locator('#brief-body h1')).toHaveText('Michael Kiwanuka + Sault');
  await expect(page.locator('#brief-body')).toContainText('$13,500 of a $14,500 artist budget');
  await expect(page.locator('#brief-body')).toContainText('Holds in 80% of 500 fee scenarios.');
  await expect(page.locator('#brief-body')).toContainText('Coin-flip pick: Sault.');
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#brief-print')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await page.goto(`${origin}/brief.html`);
  await expect(page.locator('#brief-body')).toContainText('not valid');
});

test('Financial Risk runs on a real Booking Desk plan, never on placeholder artists', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(`${origin}/financial.html`);
  await expect(page.locator('#plan-case option')).not.toHaveCount(0);
  await expect(page.locator('#plan-case')).toHaveValue(tracedCaseId);
  await expect(page.locator('#plan-run-status')).toHaveText(/^Done: New York: fans of Leon Bridges, 10,000 scenarios.$/, { timeout: 150000 });
  await expect(page.locator('#source-ribbon')).toContainText('REAL QLOO PLAN · New York');
  await expect(page.locator('#source-ribbon')).toContainText('not a sales forecast');
  const lineups = await page.locator('#alternatives tbody tr').allInnerTexts();
  expect(lineups.length).toBeGreaterThan(0);
  for (const row of lineups) expect(row).not.toMatch(/(Pop|Jazz|Indie|Electronic|Local) [A-Z]/);
  expect(lineups.join(' ')).toMatch(/Michael Kiwanuka|Sault|Jordan Rakei|Hiatus Kaiyote/);
  await expect(page.locator('#a-capacity')).not.toHaveValue('');
  expect((await page.request.get(`${origin}/financial-demo.json`)).status()).toBe(404);
});

test('a visitor can build a live slate in the Slate studio', async ({ page }) => {
  await page.goto(`${origin}/index.html`);
  await page.locator('#load-scenario').click();
  await page.locator('#build-button').click();
  await expect(page.locator('#results')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('#global-error')).toBeHidden();
  await expect(page.locator('#selected-cards')).not.toBeEmpty();
});

test('the evidence page lists every claim with its status, limit and a copyable reproduce command', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const table = JSON.parse(readFileSync(join(root, 'public', 'claims.json'), 'utf8'));
  await page.goto(`${origin}/evidence.html`);
  const rows = page.locator('#claim-table-body tbody tr');
  await expect(rows).toHaveCount(table.rows.length);
  await expect(rows.filter({ hasText: 'Blind reviews' })).toContainText('0 completed so far');
  await expect(rows.filter({ hasText: 'from following Houselights' })).toContainText('not measured');
  await expect(rows.first()).toContainText('ticket sales are not measured; fees are illustrative');
  await rows.first().getByRole('button', { name: /Copy command/ }).click();
  await expect(page.locator('#copy-status')).toHaveText(`Copied: ${table.rows[0].reproduce}`);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(table.rows[0].reproduce);
});

test.describe('Booking Desk: plan your show', () => {
  test('a provisional plan discloses missing affinity instead of confident booking or comparison claims @cross-browser', async ({page})=>{
    const id='ccccccccddddddddeeeeeeee';
    const items=['A','B','C'].map((name,index)=>({id:'synthetic-affinity-'+name,name:'Synthetic artist '+name,found:false,fit:null,rank:null,of:null,
      rankCoverage:{complete:false,returned:0,requested:3},terms:{fee:1000+index*100,available:true,genre:'Indie'},
      evidence:{rank:false,local:false,trends:false,comparison:false},evidenceReceipts:{},receipts:[],culturalLinks:[]}));
    const constraints={budget:5000,slots:2,discoveryMin:0,maxPerGenre:2,riskTolerance:50,lockedIds:[],excludedIds:[]};
    const snapshot={mock:true,receipts:[],memo:{currency:'USD',exampleBookingTerms:true,input:{city:'Synthetic city',anchors:['Synthetic anchor'],anchorIds:[]},items,constraints,slate:optimizeSlate(items,constraints)}};
    const proof=buildDecisionProof(snapshot),record={id,version:'1.0',title:'Synthetic incomplete-affinity browser fixture',live:true,createdAt:new Date().toISOString(),snapshot,proof,methods:judgeMethods(snapshot,proof),scoringVersion:'unavailable',feeBasis:'estimated-from-qloo-popularity',terms:'Synthetic verification fixture; fees are illustrative and availability is assumed.'};
    expect(snapshot.memo.slate.status).toBe('provisional');
    const database=new DatabaseSync(join(dataDir,'houselights.sqlite'));
    try{database.exec('PRAGMA busy_timeout=5000');database.prepare('INSERT INTO judge_cases(id,body) VALUES(?,?)').run(id,JSON.stringify(record));}finally{database.close();}
    for(const width of[1366,390]){
      await page.setViewportSize({width,height:900});await page.goto(`${origin}/judge.html?plan=${id}`);
      await expect(page.locator('#result-title')).toHaveText(/^Provisional:/);
      await expect(page.locator('.result-sub')).toContainText('affinity evidence is incomplete');
      await expect(page.locator('.result-badges')).toContainText('insufficient affinity evidence');
      await expect(page.locator('#plan-switch-note')).toContainText('Affinity comparison unavailable');
      await expect(page.locator('.act-others summary')).not.toContainText('Qloo ranked');
      await expect(page.locator('.result-why')).not.toContainText('weighs each act’s Qloo fit');
      await page.locator('#plan-switch').click();
      await expect(page.locator('#plan-switch')).toHaveAttribute('aria-checked','false');
      await expect(page.locator('#result-title')).toHaveText(/^Provisional:/);
      await expect(page.locator('#plan-switch-note')).not.toContainText('Qloo changes this decision');
      await expect(page.locator('#plan-switch-note')).not.toContainText('Here Qloo explains the choice');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      expect(await page.locator('.tk-body').evaluate(node=>node.scrollHeight<=node.clientHeight+1)).toBe(true);
    }
  });

  test('a saved non-USD brief shows its own currency and its bound ranking receipt @cross-browser', async ({ page }) => {
    const catalog=await (await page.request.get(`${origin}/api/judge/cases`)).json();
    const brief=catalog.cases.find(row=>row.title==='Manchester: compare all three methods');
    const record=await (await page.request.get(`${origin}/api/judge/cases/${brief.id}`)).json();
    const selected=record.snapshot.memo.items.find(item=>record.snapshot.memo.slate.selectedIds.includes(item.id));
    const bound=selected.evidenceReceipts.rank[0];
    expect(bound).not.toBe(record.snapshot.receipts.find(row=>row.tool==='rank').id);
    await page.goto(`${origin}/judge.html#${brief.id}`);
    await expect(page.locator('#result-title')).toContainText('£4,600');
    await expect(page.locator('.result-badges')).toContainText('Illustrative fees');
    await expect(page.locator('.result-badges')).toContainText('Assumed availability');
    const opener=page.locator('.act-grid [data-receipt]').first();
    await expect(opener).toHaveAttribute('data-receipt',bound);
    await opener.click();
    await expect(page.locator('#receipt-body')).toContainText(`Receipt${bound}`);
  });

  test('a slow earlier saved plan cannot replace the latest choice', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#result-title')).toContainText('Michael Kiwanuka');
    const catalog=await (await page.request.get(`${origin}/api/judge/cases`)).json();
    const earlier=catalog.cases.find(row=>row.title==='Manchester: compare all three methods');
    const latest=catalog.cases.find(row=>row.title==='Berlin: compare all three methods');
    let release,started;const gate=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{started=resolve;});
    await page.route(`**/api/judge/cases/${earlier.id}`,async route=>{started();await gate;await route.continue();});
    try {
      await page.locator(`[data-case="${earlier.id}"]`).click();await requested;
      await page.locator(`[data-case="${latest.id}"]`).click();
      await expect(page.locator('.result-meta')).toContainText('Berlin');
      const lateResponse=page.waitForResponse(response=>response.url().endsWith(`/api/judge/cases/${earlier.id}`));
      release();await lateResponse;await page.waitForTimeout(200);
      await expect(page.locator('.result-meta')).toContainText('Berlin');
      await expect(page).toHaveURL(new RegExp(`${latest.id}$`));
    } finally {release();}
  });

  test('a delayed budget calculation cannot replace a newer infeasible result', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#plan-switch-note')).toContainText('Qloo changes this decision');
    let release,started;const gate=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{started=resolve;});
    await page.route('**/experiment',async route=>{
      if(route.request().postDataJSON()?.budget===13050){started();await gate;}
      await route.continue();
    });
    try {
      await page.locator('[data-budget="13050"]').click();await requested;
      await page.locator('#plan-budget-range').evaluate(node=>{node.value='5800';node.dispatchEvent(new Event('input',{bubbles:true}));});
      await expect(page.locator('#result-title')).toHaveText('No bill fits these rules.');
      const completed=page.waitForResponse(response=>response.url().endsWith('/experiment')&&response.request().postDataJSON()?.budget===13050);
      release();await completed;await page.waitForTimeout(200);
      await expect(page.locator('#result-title')).toHaveText('No bill fits these rules.');
      await expect(page.locator('#plan-budget-range')).toHaveValue('5800');
      await expect(page.locator('#plan-result')).toHaveAttribute('aria-busy','false');
    } finally {release();}
  });

  test('an expired visitor link gives a safe, recoverable error on mobile @cross-browser', async ({ page }) => {
    const id='aabbccddeeffaabbccddeeff',database=new DatabaseSync(join(dataDir,'houselights.sqlite'));
    try {
      database.exec('PRAGMA busy_timeout=5000');
      database.prepare('INSERT INTO judge_cases(id,body) VALUES(?,?)').run(id,JSON.stringify({id,live:true,createdAt:new Date(Date.now()-8*864e5).toISOString(),snapshot:{marker:'retired payload'}}));
    } finally {database.close();}
    await page.setViewportSize({width:390,height:844});
    await page.goto(`${origin}/judge.html?plan=${id}`);
    await expect(page.locator('#plan-result')).toContainText('Plan expired');
    await expect(page.locator('#plan-result')).toContainText('Open a saved example or start a new plan');
    await expect(page.locator('#plan-result')).not.toContainText('retired payload');
    const response=await page.request.get(`${origin}/api/judge/cases/${id}`);
    expect(response.status()).toBe(410);
    await page.locator('.plan-chip').first().click();
    await expect(page.locator('#result-title')).toContainText('Michael Kiwanuka');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });

  test('first view shows the featured decision and what Qloo changes @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
    await expect(page.locator('#plan-switch-note')).toContainText('Without Qloo evidence, the same rules select Jordan Rakei + Hiatus Kaiyote for $9,000');
    await expect(page.locator('.act-grid[aria-label="Selected acts"] .act-card')).toHaveCount(2);
    await expect(page.locator('.act-grid .act-status').first()).toHaveText('Selected');
    await expect(page.locator('#plan-form .plan-note')).toContainText('availability is assumed');
    await expect(page.locator('#plan-form .plan-note')).toContainText('at least two candidates');
    await expect(page.locator('.plan-chip')).not.toHaveCount(0);
    await expect(page.locator('.plan-chip').first()).toContainText('fans of Leon Bridges');
  });

  test('the Qloo switch changes the decision, keeps focus and announces it @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#plan-switch-note')).toContainText('Qloo changes this decision');
    await page.locator('#plan-switch').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#plan-switch')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#result-title')).toHaveText('Book Jordan Rakei + Hiatus Kaiyote for $9,000.');
    await expect(page.locator('#plan-switch')).toBeFocused();
    await expect(page.locator('#result-status')).toContainText('Qloo evidence off');
    await page.keyboard.press('Enter');
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
  });

  test('budget cuts and dropping an act re-run the optimizer and can be reset', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#result-title')).toContainText('Michael Kiwanuka + Sault');
    await page.getByRole('button', { name: '80%', exact: true }).click();
    await expect(page.locator('#result-status')).toContainText('Budget set to $11,600');
    await expect(page.locator('#result-title')).not.toContainText('$13,500');
    await page.locator('#plan-reset').click();
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
    await page.getByRole('button', { name: 'Drop Michael Kiwanuka and rebook' }).click();
    await expect(page.locator('#result-status')).toContainText('Michael Kiwanuka dropped');
    await expect(page.locator('#result-title')).not.toContainText('Michael Kiwanuka');
    await expect(page.locator('.act-card.is-dropped')).toContainText('Dropped');
  });

  test('a receipt shows what Qloo returned with the act highlighted, and returns focus @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    const opener = page.locator('.act-grid[aria-label="Selected acts"] [data-receipt]').nth(1);
    await opener.click();
    await expect(page.locator('#receipt-drawer')).toHaveAttribute('open', '');
    await expect(page.locator('#receipt-title')).toContainText('ranking of every candidate for Leon Bridges fans in New York');
    await expect(page.locator('#receipt-drawer tr.is-highlight')).toContainText(/sault/i);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });

  test('a live plan streams progress and lands on a shareable, honestly labelled plan @cross-browser', async ({ page }) => {
    // The app allows a live plan up to three minutes; on a shared CI runner WebKit can need
    // more than the default 30 seconds for the whole flow, so this test gets 60.
    test.setTimeout(60000);
    const errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
    page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/api/plan'))requests.push(request.postData());});
    const navigations=[];page.on('request',request=>{if(request.isNavigationRequest())navigations.push(request.url());});
    await page.addInitScript(()=>{
      window.__planInputEvents=[];let active=false;
      for(const type of ['pointerdown','mousedown','mouseup','click','submit'])document.addEventListener(type,event=>{
        const target=event.target instanceof Element?event.target:null;
        if(target?.closest('#plan-submit'))active=true;
        if(!active||window.__planInputEvents.length>=12)return;
        const rect=document.getElementById('plan-submit')?.getBoundingClientRect();
        const item={type,target:target?.id||target?.className||target?.tagName,x:event.clientX,y:event.clientY,scrollY,buttonY:rect?.y,buttonHeight:rect?.height,prevented:false};window.__planInputEvents.push(item);
        queueMicrotask(()=>{item.prevented=event.defaultPrevented;});
      },true);
    });
    await page.goto(`${origin}/judge.html`);
    await page.fill('#plan-city', 'Leeds');
    expect(await page.locator('#plan-form').evaluate(node=>{const s=getComputedStyle(node);return {transform:s.transform,filter:s.filter,opacity:s.opacity};})).toEqual({transform:'none',filter:'none',opacity:'1'});
    await page.fill('#plan-anchor', 'Arlo Parks');
    await page.fill('#plan-budget', '12000');
    await expect(page.locator('#agent-trace .agent-label-text')).toHaveText('Researched in 20.5s · 18 Qloo calls');
    await expect(page.locator('#agent-trace .agent-stage')).toHaveCount(7);
    await expect(page.locator('#agent-trace .agent-foot')).toContainText('shown without animation');
    // WebKit can finish a late font swap after the trace becomes visible. Keep the
    // real pointer press/release test, but start it after font geometry is available.
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.locator('#plan-submit').click({delay:120});
    expect(JSON.stringify(await page.evaluate(()=>window.__planInputEvents))).toContain('"type":"submit"');
    const pressScroll=await page.evaluate(()=>window.__planInputEvents.filter(event=>['pointerdown','mouseup'].includes(event.type)).map(event=>event.scrollY));
    expect(Math.max(...pressScroll)-Math.min(...pressScroll)).toBeLessThanOrEqual(1);
    await expect(page.locator('#plan-progress')).toBeVisible();
    await expect.poll(async()=>JSON.stringify({ready:/\?plan=[a-f0-9]{24}$/.test(page.url()),requests:requests.length,errors,navigations,events:await page.evaluate(()=>window.__planInputEvents),error:await page.locator('#plan-error').textContent(),button:await page.locator('#plan-submit').textContent()}),{timeout:50000}).toContain('"ready":true');
    await expect(page).toHaveURL(/\?plan=[a-f0-9]{24}$/);
    await expect(page.locator('#result-title')).toContainText('Book ');
    await expect(page.locator('.result-badges')).toContainText('Live plan');
    await expect(page.locator('.result-badges')).toContainText('Synthetic test data');
    await expect(page.locator('.result-badges')).toContainText('Estimated fees');
    await expect(page.locator('.result-badges')).toContainText('Genre limits not applied');
    await expect(page.locator('.result-terms')).toContainText('not a quote');
    await expect(page.locator('.result-terms')).toContainText('Genre limits are not applied');
    const shared = page.url();
    await page.goto(shared);
    await expect(page.locator('.result-meta')).toContainText('Leeds');
  });

  test('when the server refuses an experiment, the page says so and the switch stays put', async ({ page }) => {
    await page.route('**/experiment', route => route.fulfill({ status: 429, headers: { 'retry-after': '30', 'content-type': 'application/json' }, body: '{"error":"Experiment limit reached."}' }));
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#plan-switch-note')).toHaveText('The comparison without Qloo could not load just now. Use the switch to try again.');
    await page.locator('#plan-switch').click();
    await expect(page.locator('#result-status')).toContainText('Too many changes at once');
    await expect(page.locator('#plan-switch')).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
    await page.unroute('**/experiment');
    await page.locator('#plan-switch').click();
    await expect(page.locator('#plan-switch')).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('#plan-switch-note')).toContainText('Qloo changes this decision');
  });

  test('scoring metadata displays each generation and keeps unknown versions explicit', async ({ page }) => {
    const list=await (await page.request.get(`${origin}/api/judge/cases`)).json();
    const summary=list.cases.find(row=>row.title.startsWith('Manchester'));
    const record=await (await page.request.get(`${origin}/api/judge/cases/${summary.id}`)).json();
    // Only response presentation metadata is varied; no stored case or evidence is changed.
    for(const [version,label] of [['ordinal-rank','ordinal rank'],['min-max-affinity','min-max affinity'],['fixed-span-affinity','fixed-span affinity'],['unrecorded','version not recorded']]){
      await page.route(`**/api/judge/cases/${record.id}`,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...record,scoringVersion:version})}));
      await page.goto(`${origin}/judge.html?scoring-fixture=${encodeURIComponent(version)}#${record.id}`);
      await expect(page.locator('[data-scoring-version]')).toContainText(`Original scoring: ${label}`);
      await page.unroute(`**/api/judge/cases/${record.id}`);
    }
  });

  test('an incomplete live stream reports the interruption and keeps the form usable', async ({ page }) => {
    await page.route('**/api/plan',route=>route.fulfill({status:200,contentType:'text/event-stream',body:'data: {"type":"stage","text":"Resolve"}\n\n'}));
    await page.goto(`${origin}/judge.html`);
    await page.fill('#plan-city','Leeds');await page.fill('#plan-anchor','Arlo Parks');await page.fill('#plan-budget','12000');
    await page.locator('#plan-budget').press('Enter');
    await expect(page.locator('#plan-error')).toContainText('connection ended before a result was received');
    await expect(page.locator('#plan-error')).toContainText('may still finish on the server');
    await expect(page.locator('#plan-submit')).toBeEnabled();
    await expect(page.locator('#agent-trace')).toContainText('The live plan stopped');
    await expect(page).not.toHaveURL(/\?plan=/);
  });

  test('the agent card replays the saved Qloo run, folds each stage and stays expandable @cross-browser', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${origin}/judge.html`);
    await page.locator('#planner').scrollIntoViewIfNeeded();
    const card = page.locator('#agent-trace');
    await expect(card.locator('.agent-label-text')).toHaveText('Researched in 20.5s · 18 Qloo calls');
    await expect(card.locator('.agent-stage')).toHaveCount(7);
    const verify = card.locator('.agent-stage').filter({ hasText: 'Check where fans are' });
    await expect(verify.locator('.agent-stage-count')).toHaveText('8 calls');
    await verify.locator('.agent-stage-head').click();
    await expect(verify.locator('.agent-call')).toHaveCount(8);
    await expect(verify.locator('.agent-chip').first()).toHaveText('Charlotte Day Wilson');
    await expect(card.locator('.agent-foot')).toContainText('shown without animation');
    await page.emulateMedia({reducedMotion:'no-preference'});
    for(const field of ['#plan-city','#plan-anchor']){
      await card.getByRole('button',{name:'Replay',exact:true}).click();
      await expect(card.locator('.agent-label-text')).toContainText('Replaying the saved');
      await page.locator(field).fill('Leeds');
      await expect(card.locator('.agent-label-text')).toHaveText('Researched in 20.5s · 18 Qloo calls');
      await expect(card.locator('.agent-stage')).toHaveCount(7);
      await expect(card.locator('.agent-foot')).toContainText('shown without animation');
      await expect(card.locator('.agent-time')).toHaveText('20.5s');
    }
  });

  test('the plan says how solid the bill is and recomputes it with every change @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    const solid = page.locator('.solid');
    await expect(solid.getByRole('heading', { name: 'How solid is this bill?' })).toBeVisible();
    await expect(solid.locator('.solid-meter .solid-figure strong')).toHaveText('80%');
    await expect(solid.locator('.solid-meter')).toContainText('In 398 of 500 scenarios where every fee moves by up to ±20%');
    await expect(solid.locator('.solid-bar')).toHaveAttribute('aria-label', 'This bill 80%, Michael Kiwanuka + Jordan Rakei 20%');
    const kiwanuka = solid.locator('.flip-row').first();
    await expect(kiwanuka.locator('th')).toHaveText('Michael Kiwanuka');
    await expect(kiwanuka.locator('td').nth(1)).toHaveText('$7,500 +$1,000');
    await expect(kiwanuka.locator('td').nth(2)).toHaveText('Michael Kiwanuka + Jordan Rakei');
    // The one-line verdict names each finding and links to its card.
    const strip = solid.locator('.verdict-strip');
    await expect(strip).toContainText('Holds in 80% of fee scenarios');
    await expect(strip).toContainText('One coin-flip pick: Sault');
    await expect(strip).toContainText('Audience ranking decides it');
    await expect(strip).toContainText('Bill changes at $9,000 · $10,000 · $13,500');
    await strip.getByRole('link', { name: 'One coin-flip pick: Sault' }).click();
    await expect(page.locator('#solid-affinity')).toBeFocused();
    // Each booked act carries its own findings, and other candidates say what would bring them in.
    const sault = page.locator('.act-grid .act-card').filter({ hasText: 'Sault' });
    await expect(sault.locator('.act-insights')).toContainText('Coin flip with Jordan Rakei');
    await expect(sault.locator('.act-insights')).toContainText('Fee can rise $1,000');
    await expect(page.locator('.rank-entry').first()).toHaveText(/^(Enters at \$[\d,]+ or less\.|A lower fee would not bring it in\.)$/);
    await expect(solid.locator('[data-signal="rank"]')).toHaveClass(/is-decisive/);
    await expect(solid.locator('[data-signal="rank"] .signal-effect')).toHaveText('Without it: Sault + Jordan Rakei');
    await expect(solid.locator('[data-signal="trends"] .signal-effect')).toHaveText('Not gathered for this pool');
    // Qloo's affinities for Sault and Jordan Rakei differ by 0.0001, so that pick is a coin flip.
    await expect(solid.locator('.solid-affinity .sep').nth(0)).toContainText('Clear pick');
    await expect(solid.locator('.solid-affinity .sep').nth(1)).toContainText('Coin flip');
    await expect(solid.locator('.solid-affinity .sep').nth(1)).toContainText('otherwise Jordan Rakei (affinity 0.9580 vs 0.9579)');
    // The ladder lists every budget where the bill changes; choosing a step rebooks there.
    const steps = page.locator('.ladder-steps button');
    await expect(steps).toHaveCount(3);
    await expect(page.locator('.ladder-steps .is-current')).toContainText('Michael Kiwanuka + Sault');
    await steps.filter({ hasText: 'from $10,000' }).click();
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Jordan Rakei for $10,000.');
    await expect(page.locator('.ladder-steps .is-current')).toContainText('Michael Kiwanuka + Jordan Rakei');
    await page.locator('#plan-reset').click();
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
    await page.locator('[data-budget]').filter({ hasText: '90%' }).click();
    await expect(page.locator('#result-title')).not.toContainText('Sault');
    await expect(solid.locator('.solid-meter .solid-figure strong')).not.toHaveText('80%');
    await page.locator('#plan-switch').click();
    await expect(solid.locator('.solid-signals')).toContainText('Qloo evidence is off, so no signal shapes this bill.');
  });

  test('when no bill fits, the plan names the first budget that books one and goes there @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
    await page.locator('#plan-budget-range').fill('5800');
    await expect(page.locator('#result-title')).toHaveText('No bill fits these rules.');
    const none = page.locator('.solid-none');
    await expect(none.getByRole('heading', { name: 'Why no bill fits' })).toBeVisible();
    await expect(none.locator('.solid-first')).toContainText('costs $9,000, $3,200 over this budget. From $9,000 the optimizer books Jordan Rakei + Hiatus Kaiyote.');
    await none.getByRole('button', { name: 'Set budget to $9,000' }).click();
    await expect(page.locator('#result-title')).toHaveText('Book Jordan Rakei + Hiatus Kaiyote for $9,000.');
    await expect(page.locator('.solid-none')).toHaveCount(0);
    await expect(page.locator('.solid-meter')).toBeVisible();
  });

  test('a live plan with no bookable bill shows why the agent made no deep checks', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await page.fill('#plan-city', 'Leeds');
    await page.fill('#plan-anchor', 'Arlo Parks');
    await page.fill('#plan-budget', '1000');
    await page.locator('#plan-submit').click();
    await expect(page.locator('#result-title')).toHaveText('No bill fits these rules.', { timeout: 30000 });
    const trail = page.locator('.solid-none .solid-research');
    await expect(trail).toContainText('No check could make any bill fit this budget, so it made none and saved those Qloo calls.');
    await expect(trail.locator('.trail-tag').first()).toHaveText('Skipped');
    await expect(trail.locator('.trail small').first()).toHaveText('No possible result makes a bill fit');
    await expect(page.locator('.solid-first')).toContainText('The first bill that fits');
  });

  test('on a phone the analysis folds to headlines, and a summary link opens its card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/judge.html`);
    const affinity = page.locator('#solid-affinity');
    await expect(affinity.locator('.sep').first()).toBeHidden();
    await expect(affinity.locator('.solid-text')).toBeVisible();
    await page.locator('.verdict-strip').getByRole('link', { name: 'One coin-flip pick: Sault' }).click();
    await expect(affinity.locator('.sep').first()).toBeVisible();
    await expect(affinity.locator('.solid-more')).toHaveAttribute('aria-expanded', 'true');
    const fees = page.locator('#solid-fees');
    await fees.locator('.solid-more').click();
    await expect(fees.locator('.solid-bar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('the planner takes up to three artists and sends them together', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    const add = page.locator('#plan-anchor-add');
    await add.click();
    await expect(page.locator('#plan-anchor-2')).toBeFocused();
    await add.click();
    await expect(page.locator('#plan-anchor-3')).toBeFocused();
    await expect(add).toBeHidden();
    await page.getByRole('button', { name: 'Remove artist 2' }).click();
    await expect(add).toBeFocused();
    await expect(page.getByLabel('Artist 2 your audience loves')).toHaveCount(1);
    await page.fill('#plan-city', 'Leeds');
    await page.fill('#plan-anchor', 'Arlo Parks');
    await page.fill('#plan-anchor-2', 'Nilüfer Yanya');
    const sent = page.waitForRequest(request => request.url().endsWith('/api/plan'));
    await page.locator('#plan-submit').click();
    expect((await sent).postDataJSON().anchors).toEqual(['Arlo Parks', 'Nilüfer Yanya']);
    await expect(page.locator('#agent-caption')).toHaveText('Live run: Leeds, fans of Arlo Parks and Nilüfer Yanya');
    await expect(page.locator('.result-meta')).toContainText('fans of Arlo Parks, Nilüfer Yanya', { timeout: 30000 });
    await expect(page.locator('.solid-meter')).toBeVisible();
    await expect(page.locator('.solid-meter')).toContainText('each estimated fee moves across its Qloo popularity tier');
    // The saved run records how the agent spent its deep checks, act by act.
    const trail = page.locator('.solid-research');
    await expect(trail).toContainText('tried all 16 results a check could return');
    await expect(trail.locator('.trail')).not.toHaveCount(0);
    await expect(trail.locator('.trail-tag').first()).toHaveText(/Checked|Skipped|Not checked/);
    // The agent card explained the same choice while the run was in progress.
    await expect(page.locator('#agent-trace .agent-note')).toContainText('Value of information');
    // Acts verified because they were in the provisional bill are not described as booked.
    await expect(trail).toContainText('In the bill before checks');
    await expect(trail).not.toContainText('Booked');
  });

  test('a live plan streams its Qloo calls into the agent card', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await page.fill('#plan-city', 'Leeds');
    await page.fill('#plan-anchor', 'Arlo Parks');
    await page.locator('#plan-submit').click();
    await expect(page.locator('#agent-caption')).toHaveText('Live run: Leeds, fans of Arlo Parks');
    await expect(page.locator('#agent-trace .agent-label-text')).toHaveText(/^Planned with \d+ Qloo calls$/, { timeout: 30000 });
    await expect(page.locator('#agent-trace .agent-call').first()).toBeAttached();
    await expect(page.locator('.footer-links a').first()).toBeAttached();
  });

  test('invalid input is explained inline and nothing is sent', async ({ page }) => {
    let planned = false;
    page.on('request', request => { if (request.url().endsWith('/api/plan')) planned = true; });
    await page.goto(`${origin}/judge.html`);
    await page.fill('#plan-city', 'Leeds');
    await page.locator('#plan-submit').click();
    await expect(page.locator('#plan-error')).toHaveText('Enter an artist your audience loves.');
    await expect(page.locator('#plan-anchor')).toBeFocused();
    await expect(page.locator('#plan-anchor')).toHaveAttribute('aria-invalid', 'true');
    expect(planned).toBe(false);
  });

  test('on a phone the form comes first, nothing overflows, and other candidates fold away', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#result-title')).toContainText('Michael Kiwanuka');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.act-others')).not.toHaveAttribute('open', '');
    const small = await page.locator('#plan-form button, #plan-form input, #plan-result button').evaluateAll(nodes => nodes.filter(node => { const r = node.getBoundingClientRect(); return r.width && r.height && r.height < 40 && node.type !== 'radio'; }).length);
    expect(small).toBe(0);
  });

  test('Qloo maps the booked bill’s fans beyond music, once, with the act behind each lead', { tag: '@cross-browser' }, async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    const reach = page.locator('#reach');
    await expect(reach.locator('h3')).toHaveText('Who this bill reaches');
    await expect(reach).toContainText('What fans of Michael Kiwanuka + Sault like beyond music');
    const run = reach.getByRole('button', { name: /Map this crowd with Qloo/ });
    if (await run.count()) {
      const sent = page.waitForRequest(request => request.url().endsWith(`/api/judge/cases/${tracedCaseId}/reach`) && request.method() === 'POST');
      await run.click();
      await sent;
      await expect(page.locator('#reach-title')).toBeFocused();
      await expect(page.locator('#result-status')).toHaveText('Audience mapped: sponsor leads, places and podcasts for fans of this bill.');
    }
    await expect(reach.locator('.reach-card')).toHaveCount(3);
    await expect(reach.locator('.reach-card .solid-kicker')).toHaveText(['Sponsor leads', 'Places in the city', 'Podcasts to advertise on']);
    await expect(reach.locator('.reach-line')).toContainText(/^Fans of this bill favour .+, listen to .+ and go to .+\.$/);
    await expect(reach.locator('.reach-note')).toContainText('Synthetic development data, not from Qloo.');
    await expect(reach.locator('.reach-note')).toContainText('They do not change the bill.');
    const mix = reach.locator('.reach-mix').first();
    await expect(mix).toHaveAttribute('aria-label', /^Qloo explanation: Michael Kiwanuka \d+%, Sault \d+%$/);
    await expect(mix.locator('span')).toHaveCount(2);
    await expect(reach.locator('.reach-legend li').first()).toContainText('Michael Kiwanuka');
    for (const label of await reach.locator('.reach-who').allTextContents())
      expect(label).toMatch(/^(Mostly (Michael Kiwanuka|Sault)|Even split across the bill|Leans (Michael Kiwanuka|Sault) · 5[2-4]%)$/);
    await reach.locator('.reach-card[data-domain="brand"] .reach-receipt').click();
    await expect(page.locator('#receipt-title')).toHaveText('Brands fans of this bill favour');
    await expect(page.locator('#receipt-body thead')).toContainText('Name');
    await page.locator('#receipt-close').click();
    // Saved beside the plan: a reload shows the same leads with no button and no new request.
    let posted = false;
    page.on('request', request => { if (request.url().endsWith('/reach') && request.method() === 'POST') posted = true; });
    await page.reload();
    await expect(page.locator('#reach .reach-card')).toHaveCount(3);
    await expect(page.locator('#reach-run')).toHaveCount(0);
    expect(posted).toBe(false);
    // Dropping an act says the leads belong to the original bill.
    await page.getByRole('button', { name: 'Drop Sault and rebook' }).click();
    await expect(page.locator('.reach-changed')).toHaveText('These leads are for the original bill. The changed bill above would reach a different crowd.');
  });

  test('a fresh live plan maps its crowd as soon as the bill is ready', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await page.fill('#plan-city', 'Sheffield');
    await page.fill('#plan-anchor', 'Arlo Parks');
    await page.fill('#plan-budget', '12000');
    await page.locator('#plan-submit').click();
    await expect(page.locator('.result-meta')).toContainText('Sheffield', { timeout: 30000 });
    await expect(page.locator('#reach .reach-card')).toHaveCount(3, { timeout: 15000 });
    await expect(page.locator('#reach-run')).toHaveCount(0);
  });
});
