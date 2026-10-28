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
    const themes = festivalResearch.markets[0].domains.flatMap(domain => domain.entities);
    await researchThemeSeason({ ...source, festivalResearch }, { dates: [{ date: '2027-04-01', time: 'night', segment: 'young_pros' }], count: 1, sponsorTags: ['technology'],
      anchorOverrides: { '2027-04-01': themes[0].id }, supportingByDate: { '2027-04-01': [themes[1].id] } }, themeRun);
    assert.equal(themeRun.receipts.filter(receipt => receipt.tool === 'compare_audiences').length, 1);
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

test('canonical SDK retries are metered as actual HTTP attempts, not one workflow', {timeout:30000}, async()=>{
  const {createServer}=await import('node:http');const {mkdtempSync,mkdirSync,writeFileSync,rmSync,realpathSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join,sep}=await import('node:path');
  const {DatabaseSync}=await import('node:sqlite');const directory=mkdtempSync(join(tmpdir(),'houselights-sdk-http-'));let requests=0;
  const server=createServer((_req,res)=>{requests++;res.writeHead(503,{'content-type':'application/json','x-month-ratelimit-limit':'50000','x-month-ratelimit-remaining':String(50000-requests)});res.end(JSON.stringify({error:'Synthetic transport failure; not real provider evidence'}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
   for(const mode of ['environment','config']){
    const home=join(directory,'harness-'+mode);mkdirSync(home);if(mode==='config')writeFileSync(join(home,'config'),'api_key=test-only-sdk-http-fixture\n');
    const env={...process.env,DATA_DIR:directory,QLOO_HOME:home,QLOO_BASE_URL:base,QLOO_TRUSTED_BASE_URL:base};if(mode==='environment')env.QLOO_API_KEY='test-only-sdk-http-fixture';else delete env.QLOO_API_KEY;
    const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('../server/qloo-worker.mjs',import.meta.url))],env,stderr:'pipe'});transport.stderr?.on('data',()=>{});
    const client=new Client({name:'houselights-http-meter-test',version:'1'}),before=requests;
    try{
    await client.connect(transport,{timeout:10000});await client.callTool({name:'qloo_describe',arguments:{entity:'Synthetic HTTP fixture',type:'artist'}},undefined,{timeout:20000});
    assert.equal(requests-before,3,'The installed SDK performed its three HTTP attempts for '+mode+' credentials');
    const stored=new DatabaseSync(join(directory,'houselights.sqlite'),{readOnly:true});
    try{assert.equal(stored.prepare('SELECT count(*) AS n FROM qloo_http_requests').get().n,requests);const state=JSON.parse(stored.prepare('SELECT body FROM qloo_http_state').get().body);assert.equal(state.observedRemaining,50000-requests);}finally{stored.close();}
    }finally{await client.close().catch(()=>{});}
   }
  }finally{await new Promise(resolve=>server.close(resolve));const resolved=realpathSync(directory);assert.ok(resolved.startsWith(realpathSync(tmpdir())+sep));rmSync(resolved,{recursive:true,force:true,maxRetries:3});}
});
