import { db } from './database.mjs';
import * as store from './store.mjs';
import { benchmarkFestival } from './gm.mjs';
import { providerPacing } from './llm.mjs';

db.exec('CREATE TABLE IF NOT EXISTS benchmark_batches(id TEXT PRIMARY KEY, body TEXT NOT NULL)');
export function loadBenchmarkBatch(id) {
  const row=db.prepare('SELECT body FROM benchmark_batches WHERE id=?').get(id);
  return row?JSON.parse(row.body):null;
}
function save(batch) {
  batch.reviewSourceId=batch.trials[0]?.status==='compared'?batch.trials[0].snapshotId:null;
  const unknown=batch.inFlight?1:0;
  batch.summary={planned:batch.requestedTrials,notAttempted:batch.requestedTrials-batch.trials.length-unknown,
    attempted:batch.trials.length,unknown,feasible:batch.trials.filter(t=>t.status==='compared').length,
    unavailable:batch.trials.filter(t=>t.status==='unavailable').length,
    invalid:batch.trials.filter(t=>['invalid_control','constraint_failure'].includes(t.status)).length,
    uniqueControls:new Set(batch.trials.filter(t=>t.status==='compared').map(t=>[...t.benchmark.control.selectedIds].sort().join('|'))).size};
  db.prepare('INSERT INTO benchmark_batches(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body').run(batch.id,JSON.stringify(batch));
  return batch;
}
// Called in the same transaction as the job and its event journal.
export function initializeBenchmark(run) {
  return save({id:run.id,runId:run.id,sourceId:run.sourceId,status:'queued',requestedTrials:run.options.trials??3,
    createdAt:run.createdAt,trials:[],selectionRule:'The first trial is the predeclared review source. All attempts are retained; no best-of selection.'});
}
export function stopBenchmark(id,status) {
  const batch=loadBenchmarkBatch(id);if(!batch||['complete','partial','canceled','interrupted','failed'].includes(batch.status))return;
  batch.status=status;batch.finishedAt=new Date().toISOString();delete batch.waitUntil;
  batch.stopReason=batch.inFlight?'The worker stopped during a trial. Its provider outcome is unknown and will not be replayed.':'Stopped before another trial. Completed attempts remain available.';
  save(batch);
}
export async function executeBenchmark(run,source,{check,commit,propose}) {
  const batch=loadBenchmarkBatch(run.id);
  for(let index=0;index<batch.requestedTrials;index++) {
    check();
    const waitMs=providerPacing(batch.trials.at(-1)?.benchmark.generation);
    if(waitMs) {
      commit('benchmark_pacing',()=>{batch.waitUntil=new Date(Date.now()+waitMs).toISOString();save(batch);return {waitUntil:batch.waitUntil,message:'Waiting for the provider token window.'};});
      const until=Date.now()+waitMs;
      while(Date.now()<until){check();await new Promise(resolve=>setTimeout(resolve,Math.min(250,until-Date.now())));}
    }
    check();
    commit('benchmark_trial_started',()=>{
      delete batch.waitUntil;batch.status='running';batch.inFlight={index:index+1,startedAt:new Date().toISOString()};save(batch);
      return {index:index+1,message:`Starting predeclared trial ${index+1}.`};
    });
    const benchmark=await benchmarkFestival(source,{propose});
    // Retain a returned receipt even when cancellation arrived during the call.
    // Commit checks ownership; a worker with an expired lease cannot write.
    commit('benchmark_trial_completed',()=>{
      const snapshotId=store.save({...source,id:undefined,createdAt:undefined,parentId:source.id,decisionProof:undefined,
        benchmark,benchmarkTrial:{batchId:run.id,index:index+1,reviewTrial:1}},{withinTransaction:true});
      db.prepare('UPDATE snapshots SET pinned=1 WHERE id=?').run(snapshotId);
      batch.trials.push({index:index+1,snapshotId,status:benchmark.status,benchmark});delete batch.inFlight;save(batch);
      return {index:index+1,snapshotId,status:benchmark.status,message:`Trial ${index+1}: ${benchmark.status}.`};
    });
    check();
    if(benchmark.generation?.httpStatus===429||benchmark.status==='not_comparable') {batch.stopReason=benchmark.reason;break;}
  }
  check();
  commit('benchmark_finished',()=>{
    batch.status=batch.trials.length===batch.requestedTrials?'complete':'partial';batch.finishedAt=new Date().toISOString();save(batch);
    return {status:batch.status,summary:batch.summary,message:'Every returned trial is retained. Only the first trial is eligible for independent review.'};
  });
  return batch;
}
