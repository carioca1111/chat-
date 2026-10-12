'use strict';
const fs=require('fs');
const z=require('zlib');
const src=fs.readFileSync('apply-alpha911.js','utf8');
const m=src.match(/Buffer\.from\('([^']+)'\s*,\s*'base64'\)/);
if(!m) throw new Error('Compressed Alpha 9.11 payload not found');
const decoded=z.gunzipSync(Buffer.from(m[1],'base64')).toString('utf8');
fs.writeFileSync('alpha911-readable.js',decoded,'utf8');
console.log('Decoded',decoded.length,'bytes');
