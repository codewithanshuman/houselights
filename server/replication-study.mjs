import {createHash} from 'node:crypto';
import {evaluateSelection,optimizeSlate} from './optimizer.mjs';
import {benchmarkBrief} from './gm.mjs';
export const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const same=(a,b)=>JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
export function exportReplication(protocol,snapshot,journal){
  if(protocol.version!=='recorded-control-replication-v1'||protocol.trials!==3||protocol.reviewTrial!==1||protocol.maximumProviderRequests!==3||protocol.additionalQlooCalls!==0)throw new Error('Unsupported preregistered replication protocol.');
  if(protocol.publicSnapshotDigest!==digest(snapshot)||journal.protocolDigest!==digest(protocol))throw new Error('Replication inputs do not match the frozen protocol.');
  const full=optimizeSlate(snapshot.memo.items,snapshot.memo.constraints),briefDigest=digest(benchmarkBrief(snapshot,full.constraints));
  if(journal.trials.length>protocol.trials)throw new Error('Attempt cap exceeded.');
  const trials=journal.trials.map((trial,index)=>{
    if(trial.index!==index+1)throw new Error('Trial order changed.');
    if(!trial.benchmark)return {index:trial.index,status:'interrupted_unknown',available:false,selectedIds:[],comparisonEligible:false};
    const b=trial.benchmark,g=b.generation??{};
    if(b.briefDigest!==briefDigest)throw new Error('A control used a different booking brief.');
    if(g.provider!==protocol.provider||g.model!==protocol.model||g.toolsAllowed!==false)throw new Error('Provider, model or tool policy changed.');
    if(!Number.isFinite(Date.parse(g.startedAt))||Date.parse(g.startedAt)<Date.parse(protocol.declaredAt))throw new Error('A control predates the declared protocol.');
    if(index&&g.requestDigest!==journal.trials[0].benchmark?.generation?.requestDigest)throw new Error('The request changed between repeats.');
    const generation=Object.fromEntries(['provider','model','mode','status','startedAt','httpStatus','latencyMs','toolsAllowed','promptDigest','requestDigest','responseDigest'].filter(key=>g[key]!=null).map(key=>[key,g[key]]));
    generation.usage=Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens','input_tokens','output_tokens'].filter(key=>Number.isFinite(g.usage?.[key])).map(key=>[key,g.usage[key]]));
    if(!Array.isArray(b.control?.selectedIds))return {index:trial.index,status:b.status,available:false,selectedIds:[],generation,comparisonEligible:false};
    if(g.mode!=='live'||g.status!=='ok'||g.httpStatus!==200||['promptDigest','requestDigest','responseDigest'].some(key=>!/^sha256:[a-f0-9]{64}$/.test(g[key]??'')))throw new Error('A model selection requires successful live provider provenance.');
    const checked=evaluateSelection(snapshot.memo.items,full.constraints,b.control.selectedIds);
    return {index:trial.index,status:checked.feasible?'feasible':'constraint_failure',available:true,selectedIds:checked.selectedIds,
      feasible:checked.feasible,violations:checked.violationCodes,plannedFees:checked.totalFee,
      sameSelectionAsHouseLights:same(checked.selectedIds,full.selectedIds),generation,comparisonEligible:trial.index===protocol.reviewTrial&&checked.feasible&&full.feasible};
  });
  return {version:protocol.version,protocolDigest:digest(protocol),sourceCaseId:protocol.sourceCaseId,publicSnapshotDigest:protocol.publicSnapshotDigest,
    declaredAt:protocol.declaredAt,reviewTrial:protocol.reviewTrial,plannedTrials:protocol.trials,attemptedTrials:trials.length,
    unattemptedTrials:protocol.trials-trials.length,briefDigest,currency:snapshot.memo.currency,
    houselights:{selectedIds:full.selectedIds,plannedFees:full.totalFee,feasible:full.feasible},trials,
    scope:protocol.scope,selectionRule:protocol.selectionRule,limitations:protocol.limitations,
    genuineReviewerJudgments:0,observedTicketOutcomes:0,additionalQlooCalls:0,independentOutcomeEvidence:false};
}
