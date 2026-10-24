import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';

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

test('the judge page leads with one recorded decision, its risk and the human call, before any mechanics', async ({ page }) => {
  const recorded=JSON.parse(readFileSync(join(root,'public','autopilot-recorded.json'),'utf8')).run.packet;
  await page.goto(`${origin}/judge.html`);
  const glance=page.locator('#decision-glance');
  await expect(glance.locator('.glance-book strong')).toHaveText(recorded.recommendation.names.join(' + '));
  await expect(glance).toContainText('WATCH OUT');await expect(glance).toContainText('YOUR CALL');
  await expect(glance).toContainText('Qloo affinity is cultural fit, not ticket demand');
  // The Qloo contribution is a matched zero-call comparison: same case, pool, fees and budget.
  await expect(glance.locator('#glance-qloo')).toContainText(/Same pool, fees and \$[\d,]+ budget: with Qloo evidence the optimizer books .+; with it withdrawn, .+\. Qloo changed the bill\./);
  await expect(glance.locator('#glance-qloo')).toContainText('not more ticket sales');
  await expect(glance.locator('.glance-grid')).not.toContainText('policy points');
  const order=await page.evaluate(()=>{const g=document.getElementById('decision-glance'),a=document.getElementById('booking-autopilot');return !!a&&!!(g.compareDocumentPosition(a)&Node.DOCUMENT_POSITION_FOLLOWING);});
  expect(order).toBe(true);
  await glance.locator('summary',{hasText:/glossary|terms/i}).first().click();
  await expect(glance).toContainText('Qloo publishes no margin of error');await expect(glance).toContainText('not that the bill will sell more tickets');
});

test('matched Qloo withdrawal opens the exact saved receipts', async ({ page }) => {
  await page.goto(`${origin}/judge.html#${caseId}`);
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
  await page.goto(`${origin}/judge.html#${caseId}`);
  await expect(page.locator('#judge-title')).toContainText('New York');
  await page.getByRole('button', { name: 'Compare with Qloo evidence removed' }).click();
  await expect(page.locator('.judge-evidence-comparison')).toContainText('MATCHED EVIDENCE TEST');
  await page.locator('#judge-budget').fill('10000');
  await page.getByRole('button', { name: 'Recalculate and check' }).click();
  const comparison = page.locator('.judge-evidence-comparison');
  await expect(comparison).toContainText('COMBINED-CHANGE REPLAY');
  await expect(comparison).toContainText('Evidence and booking inputs changed');
  await expect(comparison).toContainText('The lineup difference cannot be attributed to Qloo evidence alone.');
  await expect(comparison).not.toContainText('MATCHED EVIDENCE TEST');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('anonymous visitor can follow the homepage challenge through proof and limits', async ({ page }) => {
  await page.goto(`${origin}/index.html`);
  await page.getByRole('link', { name: /Try the booking challenge/ }).click();
  await expect(page).toHaveURL(new RegExp(`/judge\\.html#${tracedCaseId}$`));
  await expect(page.locator('#judge-title')).toContainText('New York');
  await page.getByRole('button', { name: 'Cut budget below this lineup’s cost' }).click();
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
  await expect(page.locator('#judge-title')).toContainText('recorded Qloo research run');
  await expect(page.locator('#judge-qloo-preview')).toContainText('The choice changes under matched assumptions.');
  await expect(page.locator('.judge-trace-summary')).toContainText('31 recorded events · 18/18 receipts linked');
  await expect(page.locator('.agent-stage-list')).toContainText('Model-selected checks');
  await expect(page.locator('.agent-stage-list')).toContainText('Charlotte Day Wilson');
  await expect(page.locator('.agent-stage-list')).toContainText('Exact optimization found a feasible slate');
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
  await expect(page.locator('#judge-result h3')).toHaveText('Michael Kiwanuka + Sault');
  await page.route(`**/api/judge/cases/${tracedCaseId}/experiment`, route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary test outage' }),
  }));
  await page.getByRole('button', { name: 'Cut budget below this lineup’s cost' }).click();
  await expect(page.locator('#judge-status')).toContainText('The previous result is still displayed; no new experiment completed.');
  await expect(page.locator('#judge-result h3')).toHaveText('Michael Kiwanuka + Sault');
  await expect(page.getByRole('button', { name: 'Cut budget below this lineup’s cost' })).toBeEnabled();
  await page.unroute(`**/api/judge/cases/${tracedCaseId}/experiment`);
  await page.getByRole('button', { name: 'Cut budget below this lineup’s cost' }).click();
  await expect(page.locator('#judge-result h3')).toHaveText('Michael Kiwanuka + Jordan Rakei');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('anonymous core path has no page-level horizontal overflow on narrow phone and tablet', async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/index.html', `/judge.html#${tracedCaseId}`, `/proof-lab.html#${tracedCaseId}`, '/evidence.html']) {
      await page.goto(origin + path);
      if (path.startsWith('/judge.html')) await expect(page.locator('#judge-title')).toContainText('New York');
      if (path.startsWith('/proof-lab.html')) await expect(page.locator('#with-lineup')).toContainText('Michael Kiwanuka');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px ${path}`).toBe(true);
    }
  }
});

test('judge can withdraw one receipt, rehearse a cancellation, and cannot write private records', async ({ page }) => {
  await page.goto(`${origin}/judge.html#${caseId}`);
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
  await page.goto(`${origin}/judge.html#5031a69f837e1c28ce045422`);
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
    await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  expect(text).toContain('Artist budget: US$11,600');
  expect(text).toContain('Illustrative booking terms');
  expect(text).toContain('No matched saved first-trial LLM-only control');
});

test('booking desk cancellation preserves survivors and zero budget stays explicitly infeasible', async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
  await expect(page.locator('#booking-signal-lab')).toContainText('booking simulator and saved receipts remain available');
  await expect(page.locator('.booking-selected')).toContainText('Michael Kiwanuka');
  await page.unroute(`**/api/experiments/public/${tracedCaseId}`);
  await page.getByRole('button',{name:'Retry signal comparison'}).click();
  await expect(page.locator('[data-booking-signal]')).toHaveCount(4);
});

test('failed booking replay keeps the decision visibly pending and exports only completed inputs', async ({page})=>{
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  expect(text).toContain('UNAPPLIED INPUTS');expect(text).toContain('Artist budget: US$14,500');
});

test('signal switches retain keyboard focus and expose their pressed state', async ({page})=>{
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
  const first=page.locator('[data-booking-signal="0"]');
  await expect(first).toHaveAttribute('aria-pressed','true');
  await first.focus();await page.keyboard.press('Space');
  await expect(first).toHaveAttribute('aria-pressed','false');await expect(first).toBeFocused();
  await page.keyboard.press('Space');await expect(first).toHaveAttribute('aria-pressed','true');
  await page.locator('.booking-path').getByRole('link',{name:/Your decision/}).click();
  await expect(page.locator('#booking-decision')).toBeFocused();
  expect(new URL(page.url()).hash).toBe(`#${tracedCaseId}`);
});

test('separate later LLM replication retains all trials and makes the cheaper control visible', async ({page})=>{
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
  const study=page.locator('#booking-independent-study');
  await expect(study).toContainText('3 / 3 declared attempts retained');
  await expect(study).toContainText('Michael Kiwanuka + Jordan Rakei');
  await expect(study).toContainText('US$3,500 cheaper');
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
  await page.goto(`${origin}/judge.html#${selected.id}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
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
  await page.goto(`${origin}/judge.html#${tracedCaseId}`);
  await page.locator('.judge-shock-study summary').click();
  const teaser=page.locator('#judge-shock-teaser');
  await expect(teaser.locator('strong')).toHaveText('3/231');
  await expect(teaser).toContainText('because the prompt required a lineup');
  await expect(teaser).not.toContainText('9.7');
  await page.goto(`${origin}/evidence.html`);
  await expect(page.locator('#shock-headline')).toContainText('On 77 solvable shocks, 3/231 re-prompted LLM responses (1.3%)');
  await expect(page.locator('#shock-stats')).toContainText('Briefs without a comparable Qloo ranking');
  await expect(page.locator('#shock-rows')).toContainText('not comparable (incomplete Qloo ranking)');
  await expect(page.locator('body')).not.toContainText('9.7%');
});
