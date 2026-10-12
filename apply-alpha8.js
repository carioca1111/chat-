'use strict';
const fs=require('fs'),path=require('path');
const dir=path.join(__dirname,'alpha8-parts');
const parts=Array.from({length:6},(_,i)=>path.join(dir,'part'+String(i).padStart(2,'0')+'.b64'));
const b64=parts.map(f=>fs.readFileSync(f,'utf8').replace(/\s+/g,'')).join('');
let src=Buffer.from(b64,'base64').toString('utf8');
// Alpha 7.1 can differ slightly in the serialized status line depending on overlay assembly.
// Replace only the brittle patch instruction with a structural insertion after the real runtime line.
const needleStart='main=rep(main,"let autoTraderStatus=';
const needleEnd=",'autopilot status');";
const a=src.indexOf(needleStart),b=a>=0?src.indexOf(needleEnd,a):-1;
if(a>=0&&b>a){
  const robust=`{\nconst tag='let autoTraderStatus=';\nconst i=main.indexOf(tag);if(i<0)throw new Error('Alpha 8: autoTraderStatus não encontrado');\nconst e=main.indexOf('\\n',i);if(e<0)throw new Error('Alpha 8: fim de autoTraderStatus não encontrado');\nconst inject="let autopilotStatus={enabled:false,state:'stopped',lastAt:0,slot:null,route:'',lastAction:'Parado',accountsReady:0,pagesVisited:0,listingsSeen:0,failures:0,lastError:null,bankrolls:[]};\\nconst autoNavState=Array.from({length:4},()=>({cursor:0,lastAt:0,lastAction:'',marketVisible:false,errors:0,pages:0}));\\n";\nmain=main.slice(0,e+1)+inject+main.slice(e+1);\n}`;
  src=src.slice(0,a)+robust+src.slice(b+needleEnd.length);
}
new Function('require','process','__dirname','__filename',src)(require,process,__dirname,__filename);
