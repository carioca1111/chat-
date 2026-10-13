'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'gridium-build'));
for(const name of ['main.js','index.html','sniper-runtime.js','sniper-dedicated.js']){
  const file=path.join(root,name);
  if(!fs.existsSync(file))throw new Error('UX3 normalize: arquivo ausente '+name);
  const text=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
  fs.writeFileSync(file,text,'utf8');
}
console.log('Sniper UX3 inputs normalized to LF.');
