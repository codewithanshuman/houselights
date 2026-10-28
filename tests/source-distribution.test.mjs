import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { sourceProtection } from '../scripts/verify-recorded-source.mjs';

test('secret scanning works in a Git-free export, skips private/runtime directories and never prints matched secrets', () => {
  const directory=mkdtempSync(join(tmpdir(),'houselights-export-scan-'));
  try {
    cpSync(new URL('../scripts/secret-scan.mjs',import.meta.url),join(directory,'scan.mjs'));
    const secret='gsk_'+createHash('sha256').update('distribution regression input').digest('hex');
    writeFileSync(join(directory,'safe.js'),'export const value=1;');
    for(const folder of ['data','node_modules','artifacts']){mkdirSync(join(directory,folder));writeFileSync(join(directory,folder,'private.txt'),secret);}
    const run=()=>spawnSync(process.execPath,['scan.mjs'],{cwd:directory,encoding:'utf8',timeout:30000,windowsHide:true});
    const safe=run();assert.equal(safe.status,0,safe.stderr);assert.match(safe.stdout,/filesystem source files/);
    writeFileSync(join(directory,'exposed.js'),`const credential = "${secret}";`);
    const exposed=run();assert.equal(exposed.status,1);assert.match(exposed.stderr,/exposed.js:1: possible Groq key/);
    assert.ok(!(exposed.stdout+exposed.stderr).includes(secret));
  } finally {rmSync(directory,{recursive:true,force:true});}
});

test('a Git-free original reports Git protection as unverified and refuses publicly placed originals', () => {
  const directory=mkdtempSync(join(tmpdir(),'houselights-export-source-'));
  try {
    const original=join(directory,'private-original.json');writeFileSync(original,'{}');
    assert.deepEqual(sourceProtection(original,directory),{gitProtectionVerified:false,ignored:null,tracked:null});
    mkdirSync(join(directory,'public'));const exposed=join(directory,'public','original.json');writeFileSync(exposed,'{}');
    assert.throws(()=>sourceProtection(exposed,directory),/outside published source directories/);
    mkdirSync(join(directory,'private'));writeFileSync(join(directory,'private','original.json'),'{}');
    symlinkSync(join(directory,'private'),join(directory,'public','source-link'),process.platform==='win32'?'junction':'dir');
    assert.throws(()=>sourceProtection(join(directory,'public','source-link','original.json'),directory),/outside published source directories/);
  } finally {rmSync(directory,{recursive:true,force:true});}
});
