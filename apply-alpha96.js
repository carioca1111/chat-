'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const dir=path.join(__dirname,'alpha96-parts');
const parts=['part00.b64','part01.b64','part02.b64'];
const b64=parts.map(n=>fs.readFileSync(path.join(dir,n),'utf8').trim()).join('');
eval(zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8'));
