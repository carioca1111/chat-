'use strict';
const fs=require('fs');
const path=require('path');
const dir=path.join(__dirname,'alpha4-chunks');
const parts=fs.readdirSync(dir).filter(x=>/^part\d+\.b64$/.test(x)).sort();
if(parts.length!==8)throw new Error(`Alpha 4 chunks: esperado 8, achou ${parts.length}`);
const source=Buffer.from(parts.map(x=>fs.readFileSync(path.join(dir,x),'utf8').trim()).join(''),'base64').toString('utf8');
eval(source);
