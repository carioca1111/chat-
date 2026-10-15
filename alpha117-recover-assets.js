'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const src=path.resolve(process.argv[2]||'hunt-backgrounds.zip');
const out=path.resolve(process.argv[3]||'gridium-build/assets/hunt/backgrounds');
// Runtime WebPs are the 400x225 attached backgrounds recompressed at WebP q82/method6
// to avoid shipping the much larger source WebPs. These SHA-256 values are over
// the runtime derivatives, not the original source files kept by the user.
const expected={
 'hunt-beach.webp':'a8634fc2868cf25afe9f6438a35feff3a25ca621f64386d15abee6cf624ca2d6',
 'hunt-cave.webp':'dd8ea7569106f664cf9c404d754414f524e65b5c4542eedff9affad4741eef24',
 'hunt-default.webp':'a275e41daef46aaad3160cafd22a453bba15b45ae49dc210d5201c0d1f18a978',
 'hunt-desert.webp':'8b600925bdf2a2005f1a237e3306a08c13a638387a103f35c38184fb707162f0',
 'hunt-forest.webp':'235b4045692a369514281aa28687b07e4b737c609373340503e97e6197e7bacb',
 'hunt-ice.webp':'1e804aa09bffc34338d62a1f99d3671b21cdee2e9753d51611397afc71754a86',
 'hunt-lake.webp':'23ebd89f5095e10878f2f453cdd3beece418ce1373491d9237e16206ff86bb7e',
 'hunt-meadow.webp':'936bd9f0d6a09fd9b2975c7e773b92c5ef137d9f6b4986612cf9211991a2a6f5',
 'hunt-mountain.webp':'1dc878b506aa1372dd559569ff9186f762e99f1ead773948d7722f31b7ef7264',
 'hunt-ruins.webp':'bcdc33c2a0fa64b7d7ba896a052841aa78bdd4c5e8ab97bfe522f7085d487904',
 'hunt-swamp.webp':'4412b83f668cb7f47eba5ecda0e37ae799bfeaae69be5c45c522a4b08b91fbe8',
 'hunt-volcano.webp':'83bfd6b45320ce4149137ce28646934c55701a4e9385725aa2f78bb0b7864852'
};
const b=fs.readFileSync(src);fs.mkdirSync(out,{recursive:true});
const sig=Buffer.from([0x50,0x4b,0x03,0x04]);
const positions=[];for(let p=0;(p=b.indexOf(sig,p))>=0;p+=4)positions.push(p);
function hash(x){return crypto.createHash('sha256').update(x).digest('hex')}
function webpSize(x){
 if(x.length<30||x.toString('ascii',0,4)!=='RIFF'||x.toString('ascii',8,12)!=='WEBP')return null;
 const kind=x.toString('ascii',12,16);
 if(kind==='VP8X')return {w:1+x.readUIntLE(24,3),h:1+x.readUIntLE(27,3)};
 if(kind==='VP8L'){const v=x.readUInt32LE(21);return {w:1+(v&0x3fff),h:1+((v>>>14)&0x3fff)}};
 if(kind==='VP8 '){for(let i=20;i+9<x.length&&i<40;i++)if(x[i]===0x9d&&x[i+1]===0x01&&x[i+2]===0x2a)return {w:x.readUInt16LE(i+3)&0x3fff,h:x.readUInt16LE(i+5)&0x3fff}}
 return null;
}
const found=new Map();
for(let ix=0;ix<positions.length;ix++){
 const p=positions[ix]; if(p+30>b.length)continue;
 const flags=b.readUInt16LE(p+6),method=b.readUInt16LE(p+8),compSize=b.readUInt32LE(p+18),nameLen=b.readUInt16LE(p+26),extraLen=b.readUInt16LE(p+28);
 const nameStart=p+30,nameEnd=nameStart+nameLen;if(nameEnd>b.length)continue;
 const entry=b.toString('utf8',nameStart,nameEnd).replace(/\\/g,'/');const base=path.posix.basename(entry);if(!expected[base])continue;
 const dataStart=nameEnd+extraLen;let dataEnd=compSize?dataStart+compSize:(positions[ix+1]??b.length);if(dataEnd>b.length)continue;
 let packed=b.subarray(dataStart,dataEnd),raw=null;
 try{if(method===0)raw=packed;else if(method===8)raw=zlib.inflateRawSync(packed);else continue}catch(e){
   if(!(flags&8))continue;
   try{raw=zlib.inflateRawSync(b.subarray(dataStart,positions[ix+1]??b.length))}catch{continue}
 }
 const got=hash(raw);if(got!==expected[base])continue;
 const dim=webpSize(raw);if(!dim||dim.w!==400||dim.h!==225)throw new Error(`${base}: dimensões WebP inválidas ${JSON.stringify(dim)}`);
 found.set(base,raw);
}
const missing=Object.keys(expected).filter(n=>!found.has(n));if(missing.length)throw new Error(`Alpha 11.7: staging não contém derivados WebP íntegros: ${missing.join(', ')}`);
for(const [name,raw] of [...found].sort())fs.writeFileSync(path.join(out,name),raw);
console.log(JSON.stringify({ok:true,files:found.size,size:'400x225',runtimeDerivative:'WebP q82/method6',sha256:Object.fromEntries(Object.keys(expected).sort().map(k=>[k,expected[k]]))},null,2));
