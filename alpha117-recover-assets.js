'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const src=path.resolve(process.argv[2]||'hunt-backgrounds.zip');
const out=path.resolve(process.argv[3]||'gridium-build/assets/hunt/backgrounds');
const expected={
 'hunt-beach.webp':'52e96b137dbaf482604a435ef3091cbffb838548ba6225bb4065df73f30ebe6f',
 'hunt-cave.webp':'3b0d8be6b7c1787a95b37a04716c8696116d4bef7a69c504dc6a9582558b7ea7',
 'hunt-default.webp':'4f3da648cb9db92320d80ffedf0b378f75ff4670ed5a8ac2c9f1f8069015ac23',
 'hunt-desert.webp':'6b938b0a1357140d018aa49b71cb182ae0cc58032ecea5c382a3507cfdbb3714',
 'hunt-forest.webp':'69309db23da9aef695e0f4a35b1b095bb9ee71c3d734890dbfb9d04348fd750c',
 'hunt-ice.webp':'3082471e82a44ed4e01fdfaf207d36b46169ac2cec258dbae84c5cf9c01d86ec',
 'hunt-lake.webp':'4552ddb78e1c43e2a47f5a399bd1dc728085d2b9bdf1dc7c00f5121f921a952e',
 'hunt-meadow.webp':'0f2402e5db2bfb4209366793138730c4cff53e4ef369bd09f5b1c589f843b2dc',
 'hunt-mountain.webp':'d671b43d5d980190a66783eedb2dfeaab9cc0aeb547ad7ef14453444aede3dda',
 'hunt-ruins.webp':'6223d10954e5623a515d1edb4aab57ccd4322b5f9a8c227ceac06e587171cc1e',
 'hunt-swamp.webp':'b9018e03960086220f738cb54916c781e2407f4aff8ae84b2f94378268478fff',
 'hunt-volcano.webp':'7fb236d05a60a8e17dd9a1c51955b80cb3b101ee52b8988942811350b62c54fe'
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
   // For descriptor-based entries, inflateRaw can tolerate trailing descriptor bytes only on some streams.
   if(!(flags&8))continue;
   try{raw=zlib.inflateRawSync(b.subarray(dataStart,positions[ix+1]??b.length))}catch{continue}
 }
 const got=hash(raw);if(got!==expected[base])continue;
 const dim=webpSize(raw);if(!dim||dim.w!==400||dim.h!==225)throw new Error(`${base}: dimensões WebP inválidas ${JSON.stringify(dim)}`);
 found.set(base,raw);
}
const missing=Object.keys(expected).filter(n=>!found.has(n));if(missing.length)throw new Error(`Alpha 11.7: staging não contém WebP íntegros: ${missing.join(', ')}`);
for(const [name,raw] of [...found].sort())fs.writeFileSync(path.join(out,name),raw);
console.log(JSON.stringify({ok:true,files:found.size,size:'400x225',sha256:Object.fromEntries(Object.keys(expected).sort().map(k=>[k,expected[k]]))},null,2));
