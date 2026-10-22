import { readFileSync } from 'node:fs';
import { importReportedOutcomes } from '../server/reported-outcomes.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/import-demand-outcomes.mjs <private-audit.json>');
  process.exitCode = 2;
} else {
  const report = JSON.parse(readFileSync(file, 'utf8'));
  console.log(JSON.stringify(importReportedOutcomes(report), null, 2));
}
