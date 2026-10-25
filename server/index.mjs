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
// Graceful shutdown: stop accepting connections, let in-flight requests finish,
// close idle keep-alive sockets and the Qloo harness, then exit (forced after 10 s).
let stopping=false;
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  if (stopping) return; stopping = true;
  console.log(JSON.stringify({ t: new Date().toISOString(), level: 'info', message: `Received ${signal}; shutting down` }));
  setTimeout(() => process.exit(1), 10000).unref();
  await new Promise(resolve => { server.close(resolve); server.closeIdleConnections?.(); });
  await closeQloo().catch(() => {});
  process.exit(0);
});
