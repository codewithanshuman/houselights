import {createHash} from 'node:crypto';
import {judgeExperiment} from './judge.mjs';
import {benchmarkBrief} from './gm.mjs';
import {evaluateSelection} from './optimizer.mjs';

const digest=value=>'sha256:'+createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unique=values=>[...new Set(values)];
const changed=(before,after)=>before.filter(id=>!after.includes(id)).length+after.filter(id=>!before.includes(id)).length;
const violationFields=['budget','availability','slots','genre'];

export function seededShockCases(exported){
  if(exported?.version!=='1.0'||!Array.isArray(exported.cases))throw new Error('Expected a version 1.0 judge case export.');
  return exported.cases.map(({title,snapshot})=>({id:digest({version:'1.0',title,snapshot}).slice(7,31),title,snapshot,
    terms:'Illustrative fees, availability and genres. This is a planning experiment, not a booking or sales prediction.'}));
}

export function enumerateShocks(record){
  const slate=record.snapshot.memo.slate,selected=slate.selectedIds;
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
    return {status:'invalid_response',feasible:false,selectedIds:Array.isArray(ids)?ids:[],hardConstraintViolations:['candidate_id'],violationCount:1,actsChanged:null};
  const evaluation=evaluateSelection(snapshot.memo.items,snapshot.memo.constraints,ids);
  const hardConstraintViolations=evaluation.violationCodes;
  return {status:evaluation.feasible?'feasible':'infeasible',feasible:evaluation.feasible,selectedIds:ids,
    hardConstraintViolations,violationCount:hardConstraintViolations.length,
    violationCounts:Object.fromEntries(violationFields.map(code=>[code,Number(hardConstraintViolations.includes(code))])),
    actsChanged:changed(baselineIds,ids)};
}

export async function reproduceShocks(cases,{fixture={},reprompt}={}){
  const rows=[];
  for(const record of cases)for(const shock of enumerateShocks(record)){
    const experiment=judgeExperiment(record,shock.patch),snapshot=experiment.snapshot;
    const qlooBaseline=record.snapshot.memo.slate.selectedIds,controlBaseline=record.snapshot.benchmark?.control?.selectedIds;
    const result=snapshot.memo.slate;
    // No selection when the exact solver reports infeasibility is an abstention,
    // not a valid lineup and not a constraint-violating proposed lineup.
    const houselights=result.feasible?assessed(snapshot,result.selectedIds,qlooBaseline):{
      status:'abstained',feasible:false,selectedIds:[],hardConstraintViolations:[],violationCount:0,
      violationCounts:Object.fromEntries(violationFields.map(code=>[code,0])),actsChanged:null};
    houselights.survivorsPreserved=experiment.comparison.survivorsPreserved;
    const staticLlm=controlBaseline?assessed(snapshot,controlBaseline,controlBaseline):{
      status:'unavailable',feasible:false,selectedIds:[],hardConstraintViolations:[],violationCount:0,
      violationCounts:Object.fromEntries(violationFields.map(code=>[code,0])),actsChanged:null};
    const brief=benchmarkBrief(snapshot,snapshot.memo.constraints),briefDigest=digest(brief),key=`${record.id}:${shock.id}`;
    let saved=fixture[key];
    if(saved&&saved.briefDigest!==briefDigest)throw new Error(`Stale LLM fixture for ${key}.`);
    if(!saved&&reprompt&&controlBaseline){saved=await reprompt({key,brief,briefDigest,record,shock});fixture[key]=saved;}
    const repromptedLlm=!controlBaseline?{status:'not_comparable',feasible:false,selectedIds:[],hardConstraintViolations:[],violationCount:0,
      violationCounts:Object.fromEntries(violationFields.map(code=>[code,0])),actsChanged:null}
      :saved?.status==='responded'?assessed(snapshot,saved.selectedIds,controlBaseline)
      :{status:saved?.status||'not_captured',feasible:false,selectedIds:[],hardConstraintViolations:[],violationCount:0,
        violationCounts:Object.fromEntries(violationFields.map(code=>[code,0])),actsChanged:null};
    rows.push({caseId:record.id,caseTitle:record.title,shock:{id:shock.id,kind:shock.kind,label:shock.label,patch:shock.patch},
      baseline:{houselights:qlooBaseline,staticLlm:controlBaseline??null},briefDigest,fixtureKey:controlBaseline?key:null,
      arms:{houselights,staticLlm,repromptedLlm},
      evidenceMode:record.snapshot.benchmark?.evidenceMode??(record.snapshot.mock?'mock':'unknown')});
  }
  const summary=Object.fromEntries(['houselights','staticLlm','repromptedLlm'].map(arm=>{
    const values=rows.map(row=>row.arms[arm]);
    return [arm,{shocks:values.length,feasible:values.filter(value=>value.feasible).length,
      abstained:values.filter(value=>value.status==='abstained').length,
      unavailable:values.filter(value=>['unavailable','not_comparable','not_captured'].includes(value.status)).length,
      invalidOrInfeasible:values.filter(value=>['invalid_response','infeasible'].includes(value.status)).length,
      totalHardConstraintViolations:values.reduce((sum,value)=>sum+value.violationCount,0)}];
  }));
  return {version:'1.0',methodology:'Deterministic single shocks against public seeded judge cases. Fees and availability are illustrative. Houselights re-optimizes through judgeExperiment; the static LLM replays its saved first-trial lineup; the re-prompted LLM uses a captured tool-free response to the shocked brief. Acts changed counts IDs in the symmetric difference from that arm’s original lineup. Abstention is not a feasible lineup and is not counted as a hard-constraint violation.',
    note:'Houselights has zero proposed-lineup violations by construction: its exact optimizer only returns lineups that satisfy its constraints. This is an engineering property, not independent evidence of better attendance, revenue, or cultural demand.',
    summary,rows};
}

export function shocksMarkdown(result){
  const cell=value=>String(value??'—').replaceAll('|','\\|');
  const lines=['# Deterministic shock replay','',result.methodology,'',result.note,'',
    '| Arm | Shocks | Feasible | Abstained | Invalid or infeasible | Unavailable | Hard violations |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...Object.entries(result.summary).map(([arm,s])=>`| ${arm} | ${s.shocks} | ${s.feasible} | ${s.abstained} | ${s.invalidOrInfeasible} | ${s.unavailable} | ${s.totalHardConstraintViolations} |`),
    '', '| Case | Shock | Arm | Status | Feasible | Hard violations | Acts changed |',
    '| --- | --- | --- | --- | --- | --- | ---: |'];
  for(const row of result.rows)for(const [arm,value] of Object.entries(row.arms))
    lines.push(`| ${cell(row.caseTitle)} | ${cell(row.shock.label)} | ${arm} | ${value.status} | ${value.feasible?'yes':'no'} | ${cell(value.hardConstraintViolations.join(', ')||'none')} | ${cell(value.actsChanged)} |`);
  lines.push('','The static LLM arm is a fixed-selection stress test, not a new model run. Cases without a published comparable LLM control remain unavailable. A re-prompted response is reported only when a live provider response has been captured and matched to the exact shocked brief.');
  return lines.join('\n')+'\n';
}
