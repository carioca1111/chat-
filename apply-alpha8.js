'use strict';
const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'alpha8-parts');
const parts=Array.from({length:6},(_,i)=>path.join(dir,'part'+String(i).padStart(2,'0')+'.b64'));
const b64=parts.map(f=>fs.readFileSync(f,'utf8').replace(/\s+/g,'')).join('');
const src=Buffer.from(b64,'base64').toString('utf8');
new Function('require','process','__dirname','__filename',src)(require,process,__dirname,__filename);
