// Records the Booking Desk's one path on a live origin as a captioned ~90-second video:
// brief → optimized slate → withdraw Qloo evidence → decision changes → open the receipt.
// Captions are drawn on the page (so they are in the video) and also written as SRT.
// Output: artifacts/video/houselights-path.webm and .srt (artifacts/ is git-ignored).
// Usage: node scripts/record-demo-video.mjs [origin] — uses installed Chrome on Windows,
// otherwise Playwright's Chromium. One zero-call experiment request is made.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const origin = process.argv[2] ?? 'https://houselights.80-225-218-239.sslip.io';
const out = join(resolve(import.meta.dirname, '..'), 'artifacts', 'video');
mkdirSync(out, { recursive: true });
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
const page = await context.newPage();
const started = Date.now(), cues = [];
let open = null;
async function caption(text) {
  const now = (Date.now() - started) / 1000;
  if (open) cues.push({ ...open, end: now });
  open = { start: now, text };
  await page.evaluate(value => {
    let box = document.getElementById('demo-caption');
    if (!box) {
      box = document.createElement('div'); box.id = 'demo-caption';
      box.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:1100px;width:calc(100% - 80px);background:rgba(18,16,28,.88);color:#fff;font:600 20px/1.4 Arial,sans-serif;padding:12px 20px;border-radius:8px;text-align:center;z-index:2147483647;pointer-events:none';
      document.body.appendChild(box);
    }
    box.textContent = value;
  }, text);
}
const pause = seconds => page.waitForTimeout(seconds * 1000);
const show = async selector => { await page.locator(selector).first().scrollIntoViewIfNeeded(); await page.evaluate(sel => document.querySelector(sel)?.scrollIntoView({ block: 'center' }), selector); };

await page.goto(`${origin}/judge.html`, { waitUntil: 'networkidle' });
await caption('Houselights: constraint-correct, auditable booking decisions with Qloo receipts.'); await pause(7);
await show('#decision-glance .glance-step:nth-child(1)');
await caption('1 · The brief: New York, 2 slots for listeners of Leon Bridges, a $14,500 artist budget, 8 candidate acts.'); await pause(9);
await show('#decision-glance .glance-book');
await caption('2 · The optimized slate: Michael Kiwanuka + Sault, $13,500. Every booking rule passes.'); await pause(9);
await caption('Qloo audience affinity explains the choice. A near-tie is flagged, and the promoter makes the call.'); await pause(9);
await show('#glance-withdraw');
await caption('3 · Withdraw Qloo evidence. Same optimizer, pool, fees and budget. Zero provider calls.'); await pause(6);
await page.getByRole('button', { name: 'Withdraw Qloo evidence and re-run ↓' }).click();
const comparison = page.locator('.judge-evidence-comparison');
await comparison.waitFor({ timeout: 30000 }); await show('.judge-evidence-comparison');
await caption('The decision changes: without Qloo evidence it books Jordan Rakei + Hiatus Kaiyote, $9,000.'); await pause(10);
await show('#glance-receipt');
await caption('4 · Check the receipt: open the saved Qloo response behind the change.'); await pause(5);
await page.getByRole('button', { name: 'Open the receipt ↓' }).click();
await page.locator('#judge-receipts details[open] summary').first().waitFor({ timeout: 10000 });
await show('#judge-receipts details[open]');
await caption('Every claim links to the stored Qloo response that supports it.'); await pause(8);
await caption('Fees are illustrative. Qloo affinity is cultural fit, not ticket demand. No sales improvement has been measured.'); await pause(8);
await caption('Try it: houselights.80-225-218-239.sslip.io/judge.html · code: github.com/codewithanshuman/houselights'); await pause(7);
cues.push({ ...open, end: (Date.now() - started) / 1000 });
const video = page.video(); await context.close(); await browser.close();
const target = join(out, 'houselights-path.webm');
renameSync(await video.path(), target);
const stamp = seconds => { const ms = Math.round(seconds * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
writeFileSync(join(out, 'houselights-path.srt'), cues.map((cue, index) => `${index + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n'));
console.log(JSON.stringify({ video: target, captions: join(out, 'houselights-path.srt'), seconds: Math.round(cues.at(-1).end), cues: cues.length }));
