'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target=path.resolve(process.argv[2]||'gridium-build'),version=JSON.parse(fs.readFileSync(path.join(target,'package.json'),'utf8')).version;
if(!['3.0.0-alpha.9.11','3.0.0-alpha.9.12'].includes(version))throw new Error('Assemble Alpha 9.11 before applying Alpha 9.12: '+version);
const manifest=require('./alpha912-manifest.json');
// Validate every source before mutating the assembled application.
for(const [name,hash] of Object.entries(manifest)){const content=fs.readFileSync(path.join(__dirname,'alpha912-src',name),'utf8').replace(/\r\n/g,'\n');if(crypto.createHash('sha256').update(content).digest('hex')!==hash)throw new Error('Alpha 9.12 integrity check failed: '+name);}
for(const name of Object.keys(manifest)){const dest=path.join(target,name);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(__dirname,'alpha912-src',name),dest);}
console.log('Alpha 9.12 applied and source integrity verified');
