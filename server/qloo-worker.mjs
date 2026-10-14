// Start the installed official MCP adapter without loading the interactive CLI
// router and its unrelated terminal-agent dependencies. Keep its tools, trust
// checks, configuration and result contract unchanged.
import { readFileSync } from 'node:fs';
const entry = import.meta.resolve('@qloo/qloo-harness');
const { startCanonicalMcpServer } = await import(new URL('./mcp.js', entry).href);
const { version } = JSON.parse(readFileSync(new URL('../package.json', entry), 'utf8'));
startCanonicalMcpServer({ env: process.env, input: process.stdin,
  writeOut: text => process.stdout.write(text), serverVersion: version });
