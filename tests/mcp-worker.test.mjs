import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Run } from '../server/qloo.mjs';
import { buildFestivalResearch, normalizeFestivalResearch } from '../server/festival-research.mjs';
import { researchThemeSeason } from '../server/theme-research.mjs';

test('official MCP worker initializes and exposes canonical tools without loading the interactive CLI', { timeout: 30000 }, async () => {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../server/qloo-worker.mjs', import.meta.url))],
    env: process.env, stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  const client = new Client({ name: 'houselights-transport-test', version: '1.0' });
  try {
    await client.connect(transport, { timeout: 20000 });
    const { tools } = await client.listTools();
    assert.ok(tools.some(tool => tool.name === 'qloo_rank'));
    assert.ok(tools.some(tool => tool.name === 'qloo_compare_audiences'));
    assert.equal(client.getServerVersion().name, 'qloo-harness');
    const items = Array.from({ length: 6 }, (_, i) => ({ id: `artist-${i}`, name: `Artist ${i}`, terms: { fee: 10, genre: 'test', available: true } }));
    const source = { memo: { input: { city: 'London', anchors: ['Radiohead'] }, items, constraints: { budget: 100, slots: 2 } } };
    const run = new Run({ mode: 'mock', budget: 60, cacheStore: new Map() });
    const festivalResearch = await buildFestivalResearch(source, normalizeFestivalResearch(source), run);
    const themeRun = new Run({ mode: 'mock', budget: 60, cacheStore: new Map() });
    await researchThemeSeason({ ...source, festivalResearch }, { dates: [{ date: '2027-04-01', time: 'night', segment: 'young_pros' }], count: 1, sponsorTags: ['technology'] }, themeRun);
    for (const receipt of [...run.receipts, ...themeRun.receipts]) {
      const schema = tools.find(tool => tool.name === `qloo_${receipt.tool}`).inputSchema;
      for (const [key, value] of Object.entries(receipt.args)) {
        const rule = schema.properties[key];
        assert.ok(rule, `${receipt.tool}.${key} must be supported by the official schema`);
        if (rule.enum) assert.ok(rule.enum.includes(value), `${receipt.tool}.${key} has an unsupported value`);
        if (rule?.maximum != null && typeof value === 'number') assert.ok(value <= rule.maximum, `${receipt.tool}.${key} exceeds official maximum`);
        if (rule?.maxItems != null && Array.isArray(value)) assert.ok(value.length <= rule.maxItems, `${receipt.tool}.${key} exceeds official batch limit`);
      }
    }
    assert.equal(run.receipts.filter(receipt => receipt.tool === 'trends').length, 2);
  } finally { await client.close(); }
});
