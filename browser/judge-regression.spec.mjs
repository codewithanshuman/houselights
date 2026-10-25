import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import AxeBuilder from '@axe-core/playwright';

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
  await glance.getByRole('link',{name:'Try a budget cut ↓'}).click();
  await expect(page.locator('#judge-tight-budget')).toBeFocused();await expect(page.locator('#judge-tight-budget')).toBeInViewport();
  // Not just in the viewport: visible, not under the sticky step bar.
  await expect.poll(()=>page.evaluate(()=>{const r=document.getElementById('judge-tight-budget').getBoundingClientRect();return !!document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('#judge-tight-budget');})).toBe(true);
  await page.locator('.glance-glossary summary').click();
  await expect(page.locator('.glance-glossary')).toContainText('Qloo publishes no margin of error');
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
  await page.getByRole('button', { name: 'Compare with Qloo evidence removed' }).click();
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
  await expect(panel.getByRole('button',{name:/Run fresh research/})).toHaveCount(0);
  await expect(panel.locator('#autopilot-fresh-note')).toContainText('organizer-only');
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

const PUBLIC_PAGES=['/judge.html','/desk.html','/evidence.html','/proof-lab.html','/workspace.html#example','/demand.html','/financial.html','/review.html','/index.html','/no-such-page'];

test('every page passes axe WCAG 2.1 AA with no serious or critical issues, at desktop and phone width', async ({ page }) => {
  test.setTimeout(240000);
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
  test('first view shows the featured decision and what Qloo changes @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await expect(page.locator('#hero-title')).toContainText('Book the bill');
    await expect(page.locator('#result-title')).toHaveText('Book Michael Kiwanuka + Sault for $13,500.');
    await expect(page.locator('#plan-switch-note')).toContainText('Without Qloo evidence, the same rules book Jordan Rakei + Hiatus Kaiyote for $9,000');
    await expect(page.locator('.act-grid[aria-label="Booked acts"] .act-card')).toHaveCount(2);
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
    const opener = page.locator('.act-grid[aria-label="Booked acts"] [data-receipt]').nth(1);
    await opener.click();
    await expect(page.locator('#receipt-drawer')).toHaveAttribute('open', '');
    await expect(page.locator('#receipt-title')).toContainText('ranking of every candidate for Leon Bridges fans in New York');
    await expect(page.locator('#receipt-drawer tr.is-highlight')).toContainText(/sault/i);
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  });

  test('a live plan streams progress and lands on a shareable, honestly labelled plan @cross-browser', async ({ page }) => {
    await page.goto(`${origin}/judge.html`);
    await page.fill('#plan-city', 'Leeds');
    await page.fill('#plan-anchor', 'Arlo Parks');
    await page.fill('#plan-budget', '12000');
    await page.locator('#plan-submit').click();
    await expect(page.locator('#plan-progress')).toBeVisible();
    await expect(page).toHaveURL(/\?plan=[a-f0-9]{24}$/, { timeout: 30000 });
    await expect(page.locator('#result-title')).toContainText('Book ');
    await expect(page.locator('.result-badges')).toContainText('Live plan');
    await expect(page.locator('.result-badges')).toContainText('Synthetic test data');
    await expect(page.locator('.result-badges')).toContainText('Estimated fees');
    await expect(page.locator('.result-terms')).toContainText('not a quote');
    const shared = page.url();
    await page.goto(shared);
    await expect(page.locator('.result-meta')).toContainText('Leeds');
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
});
