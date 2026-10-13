import { readFileSync } from 'node:fs';

const [action, id, optionsFile] = process.argv.slice(2);
if (!['run', 'benchmark', 'revise', 'season', 'schedule'].includes(action) || (action !== 'schedule' && !id)) {
  console.error('Usage: npm run gm -- <run|benchmark|revise|season> <saved-id> [options.json]\n       npm run gm -- schedule <options.json>');
  process.exit(2);
}
try {
  const file = action === 'schedule' ? id : optionsFile;
  const body = file ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const base = process.env.HOUSELIGHTS_URL ?? 'http://127.0.0.1:8080';
  const path = action === 'schedule' ? '/api/gm/schedule' : `/api/gm/${encodeURIComponent(id)}/${action}`;
  const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(150000) });
  const result = await response.json();
  if (!response.ok) { console.error(JSON.stringify(result, null, 2)); process.exitCode = 1; }
  else {
    console.log(JSON.stringify(result, null, 2));
    if (result.id) console.error(`Saved decision: ${base}/api/memo/${result.id}`);
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
