// Checks links in README.md and docs/*.md. Relative links must point to an existing file
// and, when they carry #anchor, to a heading in that file. With --external, http(s) links
// (including GitHub commit and Actions links) are fetched too. CI runs the offline check.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..'), external = process.argv.includes('--external');
const files = ['README.md', ...readdirSync(join(repo, 'docs')).filter(f => f.endsWith('.md')).map(f => `docs/${f}`)];
const slug = text => text.toLowerCase().replace(/<[^>]+>/g, '').replace(/[`*_~]/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
const anchorsOf = new Map();
function anchors(file) {
  if (!anchorsOf.has(file)) {
    const seen = new Map(), set = new Set();
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^#{1,6}\s+(.*)$/); if (!m) continue;
      const base = slug(m[1]), n = seen.get(base) ?? 0; seen.set(base, n + 1); set.add(n ? `${base}-${n}` : base);
    }
    anchorsOf.set(file, set);
  }
  return anchorsOf.get(file);
}
// Hosts that refuse automated requests (403) although the page exists for people: warn only.
const BOT_BLOCKED = ['fliphtml5.com'];
const problems = [], warnings = [], web = new Map();
for (const file of files) {
  const text = readFileSync(join(repo, file), 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (/^mailto:/.test(target)) continue;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(target)) continue;
    if (/^https?:\/\//.test(target)) { if (!web.has(target)) web.set(target, file); continue; }
    const [path, hash] = target.split('#');
    const resolved = path ? resolve(dirname(join(repo, file)), decodeURIComponent(path)) : join(repo, file);
    if (!existsSync(resolved)) { problems.push(`${file}: missing file ${target}`); continue; }
    if (hash && resolved.endsWith('.md') && !anchors(resolved).has(hash.toLowerCase())) problems.push(`${file}: missing anchor ${target}`);
  }
}
let checked = 0;
if (external) {
  const queue = [...web.entries()];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const [url, file] = queue.shift();
      try {
        let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15000) });
        if (response.status === 405 || response.status === 403) response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
        checked++;
        if (response.status >= 400 && response.status !== 429) (response.status === 403 && BOT_BLOCKED.some(host => new URL(url).hostname.endsWith(host)) ? warnings : problems).push(`${file}: ${response.status} ${url}`);
      } catch (error) { problems.push(`${file}: unreachable ${url} (${error.name})`); }
    }
  }));
}
console.log(`Checked ${files.length} files: relative links and anchors${external ? `, and ${checked}/${web.size} external links` : ` (${web.size} external links skipped; use --external)`}.`);
if (warnings.length) console.log(`Warnings (host blocks automated requests; check by hand):\n${warnings.join('\n')}`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('No broken links.');
