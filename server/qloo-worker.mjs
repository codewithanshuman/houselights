// Start the installed official MCP adapter without loading the interactive CLI
// router and its unrelated terminal-agent dependencies. Keep its tools, trust
// checks, configuration and result contract unchanged.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const entry = import.meta.resolve('@qloo/qloo-harness');
let adapter = new URL('./mcp.js', entry);
try {
  const manifest = JSON.parse(readFileSync(new URL('../build/qloo-adapter.manifest.json', import.meta.url), 'utf8'));
  const lockDigest = createHash('sha256').update(readFileSync(new URL('../package-lock.json', import.meta.url))).digest('hex');
  if (manifest.lockDigest === lockDigest) adapter = new URL('../build/qloo-adapter.mjs', import.meta.url);
  else process.stderr.write('Qloo adapter bundle is stale; run npm run build:worker. Loading the installed adapter.\n');
} catch { process.stderr.write('Qloo adapter bundle is absent; run npm run build:worker for faster startup.\n'); }
// The canonical adapter resolves global fetch when constructing its client.
// Install only its transport guard; tool schemas and results stay official.
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init={})=>{
  // Use the credential actually sent by the official client, including its
  // supported config-file credentials. Header values never leave this process.
  const apiKey=new Headers(init.headers??(input instanceof Request?input.headers:undefined)).get('x-api-key');
  if(!apiKey)return nativeFetch(input,init);
  const {createQlooHttpFetch}=await import('./qloo-http.mjs');
  const baseUrl=new URL(input instanceof Request?input.url:input).origin;
  return createQlooHttpFetch({apiKey,baseUrl,fetchImpl:nativeFetch})(input,init);
};
const { startCanonicalMcpServer } = await import(adapter.href);
const { version } = JSON.parse(readFileSync(new URL('../package.json', entry), 'utf8'));
startCanonicalMcpServer({ env: process.env, input: process.stdin,
  writeOut: text => process.stdout.write(text), serverVersion: version });
