'use strict';
const fs=require('fs');
const path=require('path');

const root=path.resolve(process.argv[2]||'gridium-build');
const file=path.join(root,'alpha-engine.js');
let src=fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n');
const must=(condition,message)=>{if(!condition)throw new Error(message);};
const replaceOnce=(search,replacement,label)=>{must(src.includes(search),`Alpha 9.14 optimizer: marcador ausente: ${label}`);src=src.replace(search,replacement);};

replaceOnce(
  "const nowDay=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));",
  "const dayFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});\nconst nowDay=at=>dayFormatter.format(new Date(at));",
  'formatter de data reutilizável'
);

replaceOnce(
  "  accountSummary(slot,currency='gems',mode='real'){\n    const base=",
  "  accountSummary(slot,currency='gems',mode='real'){\n    const viewCache=this._viewReadCache,summaryKey=`${slot}:${currency}:${mode}`;if(viewCache){viewCache.accountSummaries=viewCache.accountSummaries||new Map();if(viewCache.accountSummaries.has(summaryKey)){viewCache.cacheHits=(viewCache.cacheHits||0)+1;return viewCache.accountSummaries.get(summaryKey);}}\n    const base=",
  'cache de accountSummary'
);
replaceOnce(
  "    return {slot,currency,base,realized,unrealized,totalPnl:realized+unrealized,locked,reinvested,operational,inPositions,reserve,available,todayPnl,currentPnl,feePct,trades:trades.length,wins,winRate:trades.length?wins/trades.length*100:0};\n  }\n  strategyRanking",
  "    const result={slot,currency,base,realized,unrealized,totalPnl:realized+unrealized,locked,reinvested,operational,inPositions,reserve,available,todayPnl,currentPnl,feePct,trades:trades.length,wins,winRate:trades.length?wins/trades.length*100:0};if(viewCache)viewCache.accountSummaries.set(summaryKey,result);return result;\n  }\n  strategyRanking",
  'gravação do cache de accountSummary'
);

fs.writeFileSync(file,src);
console.log('Alpha 9.14 optimizer applied: formatter reutilizado + accountSummary memoizado por snapshot.');
