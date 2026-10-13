'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target=path.resolve(process.argv[2]||'gridium-build');
const packageFile=path.join(target,'package.json');
const current=JSON.parse(fs.readFileSync(packageFile,'utf8')).version;
if(!['3.0.0-alpha.9.11','3.0.0-alpha.9.12','3.0.0-alpha.9.13'].includes(current))throw new Error(`Expected Alpha 9.11/9.12 base before Alpha 9.13, got ${current}`);
const manifest=require('./alpha913-manifest.json');
for(const [name,expected] of Object.entries(manifest)){
 const file=path.join(__dirname,'alpha913-src',name);
 const text=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
 const actual=crypto.createHash('sha256').update(text).digest('hex');
 if(actual!==expected)throw new Error(`Alpha 9.13 source hash mismatch: ${name}`);
}
for(const name of Object.keys(manifest)){
 const dest=path.join(target,name);fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(path.join(__dirname,'alpha913-src',name),dest);
}
console.log(`Alpha 9.13 applied: ${Object.keys(manifest).length} verified payload files`);
