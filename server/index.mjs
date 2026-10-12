import { createApp } from './app.mjs';
import { closeQloo, isMock } from './qloo.mjs';
import { hasLLM } from './llm.mjs';

const port = process.env.PORT || 8080;
const host = process.env.HOST || '127.0.0.1';
const server = createApp().listen(port, host, () => console.log(`Houselights http://${host}:${port}${isMock() ? ' (SYNTHETIC MODE)' : ''}${hasLLM() ? ' + LLM' : ''}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => {
  server.close();
  await closeQloo();
  process.exit(0);
});
