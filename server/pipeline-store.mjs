import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.DATA_DIR || './data';
const dir = join(root, 'pipelines');
mkdirSync(dir, { recursive: true });
const valid = id => /^[\w-]{6,12}$/.test(String(id || ''));

export function load(id) {
  if (!valid(id)) return null;
  try { return JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8')); } catch { return null; }
}

export function save(id, pipeline) {
  if (!valid(id)) throw new Error('Invalid pipeline source ID.');
  const path = join(dir, `${id}.json`), temporary = join(dir, `${id}.${process.pid}.tmp`);
  writeFileSync(temporary, JSON.stringify(pipeline));
  renameSync(temporary, path);
  return pipeline;
}
