import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {vercelFrontendConfig,prepareVercelFrontend} from '../server/deployment.mjs';
test('Vercel rewrites forward API and health paths while saved decisions remain static',()=>{
 const c=vercelFrontendConfig('https://backend.example.com/');
 assert.equal(c.outputDirectory,'public');assert.equal(c.rewrites[0].destination,'https://backend.example.com/api/:path*');
 assert.equal(c.rewrites[2].destination,'/index.html');
 for(const url of ['http://example.com','https://127.0.0.1','https://localhost','https://host.local','https://user:secret@example.com','https://example.com/api','https://example.com/?token=x','https://example.com/#token','https://example.com:8082'])assert.throws(()=>vercelFrontendConfig(url));
});
test('deployment output includes public assets only and refuses an existing release',()=>{
 const dir=mkdtempSync(join(tmpdir(),'houselights-deploy-'));try{
  const publicDir=join(dir,'public'),outputDir=join(dir,'release');mkdirSync(publicDir);
  writeFileSync(join(dir,'.env'),'TEST_SECRET=private');writeFileSync(join(dir,'houselights.sqlite'),'private');
  for(const file of ['index.html','review.html','app.js'])writeFileSync(join(publicDir,file),'fixture');
  const args={publicDir,outputDir,backend:'https://backend.example.com'};const result=prepareVercelFrontend(args);
  assert.equal(result.files,3);assert.equal(result.publiclyDeployed,false);assert.equal(existsSync(join(outputDir,'.env')),false);
  assert.equal(existsSync(join(outputDir,'houselights.sqlite')),false);assert.equal(readFileSync(join(outputDir,'public','app.js'),'utf8'),'fixture');
  assert.throws(()=>prepareVercelFrontend(args));assert.throws(()=>prepareVercelFrontend({...args,outputDir:join(publicDir,'nested')}));
  writeFileSync(join(publicDir,'.env'),'private');assert.throws(()=>prepareVercelFrontend({...args,outputDir:join(dir,'new')}),/Hidden/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
