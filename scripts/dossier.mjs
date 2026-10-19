import * as store from '../server/store.mjs';
import { buildDossier } from '../server/dossier.mjs';

const id = process.argv[2], format = process.argv.includes('--json') ? 'json' : 'markdown';
if (!id) {
  console.error('Usage: npm run dossier -- <saved-run-id> [--json]');
  process.exit(2);
}
const snapshot = store.load(id);
if (!snapshot) {
  console.error(`Saved run ${id} was not found.`);
  process.exit(1);
}
const dossier = buildDossier(snapshot, { investigationSource: store.load(snapshot.parentId) });
console.log(format === 'json' ? JSON.stringify(dossier, null, 2) : dossier.markdown);
