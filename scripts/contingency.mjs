import * as store from '../server/store.mjs';
import { buildContingencyPlan } from '../server/contingency.mjs';

const id = process.argv[2];
if (!id) {
  console.error('Usage: npm run contingency -- <saved-run-id>');
  process.exit(2);
}

const snapshot = store.load(id);
if (!snapshot?.memo?.items || !snapshot.memo.constraints) {
  console.error(`Saved run ${id} was not found or is incomplete.`);
  process.exit(1);
}

const plan = buildContingencyPlan(snapshot.memo.items, snapshot.memo.constraints);
console.log(JSON.stringify({ sourceId: id, createdAt: new Date().toISOString(), ...plan }, null, 2));
process.exit(plan.baseline.status === 'invalid' ? 1 : 0);
