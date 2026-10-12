import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const DIR = process.env.DATA_DIR || './data', MAX = 500;
mkdirSync(DIR, { recursive: true });
// Snapshots keep receipts (inputs + status) and the memo, never raw Qloo result payloads.
export function save(snap) {
  const id = randomBytes(7).toString('base64url');
  writeFileSync(`${DIR}/${id}.json`, JSON.stringify({ ...snap, id, createdAt: new Date().toISOString() }));
  const all = readdirSync(DIR).filter(f => /^[\w-]{10}\.json$/.test(f)).map(f => [f, statSync(`${DIR}/${f}`)]).filter(([, stat]) => stat.isFile()).map(([f, stat]) => [f, stat.mtimeMs]).sort((a, b) => a[1] - b[1]);
  for (const [f] of all.slice(0, Math.max(0, all.length - MAX))) unlinkSync(`${DIR}/${f}`);
  return id;
}
export function load(id) {
  if (!/^[\w-]{6,12}$/.test(id)) return null;
  try { return JSON.parse(readFileSync(`${DIR}/${id}.json`, 'utf8')); } catch { return null; }
}
