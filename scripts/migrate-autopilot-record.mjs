// One-off, auditable migration of the 1.0 recorded Autopilot run to the 2.0
// integrity format. Content is copied unchanged; a manifest is added and tied to
// the exact Git blob of the committed 1.0 file, so the migration can be checked.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildManifest } from '../server/autopilot-integrity.mjs';

const repo = resolve(import.meta.dirname, '..');
const commit = process.argv[2] ?? '176859c37cffd3ff7f455bd6dfbae661ca494976';
const path = 'public/autopilot-recorded.json';
const git = args => execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
const blob = git(['rev-parse', `${commit}:${path}`]).trim();
const file = JSON.parse(git(['show', `${commit}:${path}`]));
if (file.run?.version !== '1.0') throw new Error('Expected a 1.0 record.');
// The committed record's source receipts are the published case projection.
const cases = JSON.parse(git(['show', `${commit}:deploy/judge-cases.json`])).cases;
const source = cases.find(row => row.title === file.caseTitle);
file.run.integrity = buildManifest({ receipts: file.run.receipts, sourceReceipts: source?.snapshot.receipts ?? [], decisionDigest: file.run.digest, items: file.run.items });
file.migration = { fromVersion: '1.0', toIntegrityVersion: file.run.integrity.version, sourceCommit: commit, sourceGitBlob: blob, sourcePath: path,
  note: 'Run content is byte-for-byte the committed 1.0 record apart from the added integrity manifest and this note. The 1.0 decision digest did not cover receipt numbers; the manifest does. Replay of this record uses the 1.0 research policy and checks research reproducibility only.' };
const output = join(repo, 'results', 'autopilot-recorded-v1.json');
writeFileSync(output, JSON.stringify(file, null, 2) + '\n');
console.log(JSON.stringify({ output, sourceCommit: commit, sourceGitBlob: blob, manifestDigest: file.run.integrity.manifestDigest }, null, 2));
