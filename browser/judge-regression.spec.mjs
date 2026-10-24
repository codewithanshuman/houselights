import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
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
  for (let attempt = 0; attempt < 150; attempt++) {
    if (app.exitCode != null) throw new Error(`Local HouseLights exited early: ${output.slice(-1500)}`);
    try {
      const response = await fetch(`${origin}/api/judge/cases`, { signal: AbortSignal.timeout(1000) });
      if (response.ok && (await response.json()).cases.some(row => row.id === caseId)) return;
    } catch { /* Startup is still in progress. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Local HouseLights did not load the saved judge case: ${output.slice(-1500)}`);
}

test.beforeAll(async () => {
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
  await page.getByRole('button', { name: 'Recalculate and prove' }).click();
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
  await expect(page.locator('#agent-trace-status')).toContainText('1 of 5 public cases have a complete saved application-event sequence');
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
  await expect(page.locator('#judge-qloo-preview')).toContainText('Treat this comparison as inconclusive.');
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
