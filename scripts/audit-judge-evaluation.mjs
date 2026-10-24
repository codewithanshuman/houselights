import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const dir=mkdtempSync(join(tmpdir(),'houselights-evaluation-audit-'));
process.env.DATA_DIR=dir;
let db;
try{
  const {publishJudgeCase,judgeExperiment}=await import('../server/judge.mjs');
  const {enumerateShocks}=await import('../server/shocks.mjs');
  const {evaluateSelection}=await import('../server/optimizer.mjs');
  db=(await import('../server/database.mjs')).db;
  const manifest=JSON.parse(readFileSync('deploy/judge-cases.json','utf8'));
  const cases=manifest.cases.map(row=>publishJudgeCase(row.snapshot,row.title));
  const rows=[],reviewEligible=[];
  const originalDigest=JSON.stringify(manifest);
  for(const record of cases){
    if(record.methods.llm.comparable&&!record.snapshot.mock)reviewEligible.push({caseId:record.id,title:record.title});
    for(const shock of enumerateShocks(record)){
      const replay=judgeExperiment(record,shock.patch,{lightweight:true}),snapshot=replay.snapshot;
      const original=record.snapshot;
      assert.deepEqual(snapshot.memo.items.map(item=>item.id),original.memo.items.map(item=>item.id));
      assert.equal(snapshot.memo.currency,original.memo.currency);
      for(const key of ['slots','maxPerGenre','discoveryMin','riskTolerance'])assert.deepEqual(snapshot.memo.constraints[key],original.memo.constraints[key]);
      for(const [index,item] of snapshot.memo.items.entries()){
        const expected=structuredClone(original.memo.items[index].terms);
        if(shock.patch.feeIncreaseId===item.id)expected.fee=Math.round(expected.fee*115)/100;
        if(shock.patch.unavailableId===item.id)expected.available=false;
        assert.deepEqual(item.terms,expected);
      }
      assert.deepEqual(snapshot.receipts,original.receipts);
      const assessment=ids=>{
        const assessed=evaluateSelection(snapshot.memo.items,snapshot.memo.constraints,ids);
        return {feasible:assessed.feasible,violations:assessed.violationCodes,
          budgetOverage:Math.max(0,Math.round(assessed.knownFeeSubtotal*100)-Math.round(snapshot.memo.constraints.budget*100))/100,
          selectedIds:ids};
      };
      const slate=snapshot.memo.slate;
      const full=slate.feasible?{status:'selection',...assessment(slate.selectedIds)}:{status:'explicit_infeasibility',selectedIds:[],violations:[],budgetOverage:null};
      assert.equal(full.violations.length,0);
      const control=record.snapshot.benchmark?.control?.selectedIds;
      rows.push({caseId:record.id,shockId:shock.id,patch:shock.patch,houselights:full,
        staticLlm:control?{status:'fixed_selection_replay',...assessment(control)}:{status:'unavailable'},
        matchedInputs:true,providerCalls:0});
    }
  }
  assert.equal(JSON.stringify(manifest),originalDigest);
  const report={version:'judge-evaluation-audit-v1',sourceManifestDigest:'sha256:'+createHash('sha256').update(originalDigest).digest('hex'),cases:cases.length,cities:new Set(cases.map(row=>row.snapshot.memo.input.city)).size,
    shocks:rows.length,feasibleDecisions:rows.filter(row=>row.houselights.status==='selection').length,
    explicitInfeasibilities:rows.filter(row=>row.houselights.status==='explicit_infeasibility').length,
    houselightsViolations:rows.reduce((n,row)=>n+row.houselights.violations.length,0),reviewEligible,
    genuineReviewJudgments:0,observedSalesOutcomes:0,rows,
    limitations:['Dependent stress replays of five saved briefs, not additional independent markets.',
      'Zero proposed-lineup violations follows from an exact constraint optimizer; explicit infeasibility is reported separately.',
      'Static LLM selections are not re-prompted under shocks. No fresh LLM superiority comparison is made.',
      'New recorded case has no matched first-trial LLM control. Review eligibility excludes it and incomplete controls.',
      'Reviewers have not been recruited. No ballots or event outcomes are inferred from this audit.']};
  writeFileSync('results/judge-evaluation-audit.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,cases:report.cases,cities:report.cities,shocks:report.shocks,
    feasibleDecisions:report.feasibleDecisions,explicitInfeasibilities:report.explicitInfeasibilities,
    houselightsViolations:report.houselightsViolations,reviewEligible:reviewEligible.length,providerCalls:0}));
}finally{db?.close();rmSync(dir,{recursive:true,force:true});}
