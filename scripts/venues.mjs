import { readFileSync } from 'node:fs';

const [action, id, file] = process.argv.slice(2);
if (!['capacity-review', 'qualify'].includes(action) || !id || !file) {
  console.error('Usage: npm run venues -- <capacity-review|qualify> <saved-id> <options.json>');
  process.exit(2);
}
try {
  const base = process.env.HOUSELIGHTS_URL ?? 'http://127.0.0.1:8080';
  const response = await fetch(`${base}/api/venues/${encodeURIComponent(id)}/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json',
      ...(process.env.ORGANIZER_TOKEN ? { authorization: `Bearer ${process.env.ORGANIZER_TOKEN}` } : {}) },
    body: JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
