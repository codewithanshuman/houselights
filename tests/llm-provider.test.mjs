import test from 'node:test';
import assert from 'node:assert/strict';
import { askJson, llmConfiguration } from '../server/llm.mjs';
test('Groq sends a tools-free JSON request and records real response provenance without secrets',async()=>{
  process.env.LLM_PROVIDER='groq';process.env.GROQ_API_KEY='test-secret';process.env.LLM_MODEL='openai/gpt-oss-120b';delete process.env.LLM_MODE;
  let request;
  const result=await askJson('JSON only','{"brief":"test"}',1000,{fetcher:async(url,options)=>{
    request={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({id:'response-test',model:'openai/gpt-oss-120b',usage:{total_tokens:12},choices:[{message:{content:'{"selectedIds":["a"]}'},finish_reason:'stop'}]}),{headers:{'x-request-id':'request-test'}});
  }});
  assert.equal(result.status,'responded');assert.match(request.url,/api.groq.com/);assert.equal(request.body.tools,undefined);assert.equal(request.body.response_format.type,'json_object');
  assert.equal(result.receipt.requestId,'request-test');assert.equal(result.receipt.usage.total_tokens,12);assert.ok(result.receipt.responseDigest.startsWith('sha256:'));assert.ok(!JSON.stringify(result).includes('test-secret'));
});
test('rate limits, truncation, malformed JSON and missing config are distinct and never fabricate a control',async()=>{
  const limited=await askJson('JSON','{}',500,{fetcher:async()=>new Response('',{status:429,headers:{'retry-after':'30'}})});
  assert.equal(limited.proposal,null);assert.equal(limited.receipt.retryAfter,'30');assert.equal(limited.receipt.status,'provider_error');
  for(const [content,finish_reason,expected] of [['{}','length','truncated_output'],['not json','stop','invalid_json']]){
    const result=await askJson('JSON','{}',500,{fetcher:async()=>new Response(JSON.stringify({choices:[{message:{content},finish_reason}]}))});assert.equal(result.receipt.status,expected);assert.equal(result.proposal,null);
  }
  delete process.env.GROQ_API_KEY;assert.equal(llmConfiguration().enabled,false);
  const absent=await askJson('JSON','{}',500,{fetcher:async()=>{throw new Error('Must not call');}});assert.equal(absent.receipt.mode,'not_called');
});
test('investigation uses one native local function call and rejects unexpected function names',async()=>{
  process.env.LLM_PROVIDER='groq';process.env.GROQ_API_KEY='test-secret';process.env.LLM_MODEL='openai/gpt-oss-120b';delete process.env.LLM_MODE;
  const actionSchema={type:'object',properties:{tool:{type:'string'},args:{type:'object'}},required:['tool','args']};
  for(const name of ['submit_investigation_action','send_email']){
    const result=await askJson('Use local action','{}',1600,{actionSchema,fetcher:async(_url,request)=>{
      const body=JSON.parse(request.body);assert.equal(body.tools.length,1);assert.equal(body.parallel_tool_calls,false);assert.equal(body.response_format,undefined);
      return new Response(JSON.stringify({choices:[{message:{tool_calls:[{function:{name,arguments:'{"tool":"decision_proof","args":{}}'}}]},finish_reason:'tool_calls'}]}));
    }});
    assert.equal(result.status,name==='submit_investigation_action'?'responded':'unavailable');assert.equal(result.receipt.toolsAllowed,true);
  }
  process.env.LLM_PROVIDER='anthropic';process.env.ANTHROPIC_API_KEY='test-secret';process.env.LLM_MODEL='test-model';
  const result=await askJson('Use local action','{}',1600,{actionSchema,fetcher:async(_url,request)=>{
    const body=JSON.parse(request.body);assert.equal(body.tool_choice.name,'submit_investigation_action');
    return new Response(JSON.stringify({content:[{type:'tool_use',name:'submit_investigation_action',input:{tool:'decision_proof',args:{}}}],stop_reason:'tool_use'}));
  }});assert.equal(result.proposal.tool,'decision_proof');
});
