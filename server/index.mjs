import { createApp } from './app.mjs';
import { closeQloo, isMock } from './qloo.mjs';
import { hasLLM } from './llm.mjs';
import { startResearchWorker } from './research-runs.mjs';
import { seedPublicCases } from './release-seed.mjs';

const port = process.env.PORT || 8080;
if ((process.env.PUBLIC_DEMO === '1' || process.env.NODE_ENV === 'production') && (!process.env.ORGANIZER_TOKEN || process.env.ORGANIZER_TOKEN.length < 32)) throw new Error('Public deployment requires ORGANIZER_TOKEN with at least 32 characters.');
const host = process.env.HOST || '127.0.0.1';
const seed=seedPublicCases(process.env.JUDGE_CASES_FILE);
if(seed.configured)console.log(`Public judge cases: ${seed.imported} imported${seed.reused?' (existing release seed)':''}.`);
const server = createApp().listen(port, host, () => console.log(`Houselights http://${host}:${port}${isMock() ? ' (SYNTHETIC MODE)' : ''}${hasLLM() ? ' + LLM' : ''}`));
startResearchWorker();
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  server.close();
  await closeQloo();
  process.exit(0);
});
