export type Listing = { listingId:string; assetId:string; name:string; slot:number; currency:string; price:number; sellerId?:string; seller?:string; at:number; shiny?:boolean; rarity?:string };
export type Input = { eventId:string; receivedNs:string; listing:Listing; history:number[]; book:number[]; policy:{maxPrice:number;minMarginPct:number;minProfit:number;minRoiPct:number;minLiquidity:number;minHistory:number;feePct:number;maxBookAgeMs:number}; now:number };
export type Output = { engine:'node';eventId:string;decision:'BUY'|'IGNORE';reason:string;fairValue:number;fastSell:number;liquidity:number;profit:number;roiPct:number;historyCount:number;parseNs:string;filterNs:string;strategyNs:string;decisionNs:string };
declare const process:any;
declare const require:any;
declare const module:any;
const mono=()=>process.hrtime.bigint();
function median(v:number[]):number { const a=v.filter(Number.isFinite).map(Math.round).sort((x,y)=>x-y);if(!a.length)return 0;const m=Math.floor(a.length/2);return a.length%2?a[m]:Math.floor((a[m-1]+a[m])/2); }
function evaluate(input:Input):Output {
 const t0=mono(),l=input.listing,p=input.policy,history=(input.history||[]).filter(x=>Number.isFinite(x)&&x>0),book=(input.book||[]).filter(x=>Number.isFinite(x)&&x>0);
 const fair=median(history);const t1=mono();
 const filtered=history.filter(x=>x>=fair*.65&&x<=fair*1.35),market=median(book),anchor=filtered.length?median(filtered):fair,reference=market?Math.min(anchor||market,market):anchor;
 const fast=Math.max(0,Math.floor(reference*.9)),fee=Math.max(0,p.feePct||0),profit=Math.floor(fast*(100-fee)/100-l.price),roi=l.price>0?profit/l.price*100:0;
 const histScore=Math.min(60,filtered.length*6),bookScore=Math.min(25,book.length*5),spreadScore=market&&reference?Math.max(0,15-Math.floor(Math.abs(market-reference)/reference*100)):0,liquidity=Math.max(0,Math.min(100,histScore+bookScore+spreadScore));
 const t2=mono();let reason='';
 if(!l.listingId||!l.assetId||!Number.isFinite(l.price)||l.price<=0)reason='listing-invalid';
 else if(input.now-l.at>p.maxBookAgeMs)reason='listing-stale';
 else if(history.length<p.minHistory||filtered.length<p.minHistory)reason='insufficient-history';
 else if(!market||!book.length)reason='insufficient-live-book';
 else if(l.price>p.maxPrice)reason='above-max-price';
 else if(liquidity<p.minLiquidity)reason='low-liquidity';
 else if(profit<p.minProfit)reason='profit-below-minimum';
 else if(roi<p.minRoiPct)reason='roi-below-minimum';
 else if(fast<=l.price*(1+(p.minMarginPct||0)/100))reason='margin-below-minimum';
 const t3=mono(),decision=reason?'IGNORE':'BUY',t4=mono();
 return {engine:'node',eventId:input.eventId,decision,reason:reason||'risk-checks-passed',fairValue:reference,fastSell:fast,liquidity,profit,roiPct:Math.floor(roi*100)/100,historyCount:filtered.length,parseNs:String((input as any).parseNs||'0'),filterNs:(t2-t1).toString(),strategyNs:(t3-t2).toString(),decisionNs:(BigInt(String((input as any).parseNs||'0'))+t4-t0).toString()};
}
if(require.main===module){let carry='';process.stdin.setEncoding('utf8');process.stdin.on('data',(chunk:string)=>{carry+=chunk;for(;;){const i=carry.indexOf('\n');if(i<0)break;const line=carry.slice(0,i);carry=carry.slice(i+1);try{const parseStart=mono(),input=JSON.parse(line);input.parseNs=(mono()-parseStart).toString();const result=evaluate(input);process.stdout.write(JSON.stringify(result)+'\n');}catch(e){process.stdout.write(JSON.stringify({engine:'node',eventId:'',decision:'IGNORE',reason:'engine-error',error:String(e)} )+'\n');}}});}
export {evaluate};
