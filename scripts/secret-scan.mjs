// Fails if any tracked file contains something that looks like a real credential:
// private keys, provider tokens (Groq, OpenAI, Anthropic, GitHub, AWS, Slack) or a long
// literal assigned to a key/secret/token name. Test placeholders are recognised by their
// wording (placeholder, test, fixture, example, local, ci-only) or repeated filler.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

let inventory, inventoryKind = 'tracked';
try {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  if (realpathSync(root) !== realpathSync(process.cwd())) throw new Error('Not the project Git root');
  inventory = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean);
} catch {
  inventoryKind = 'filesystem source'; inventory = [];
  const skip = new Set(['node_modules', '.git', 'data', 'artifacts', 'build', 'dist', '.claude', '.codex', 'test-results', 'playwright-report', 'coverage']);
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (skip.has(entry.name) || /^\.env(?:$|\.)/.test(entry.name) && entry.name !== '.env.example') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path); else if (entry.isFile()) inventory.push(path);
    }
  };
  walk('.');
}
const files = inventory
  .filter(file => !/\.(png|webp|jpe?g|gif|woff2?|ttf|ico|pdf|zip|xlsx|sqlite)$/i.test(file) && file !== 'package-lock.json');
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['Groq key', /\bgsk_[A-Za-z0-9]{40,}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{40,}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
  ['assigned secret', /\b(?:api[_-]?key|secret|token|password)\b["']?\s*[:=]\s*["']([A-Za-z0-9_\-]{28,})["']/i],
];
const placeholder = text => /placeholder|fixture|example|dummy|not-a|ci-only|local-|test|regression|preview|drill|wrong/i.test(text) || /(.{2,8})\1{3,}/.test(text);
const findings = [];
for (const file of files) {
  let text; try { text = readFileSync(file, 'utf8'); } catch { continue; }
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [kind, pattern] of patterns) {
      const match = line.match(pattern); if (!match) continue;
      if (placeholder(match[0]) || placeholder(line)) continue;
      findings.push(`${file}:${index + 1}: possible ${kind}`);
    }
  });
}
if (findings.length) { console.error(`Secret scan failed (${findings.length}):\n${findings.join('\n')}`); process.exit(1); }
console.log(`Secret scan passed: ${files.length} ${inventoryKind} files, no credential patterns.`);
