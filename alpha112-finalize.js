'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s,'utf8');
for(const n of ['test/sniper-arm-ui.test.js','test/shiny-cloud-integration.test.js']){
  let s=read(n);s=s.replaceAll("'3.0.0-alpha.11.1'","'3.0.0-alpha.11.2'");write(n,s);
}
const pkg=JSON.parse(read('package.json'));if(pkg.version!=='3.0.0-alpha.11.2')throw new Error('Alpha 11.2 finalizer expected 3.0.0-alpha.11.2, got '+pkg.version);
console.log('Gridium Alpha 11.2 test/version expectations normalized.');
