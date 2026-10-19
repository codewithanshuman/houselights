import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const official = new URL('./mcp.js', import.meta.resolve('@qloo/qloo-harness'));
const output = new URL('build/qloo-adapter.mjs', root);
const lockDigest = createHash('sha256').update(readFileSync(new URL('package-lock.json', root))).digest('hex');
mkdirSync(new URL('build/', root), { recursive: true });
// Bundle the installed official adapter unchanged. No replacement schemas,
// credentials, runtime configuration, or provider responses enter this build.
const result = await build({ entryPoints: [fileURLToPath(official)], outfile: fileURLToPath(output),
  bundle: true, platform: 'node', format: 'esm', target: 'node24',
  minify: false, legalComments: 'eof', metafile: true });
const typebox = new URL(import.meta.resolve('typebox'));
const notices = [
  ['Qloo harness', new URL('../LICENSE', official)],
  ['Qloo third-party notices', new URL('../THIRD_PARTY_NOTICES.md', official)],
  ['TypeBox', new URL('../license', typebox)]
].map(([name,path])=>`${name}\n${readFileSync(path,'utf8')}`).join('\n\n');
writeFileSync(new URL('build/THIRD_PARTY_NOTICES.txt', root), notices);
writeFileSync(new URL('build/qloo-adapter.manifest.json', root), JSON.stringify({ lockDigest,
  inputs: Object.keys(result.metafile.inputs), bytes: Object.values(result.metafile.outputs).reduce((sum,file)=>sum+file.bytes,0) }, null, 2));
console.log('Built the installed official Qloo MCP adapter for bounded startup.');
