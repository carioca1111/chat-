'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const src=path.resolve(process.argv[2]||'hunt-backgrounds.zip');
const out=path.resolve(process.argv[3]||'gridium-build/assets/hunt/backgrounds');

// The staged carrier can legitimately lose the ZIP central directory because the
// asset bundle is stored as split Base64 text. Recover from local-file headers and
// validate each payload against the CRC32 + uncompressed size stored in that header.
// This verifies the actual bytes that ZIP wrote, without coupling the build to one
// encoder-specific WebP SHA-256. Runtime backgrounds must still be valid 400x225 WebPs.
const expectedNames=new Set([
  'hunt-beach.webp','hunt-cave.webp','hunt-default.webp','hunt-desert.webp',
  'hunt-forest.webp','hunt-ice.webp','hunt-lake.webp','hunt-meadow.webp',
  'hunt-mountain.webp','hunt-ruins.webp','hunt-swamp.webp','hunt-volcano.webp'
]);

const b=fs.readFileSync(src);fs.mkdirSync(out,{recursive:true});
const sig=Buffer.from([0x50,0x4b,0x03,0x04]);
const positions=[];for(let p=0;(p=b.indexOf(sig,p))>=0;p+=4)positions.push(p);

const crcTable=(()=>{
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);
    t[n]=c>>>0;
  }
  return t;
})();
function crc32(buf){
  let c=0xffffffff;
  for(const byte of buf)c=crcTable[(c^byte)&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}
function sha256(x){return crypto.createHash('sha256').update(x).digest('hex')}
function webpSize(x){
  if(x.length<30||x.toString('ascii',0,4)!=='RIFF'||x.toString('ascii',8,12)!=='WEBP')return null;
  const kind=x.toString('ascii',12,16);
  if(kind==='VP8X')return {w:1+x.readUIntLE(24,3),h:1+x.readUIntLE(27,3)};
  if(kind==='VP8L'){const v=x.readUInt32LE(21);return {w:1+(v&0x3fff),h:1+((v>>>14)&0x3fff)}};
  if(kind==='VP8 '){for(let i=20;i+9<x.length&&i<40;i++)if(x[i]===0x9d&&x[i+1]===0x01&&x[i+2]===0x2a)return {w:x.readUInt16LE(i+3)&0x3fff,h:x.readUInt16LE(i+5)&0x3fff}}
  return null;
}

const found=new Map();
const diagnostics=[];
for(let ix=0;ix<positions.length;ix++){
  const p=positions[ix];
  if(p+30>b.length)continue;
  const flags=b.readUInt16LE(p+6);
  const method=b.readUInt16LE(p+8);
  const headerCrc=b.readUInt32LE(p+14)>>>0;
  const compSize=b.readUInt32LE(p+18);
  const rawSize=b.readUInt32LE(p+22);
  const nameLen=b.readUInt16LE(p+26);
  const extraLen=b.readUInt16LE(p+28);
  const nameStart=p+30,nameEnd=nameStart+nameLen;
  if(nameEnd>b.length)continue;
  const entry=b.toString('utf8',nameStart,nameEnd).replace(/\\/g,'/');
  const base=path.posix.basename(entry);
  if(!expectedNames.has(base))continue;

  // These generated asset entries are expected to carry concrete sizes in the
  // local header. If bit 3 is set and sizes are deferred to a data descriptor,
  // do not guess boundaries from arbitrary bytes; fail closed instead.
  if((flags&8)||!compSize||!rawSize){
    diagnostics.push({base,reason:'deferred-size-or-empty-local-header',flags,compSize,rawSize});
    continue;
  }
  const dataStart=nameEnd+extraLen,dataEnd=dataStart+compSize;
  if(dataEnd>b.length){diagnostics.push({base,reason:'truncated-packed-data',compSize});continue;}
  const packed=b.subarray(dataStart,dataEnd);
  let raw;
  try{
    if(method===0)raw=packed;
    else if(method===8)raw=zlib.inflateRawSync(packed);
    else {diagnostics.push({base,reason:'unsupported-compression',method});continue;}
  }catch(e){diagnostics.push({base,reason:'inflate-failed',message:String(e&&e.message||e)});continue;}

  const actualCrc=crc32(raw);
  if(raw.length!==rawSize){diagnostics.push({base,reason:'size-mismatch',expected:rawSize,actual:raw.length});continue;}
  if(actualCrc!==headerCrc){diagnostics.push({base,reason:'crc32-mismatch',expected:headerCrc,actual:actualCrc});continue;}
  const dim=webpSize(raw);
  if(!dim||dim.w!==400||dim.h!==225){diagnostics.push({base,reason:'invalid-webp-dimensions',dim});continue;}

  const digest=sha256(raw);
  const previous=found.get(base);
  if(previous&&previous.sha256!==digest)throw new Error(`Alpha 11.7: entradas conflitantes para ${base}`);
  found.set(base,{raw,sha256:digest,crc32:actualCrc,size:raw.length});
}

const missing=[...expectedNames].filter(n=>!found.has(n));
if(missing.length){
  const relevant=diagnostics.filter(d=>missing.includes(d.base));
  throw new Error(`Alpha 11.7: staging não contém 12 WebPs íntegros (${missing.join(', ')}). Diagnóstico: ${JSON.stringify(relevant)}`);
}
for(const [name,item] of [...found].sort(([a],[b])=>a.localeCompare(b)))fs.writeFileSync(path.join(out,name),item.raw);
console.log(JSON.stringify({
  ok:true,
  files:found.size,
  size:'400x225',
  integrity:'ZIP local-header CRC32 + uncompressed size + WebP dimensions',
  sha256:Object.fromEntries([...found].sort(([a],[b])=>a.localeCompare(b)).map(([name,item])=>[name,item.sha256]))
},null,2));
