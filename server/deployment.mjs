import {readdirSync,lstatSync,mkdirSync,copyFileSync,writeFileSync,realpathSync} from 'node:fs';
import {resolve,join,relative,extname,sep} from 'node:path';
import {isIP} from 'node:net';

export function vercelFrontendConfig(backend){
  let url;try{url=new URL(backend);}catch{throw new Error('Provide the public HTTPS backend origin.');}
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.port||
    isIP(url.hostname)||! /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(url.hostname)||/\.(local|localhost|internal)$/i.test(url.hostname))
    throw new Error('Backend must be a public HTTPS hostname with no path, port, credentials or query.');
  return {$schema:'https://openapi.vercel.sh/vercel.json',framework:null,buildCommand:null,installCommand:null,outputDirectory:'public',
    rewrites:[{source:'/api/:path*',destination:url.origin+'/api/:path*'},{source:'/healthz',destination:url.origin+'/healthz'},{source:'/m/:id',destination:'/index.html'}],
    headers:[{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'no-referrer'}]},
      {source:'/api/:path*',headers:[{key:'Cache-Control',value:'no-store'}]},{source:'/healthz',headers:[{key:'Cache-Control',value:'no-store'}]}]};
}

export function prepareVercelFrontend({publicDir,outputDir,backend}){
  const config=vercelFrontendConfig(backend),source=realpathSync(publicDir),output=resolve(outputDir);
  if(output===source||output.startsWith(source+sep))throw new Error('Output must be outside the source public directory.');
  const files=[];
  const walk=dir=>{
    for(const name of readdirSync(dir)){
      const path=join(dir,name),stat=lstatSync(path);
      if(stat.isSymbolicLink())throw new Error('Public assets must not contain symbolic links.');
      if(name.startsWith('.'))throw new Error('Hidden files are not permitted in the public deployment.');
      if(stat.isDirectory())walk(path);
      else if(stat.isFile()&&['.html','.css','.js','.png','.jpg','.jpeg','.gif','.svg','.webp','.ico','.woff','.woff2','.md'].includes(extname(name).toLowerCase()))files.push(relative(source,path));
      else throw new Error('Unexpected file type in public assets: '+name);
    }
  };walk(source);
  if(!files.includes('index.html')||!files.includes('review.html'))throw new Error('Application and blind-review entry points are required.');
  // A new directory only: never merge a release with an old build or private files.
  mkdirSync(output,{recursive:false});
  for(const file of files){const target=join(output,'public',file);mkdirSync(resolve(target,'..'),{recursive:true});copyFileSync(join(source,file),target);}
  writeFileSync(join(output,'vercel.json'),JSON.stringify(config,null,2));
  return {outputDir:output,files:files.length,backend:new URL(backend).origin,publiclyDeployed:false};
}
