import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {prepareVercelFrontend} from '../server/deployment.mjs';
const backend=process.argv[2],outputDir=process.argv[3]??`artifacts/vercel-${Date.now()}`;
if(!backend)throw new Error('Usage: npm run deploy:prepare-vercel -- https://your-backend-host <new-output-directory>');
mkdirSync('artifacts',{recursive:true});
console.log(JSON.stringify(prepareVercelFrontend({publicDir:fileURLToPath(new URL('../public',import.meta.url)),outputDir,backend}),null,2));
