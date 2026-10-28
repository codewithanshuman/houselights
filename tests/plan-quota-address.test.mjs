import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = mkdtempSync(join(tmpdir(), 'houselights-prefix-quota-'));
process.env.DATA_DIR = directory;
const { planVisitorKey, publicPlanDailyCap } = await import('../server/live-plan.mjs');
const { db, consumeQuota } = await import('../server/database.mjs');
after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });

test('IPv6 aliases and addresses in one /64 share one counter; another prefix remains separate', () => {
  const first = planVisitorKey('2001:db8:abcd:1234::1');
  const second = planVisitorKey('2001:0DB8:ABCD:1234:ffff:ffff:ffff:ffff');
  const other = planVisitorKey('2001:db8:abcd:1235::1');
  assert.equal(first, second); assert.notEqual(first, other);
  const now = Date.now(), window = Math.floor(now / 6e5), expires = (window + 1) * 6e5;
  const admit = key => consumeQuota([{ key: `plan:${window}:${key}`, limit: 3, expires }], now);
  assert.equal(admit(first), true); assert.equal(admit(first), true); assert.equal(admit(second), true);
  assert.equal(admit(second), false); assert.equal(admit(other), true);
  assert.equal(db.prepare('SELECT count FROM quotas WHERE key=?').get(`plan:${window}:${first}`).count, 3);
});

test('IPv4-mapped IPv6 cannot bypass the IPv4 bucket and malformed addresses do not get unique quotas', () => {
  assert.equal(planVisitorKey('::ffff:192.0.2.1'), planVisitorKey('192.0.2.1'));
  assert.equal(planVisitorKey('::ffff:c000:201'), planVisitorKey('192.0.2.1'));
  assert.notEqual(planVisitorKey('192.0.2.1'), planVisitorKey('192.0.2.2'));
  assert.equal(planVisitorKey('invalid-one'), planVisitorKey('invalid-two'));
});

test('the public plan cap defaults to 40, honors zero and fails closed for invalid configuration', () => {
  const previous = process.env.PUBLIC_PLAN_DAILY_CAP;
  try {
    delete process.env.PUBLIC_PLAN_DAILY_CAP; assert.equal(publicPlanDailyCap(), 40);
    process.env.PUBLIC_PLAN_DAILY_CAP = '80'; assert.equal(publicPlanDailyCap(), 80);
    for (const value of ['0', '-1', 'Infinity', 'NaN', '2.5']) {
      process.env.PUBLIC_PLAN_DAILY_CAP = value; assert.equal(publicPlanDailyCap(), 0);
    }
  } finally { if (previous === undefined) delete process.env.PUBLIC_PLAN_DAILY_CAP; else process.env.PUBLIC_PLAN_DAILY_CAP = previous; }
});
