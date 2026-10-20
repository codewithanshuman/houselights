import {createHash} from 'node:crypto';
import {benchmarkBrief} from './gm.mjs';
import {evaluateSelection,optimizeSlate} from './optimizer.mjs';

const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sameIds=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&JSON.stringify([...a].sort())===JSON.stringify([...b].sort());
const completeRanks=snapshot=>snapshot.memo.items.every(i=>i.evidence?.rank===true&&Number.isFinite(i.fit)&&i.fit>=0&&i.fit<=1&&i.rankCoverage?.complete!==false);
const error=message=>Object.assign(new Error(message),{status:400});
const text=value=>typeof value==='string'?value.slice(0,180):'';
const hash=value=>/^sha256:[a-f0-9]{64}$/.test(value??'')?value:null;
const statuses=['compared','constraint_failure','invalid_control','unavailable','not_comparable'];
const diagnostic='Policy points evaluate the optimizer’s own objective. They are not independent evidence, attendance predictions or revenue uplift.';

// Export only reproducible inputs, selected IDs and provider metadata. Never copy
// model prose, raw responses, source IDs, batch IDs or provider request IDs.
export function publicBenchmark(source,projected) {
  const b=source.benchmark;
  if(!b?.status)return null;
  if(!statuses.includes(b.status))throw error('Unsupported saved benchmark status.');
  if(source.benchmarkTrial?.index!==1||source.benchmarkTrial?.reviewTrial!==1)throw error('Publish the batch’s predeclared first trial; later trials cannot replace it.');
  const original=optimizeSlate(source.memo.items,source.memo.constraints);
  const brief=benchmarkBrief(projected,projected.memo.slate.constraints);
  if(b.briefDigest!==digest(b.brief)||b.briefDigest!==digest(benchmarkBrief(source,original.constraints))||b.briefDigest!==digest(brief))throw error('The saved benchmark brief changed. Its control cannot be presented as a matched comparison.');
  if(!sameIds(original.selectedIds,b.qloo?.selectedIds))throw error('The saved Qloo selection no longer matches the benchmark.');
  if(b.evidenceMode==='live'&&projected.mock)throw error('Synthetic evidence cannot be published as a live benchmark.');
  const g=b.generation??{};
  const notComparable=original.constraints.minimumAverageFit!=null||!completeRanks(source);
  if((b.status==='not_comparable')!==notComparable)throw error('The benchmark status does not match the available ranking evidence or constraints.');
  const successful=['compared','constraint_failure','invalid_control'].includes(b.status);
  if(successful&&(g.mode!=='live'||g.status!=='ok'||g.httpStatus!==200||g.toolsAllowed!==false||!hash(g.promptDigest)||!hash(g.requestDigest)||!hash(g.responseDigest)||!['groq','anthropic'].includes(g.provider)||!text(g.model)))throw error('A public LLM control requires a saved real, tool-free provider response with request and response digests.');
  if(b.status==='unavailable'&&(!['live','not_called'].includes(g.mode)||g.status==='ok'))throw error('An unavailable control must retain a failed or unconfigured provider attempt.');
  if(b.status==='not_comparable'&&g.mode!=='not_called')throw error('A non-comparable case must not claim a model generation.');
  let control=null;
  if(['compared','constraint_failure'].includes(b.status)){
    let evaluated;
    try{evaluated=evaluateSelection(projected.memo.items,projected.memo.slate.constraints,b.control?.selectedIds);}
    catch{throw error('The saved control contains invalid candidate IDs; it cannot be repaired during publication.');}
    const expected=original.feasible&&evaluated.feasible?'compared':'constraint_failure';
    if(b.status!==expected)throw error('The saved control status does not match its constraint checks.');
    control={selectedIds:[...b.control.selectedIds]};
  }else if(b.status==='invalid_control'){
    if(b.control?.selectedIds)throw error('An invalid control cannot publish a substituted selection.');
    control={valid:false};
  }
  const generation=Object.fromEntries(['provider','model','mode','status','startedAt','returnedModel'].filter(k=>g[k]!=null).map(k=>[k,text(g[k])]));
  for(const field of ['promptDigest','requestDigest','responseDigest'])if(hash(g[field]))generation[field]=g[field];
  if(Number.isInteger(g.httpStatus))generation.httpStatus=g.httpStatus;
  if(typeof g.toolsAllowed==='boolean')generation.toolsAllowed=g.toolsAllowed;
  return {version:'1.0',status:b.status,brief,briefDigest:b.briefDigest,qloo:{selectedIds:original.selectedIds},control,generation,
    evidenceMode:b.evidenceMode==='live'?'live':projected.mock?'mock':'unknown',generatedAt:text(b.generatedAt),
    evaluationKind:'in_sample_objective_diagnostic',independentEvidence:false,methodology:diagnostic};
}

// A changed brief replays the original selection. It never generates, repairs or
// silently substitutes a new LLM choice, even when that choice violates the change.
export function judgeMethods(snapshot,proof,baseline=snapshot) {
  const b=baseline.benchmark;
  const output={qloo:proof.baseline,constraintOnly:proof.constraintOnly,
    llm:{status:'unavailable',available:false,selectedIds:[],interpretation:'No saved first-trial LLM control is published for this case.'},
    policyPointDelta:null,interpretation:diagnostic};
  if(!b)return output;
  const metadata={generation:b.generation,trialIndex:1,originalBriefDigest:b.briefDigest};
  if(!b.control?.selectedIds){
    const reason={
      unavailable:'The first model attempt was unavailable. No control has been substituted.',
      invalid_control:'The first model response was invalid. Its selection was not repaired.',
      not_comparable:'The original brief lacks comparable ranking evidence or uses an evidence-dependent constraint. No model call was made.',
    }[b.status]??'No valid saved model selection is available.';
    output.llm={...output.llm,...metadata,status:b.status,interpretation:reason};return output;
  }
  const sameBrief=digest(benchmarkBrief(snapshot,snapshot.memo.slate.constraints))===b.briefDigest;
  const evidenceChanged=digest({items:snapshot.memo.items,receipts:snapshot.receipts})!==digest({items:baseline.memo.items,receipts:baseline.receipts});
  const replay=!sameBrief||evidenceChanged;
  const evaluated=evaluateSelection(snapshot.memo.items,snapshot.memo.slate.constraints,b.control.selectedIds);
  const comparable=!replay&&completeRanks(snapshot)&&snapshot.memo.slate.feasible&&evaluated.feasible;
  output.llm={...metadata,...evaluated,status:evaluated.feasible?'feasible':'infeasible',available:true,
    mode:replay?'fixed_selection_replay':'saved_benchmark',sameBrief,evidenceChanged,comparable,
    identicalSelection:sameIds(evaluated.selectedIds,snapshot.memo.slate.selectedIds),
    interpretation:replay?'Fixed selection replay: the original first-trial LLM choices are checked against this experiment. The model was not rerun; this is not a new matched benchmark.'
      :'Saved first-trial control: the model selected from the same pool, fees and constraints without Qloo input. Scores are computed afterward using the declared policy.'};
  if(comparable)output.policyPointDelta=Math.round((proof.baseline.score-evaluated.score)*1e6)/1e6;
  return output;
}
