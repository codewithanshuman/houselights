import {createHash} from 'node:crypto';
import {judgeExperiment} from './judge.mjs';
import {benchmarkBrief} from './gm.mjs';
import {evaluateSelection,optimizeSlate} from './optimizer.mjs';

const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique=values=>[...new Set(values)];
const changed=(before,after)=>before.filter(id=>!after.includes(id)).length+after.filter(id=>!before.includes(id)).length;
const violationFields=['budget','availability','slots','genre'];

export function seededShockCases(exported){
  if(exported?.version!=='1.0'||!Array.isArray(exported.cases))throw new Error('Expected a version 1.0 judge case export.');
  return exported.cases.map(({title,snapshot})=>({id:digest({version:'1.0',title,snapshot}).slice(7,31),title,snapshot,synthetic:snapshot.mock===true,
    terms:'Illustrative fees, availability and genres. This is a planning experiment, not a booking or sales prediction.'}));
}

export function syntheticShockCases(source,baselines={}){
  if(source?.version!=='1.0'||!Array.isArray(source.cases)||source.cases.length<1||source.cases.length>10)throw new Error('Expected a bounded synthetic shock manifest.');
  return source.cases.map(row=>{
    if(!row.title?.startsWith('SYNTHETIC')||![10,11,12].includes(row.candidates?.length))throw new Error('Synthetic cases must be labeled and contain 10–12 candidates.');
    const items=row.candidates.map((candidate,index)=>({id:candidate.id,name:candidate.name,found:candidate.found===true,
      fit:candidate.fit,rank:index+1,rankCoverage:{complete:true,returned:row.candidates.length,requested:row.candidates.length},
      evidence:{rank:true,local:false,trends:false,comparison:false},evidenceReceipts:{rank:[]},receipts:[],
      terms:{fee:candidate.fee,genre:candidate.genre,available:true}}));
    const snapshot={mock:true,receipts:[],memo:{currency:row.currency,input:{city:row.city,anchors:['Synthetic audience preference'],anchorIds:[]},
      items,constraints:row.constraints,exampleBookingTerms:true}};
    snapshot.memo.slate=optimizeSlate(items,row.constraints);
    if(!snapshot.memo.slate.feasible)throw new Error(`Synthetic baseline is infeasible: ${row.title}.`);
    const id=digest({version:'synthetic-shock-v1',row}).slice(7,31),baseline=baselines[id];
    if(baseline?.status==='responded')snapshot.benchmark={status:'synthetic_control',control:{selectedIds:baseline.selectedIds},
      evidenceMode:'synthetic',briefDigest:baseline.briefDigest};
    return {id,title:row.title,snapshot,synthetic:true,
      terms:'Entirely synthetic stress test: fictional artists, invented taste utilities and illustrative terms. No Qloo finding or real quote.'};
  });
}

export function enumerateShocks(record){
  const slate=record.snapshot.memo.slate,selected=[...new Set([...slate.selectedIds,
    ...(record.snapshot.benchmark?.control?.selectedIds??[]).filter(id=>record.snapshot.memo.items.some(item=>item.id===id))])];
  if(!slate.feasible||!selected.length)throw new Error(`Seeded case ${record.title} has no feasible baseline.`);
  const budget=record.snapshot.memo.constraints.budget;
  return [
    ...[90,80,70].map(percent=>({id:`budget-${percent}`,kind:'budget',label:`Budget ${percent}%`,patch:{budget:Math.round(budget*percent)/100}})),
    ...selected.flatMap(id=>[
      {id:`cancel-${id}`,kind:'cancellation',label:`Cancel ${record.snapshot.memo.items.find(item=>item.id===id).name}`,patch:{cancelId:id}},
      {id:`fee-15-${id}`,kind:'fee_increase',label:`Raise ${record.snapshot.memo.items.find(item=>item.id===id).name} fee 15%`,patch:{feeIncreaseId:id}},
      {id:`unavailable-${id}`,kind:'unavailability',label:`Mark ${record.snapshot.memo.items.find(item=>item.id===id).name} unavailable`,patch:{unavailableId:id}}
    ])
  ];
}

function assessed(snapshot,ids,baselineIds){
  if(!Array.isArray(ids)||unique(ids).length!==ids.length||ids.some(id=>typeof id!=='string'||!snapshot.memo.items.some(item=>item.id===id)))
    return {status:'invalid_response',feasible:false,selectedIds:Array.isArray(ids)?ids:[],hardConstraintViolations:['candidate_id'],violationCount:1,
      violationCounts:Object.fromEntries(violationFields.map(code=>[code,0])),budgetOverage:null,actsChanged:null};
  const evaluation=evaluateSelection(snapshot.memo.items,snapshot.memo.constraints,ids);
  const hardConstraintViolations=evaluation.violationCodes;
  return {status:evaluation.feasible?'feasible':'infeasible',feasible:evaluation.feasible,selectedIds:ids,
    hardConstraintViolations,violationCount:hardConstraintViolations.length,
    violationCounts:Object.fromEntries(violationFields.map(code=>[code,Number(hardConstraintViolations.includes(code))])),
    budgetOverage:Math.max(0,Math.round(evaluation.knownFeeSubtotal*100)-Math.round(snapshot.memo.constraints.budget*100))/100,
    knownFeeSubtotal:evaluation.knownFeeSubtotal,actsChanged:changed(baselineIds,ids)};
}

const unavailable=status=>({status,feasible:false,selectedIds:[],hardConstraintViolations:[],violationCount:0,
  violationCounts:Object.fromEntries(violationFields.map(code=>[code,0])),budgetOverage:null,actsChanged:null});
const range=values=>values.length?[Math.min(...values),Math.max(...values)]:null;

export async function reproduceShocks(cases,{fixture={},reprompt,onCaptured,repeats=3}={}){
  if(!Number.isInteger(repeats)||repeats<3||repeats>5)throw new Error('Use 3–5 LLM repeats per shock.');
  const rows=[];
  for(const record of cases)for(const shock of enumerateShocks(record)){
    const experiment=judgeExperiment(record,shock.patch,{lightweight:true}),snapshot=experiment.snapshot;
    const qlooBaseline=record.snapshot.memo.slate.selectedIds,controlBaseline=record.snapshot.benchmark?.control?.selectedIds;
    const result=snapshot.memo.slate;
    // No selection when the exact solver reports infeasibility is an abstention,
    // not a valid lineup and not a constraint-violating proposed lineup.
    const houselights=result.feasible?assessed(snapshot,result.selectedIds,qlooBaseline):unavailable('abstained');
    houselights.survivorsPreserved=experiment.comparison.survivorsPreserved;
    const staticLlm=controlBaseline?assessed(snapshot,controlBaseline,controlBaseline):unavailable('unavailable');
    const brief=benchmarkBrief(snapshot,snapshot.memo.constraints),briefDigest=digest(brief),key=`${record.id}:${shock.id}`;
    const saved=fixture[key]??[];
    if(!Array.isArray(saved)||saved.length>repeats||saved.some(trial=>trial.briefDigest!==briefDigest))throw new Error(`Stale or malformed LLM fixture for ${key}.`);
    if(reprompt&&controlBaseline)for(let trial=saved.length;trial<repeats;trial++){
      const response=await reprompt({key,trial:trial+1,brief,briefDigest,record,shock});saved.push(response);fixture[key]=saved;
      await onCaptured?.();
    }
    const trials=controlBaseline?Array.from({length:repeats},(_,index)=>{
      const response=saved[index];
      return response?.status==='responded'?assessed(snapshot,response.selectedIds,controlBaseline):unavailable(response?.status??'not_captured');
    }):Array.from({length:repeats},()=>unavailable('not_comparable'));
    const responded=trials.filter(trial=>!['unavailable','not_captured','not_comparable'].includes(trial.status));
    const failures=responded.filter(trial=>trial.violationCount>0);
    const repromptedLlm={status:!controlBaseline?'not_comparable':responded.length===repeats?'complete':'partial',
      requestedTrials:repeats,respondedTrials:responded.length,feasibleTrials:responded.filter(trial=>trial.feasible).length,
      violationTrials:failures.length,failureRate:responded.length?failures.length/responded.length:null,
      totalHardConstraintViolations:responded.reduce((sum,trial)=>sum+trial.violationCount,0),
      distinctSelections:unique(responded.map(trial=>JSON.stringify(trial.selectedIds))).length,
      actsChangedRange:range(responded.map(trial=>trial.actsChanged).filter(Number.isFinite)),
      budgetOverageRange:range(responded.map(trial=>trial.budgetOverage).filter(Number.isFinite)),trials};
    rows.push({caseId:record.id,caseTitle:record.title,shock:{id:shock.id,kind:shock.kind,label:shock.label,patch:shock.patch},
      baseline:{houselights:qlooBaseline,staticLlm:controlBaseline??null},briefDigest,fixtureKey:controlBaseline?key:null,
      arms:{houselights,staticLlm,repromptedLlm},candidateCount:snapshot.memo.items.length,synthetic:record.synthetic===true,
      evidenceMode:record.synthetic===true?'synthetic':record.snapshot.benchmark?.evidenceMode??(record.snapshot.mock?'mock':'unknown')});
  }
  const summary=Object.fromEntries(['houselights','staticLlm'].map(arm=>{
    const values=rows.map(row=>row.arms[arm]);
    return [arm,{shocks:values.length,feasible:values.filter(value=>value.feasible).length,
      abstained:values.filter(value=>value.status==='abstained').length,
      unavailable:values.filter(value=>['unavailable','not_comparable','not_captured'].includes(value.status)).length,
      invalidOrInfeasible:values.filter(value=>['invalid_response','infeasible'].includes(value.status)).length,
      totalHardConstraintViolations:values.reduce((sum,value)=>sum+value.violationCount,0)}];
  }));
  const llmTrials=rows.flatMap(row=>row.arms.repromptedLlm.trials).filter(trial=>!['unavailable','not_comparable','not_captured'].includes(trial.status));
  summary.repromptedLlm={shocks:rows.length,requestedTrials:rows.length*repeats,respondedTrials:llmTrials.length,
    feasibleTrials:llmTrials.filter(trial=>trial.feasible).length,violationTrials:llmTrials.filter(trial=>trial.violationCount>0).length,
    totalHardConstraintViolations:llmTrials.reduce((sum,trial)=>sum+trial.violationCount,0),
    failureRate:llmTrials.length?llmTrials.filter(trial=>trial.violationCount>0).length/llmTrials.length:null};
  const large=rows.filter(row=>row.synthetic&&row.candidateCount===12).flatMap(row=>row.arms.repromptedLlm.trials)
    .filter(trial=>!['unavailable','not_comparable','not_captured'].includes(trial.status));
  const largeRate=large.length?Math.round(1000*large.filter(trial=>trial.violationCount>0).length/large.length)/10:null;
  const headline=summary.houselights.totalHardConstraintViolations===0&&largeRate!=null
    ?`0 hard-constraint violations and explicit infeasibility, versus ${largeRate}% for a re-prompted LLM at 12 candidates.`
    :'Constraint comparison at 12 candidates awaits captured LLM responses.';
  return {version:'2.0',headline,headlineDenominator:{candidateCount:12,returnedResponses:large.length,
      violationResponses:large.filter(trial=>trial.violationCount>0).length},
    methodology:'Deterministic single shocks across public real-data seeds and clearly labeled synthetic 10- and 12-candidate stress cases. Each shock targets the union of both original lineups. Houselights re-optimizes through judgeExperiment; the static LLM replays its saved first-trial lineup; the re-prompted LLM has three independent tool-free captures of the shocked brief. Failure rate counts responses that propose a hard-constraint violation, including invalid artist IDs; provider failures and missing responses are excluded and counted separately. Synthetic fit, fees, availability and artists are invented. Acts changed counts IDs in the symmetric difference from that arm’s original lineup. Abstention is not a feasible lineup.',
    note:'Houselights has zero proposed-lineup violations by construction: its exact optimizer only returns lineups that satisfy its constraints. This is an engineering property, not independent evidence of better attendance, revenue, or cultural demand.',
    summary,rows};
}

export function shocksMarkdown(result){
  const cell=value=>String(value??'—').replaceAll('|','\\|');
  const pct=value=>value==null?'—':`${(value*100).toFixed(1)}%`;
  const money=value=>value==null?'—':value.toFixed(2);
  const spread=value=>value?value.map(money).join('–'):'—';
  const h=result.summary.houselights,l=result.summary.repromptedLlm,s=result.summary.staticLlm;
  const lines=['# '+result.headline,'',`12-candidate headline denominator: ${result.headlineDenominator.violationResponses} violating responses out of ${result.headlineDenominator.returnedResponses} returned responses from a synthetic stress case.`,'',result.methodology,'',result.note,'',
    `Across ${h.shocks} deterministic shocks, Houselights returned ${h.feasible} feasible slates and explicitly abstained on ${h.abstained}; it proposed ${h.totalHardConstraintViolations} hard-constraint violations.`,
    `The re-prompted LLM returned ${l.respondedTrials}/${l.requestedTrials} requested responses: ${l.violationTrials} proposed a violation (${pct(l.failureRate)}), ${l.feasibleTrials} were feasible. The static first-trial lineup was feasible on ${s.feasible}/${s.shocks} shocks; it is a fixed-selection diagnostic.`,
    '', '| Case | Candidates | Shock | Houselights | Static LLM violation / overage | Re-prompted feasible / returned | Re-prompted failure rate | Re-prompted budget-overage spread | Selection spread |',
    '| --- | ---: | --- | --- | --- | ---: | ---: | --- | --- |'];
  for(const row of result.rows){
    const {houselights,staticLlm,repromptedLlm}=row.arms;
    lines.push(`| ${cell(row.caseTitle)}${row.synthetic?' **(synthetic)**':''} | ${row.candidateCount} | ${cell(row.shock.label)} | ${houselights.status}${houselights.feasible?` · ${houselights.actsChanged} IDs changed`:''} | ${cell(staticLlm.hardConstraintViolations.join(', ')||staticLlm.status)} / ${money(staticLlm.budgetOverage)} | ${repromptedLlm.feasibleTrials}/${repromptedLlm.respondedTrials} | ${pct(repromptedLlm.failureRate)} | ${spread(repromptedLlm.budgetOverageRange)} | ${cell(repromptedLlm.actsChangedRange?.join('–'))} |`);
  }
  lines.push('','The 12-candidate headline rate uses only returned proposals from the clearly labeled synthetic 12-candidate case; see `results/shocks.json` for every trial, violation code, overage and exact fixture key. Provider failures and the non-comparable Mumbai case are reported as missing, never counted as successes. The static LLM arm is a fixed-selection stress test, not a new model run.');
  return lines.join('\n')+'\n';
}
