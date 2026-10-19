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
const { startCanonicalMcpServer } = await import(adapter.href);
const { version } = JSON.parse(readFileSync(new URL('../package.json', entry), 'utf8'));
startCanonicalMcpServer({ env: process.env, input: process.stdin,
  writeOut: text => process.stdout.write(text), serverVersion: version });
