'use strict';
const fs=require('fs');
const path=require('path');
const target=path.resolve(process.argv[2]||path.join(__dirname,'gridium-build'));
const read=p=>fs.readFileSync(path.join(target,p),'utf8');
const write=(p,c)=>fs.writeFileSync(path.join(target,p),c);
const assert=(ok,msg)=>{if(!ok)throw new Error('Sniper Opportunities: '+msg);};

const pkgPath=path.join(target,'package.json');
const pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
assert(pkg.version==='3.0.0-sniper.1',`versão intermediária inesperada: ${pkg.version}`);
pkg.version='3.0.0-sniper.2';
pkg.description='Gridium Sniper: sniper dedicado de baixa latência + Oportunidades isoladas do hot path';
fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

let html=read('index.html');
assert(html.includes('data-section="opportunities"'),'aba Oportunidades ausente');
assert(html.includes('data-section="sniper"'),'aba Sniper ausente');
assert(html.includes('id="opportunities"'),'conteúdo da aba Oportunidades ausente');
const oppNav=html.indexOf('data-section="opportunities"');
const sniperNav=html.indexOf('data-section="sniper"');
assert(oppNav>=0&&sniperNav>oppNav,'Oportunidades precisa ficar antes do Sniper');
const huntCandidates=['data-section="hunt"','data-section="hunt-intelligence"','Hunt Intelligence','Hunt Inteligente'];
const huntNav=huntCandidates.map(x=>html.lastIndexOf(x,oppNav)).reduce((a,b)=>Math.max(a,b),-1);
assert(huntNav>=0&&huntNav<oppNav,'Oportunidades precisa ficar depois de Hunt Inteligente');

let main=read('main.js');
const backgroundNeedle="if(shouldRecord&&listings.length)ingestOpportunityBackground();";
if(main.includes(backgroundNeedle)){
  main=main.replace(backgroundNeedle,"if(shouldRecord&&listings.length&&!(sniperRuntime?.mode==='AUTO'&&!sniperRuntime.killSwitch))ingestOpportunityBackground();");
}
assert(main.includes("!(sniperRuntime?.mode==='AUTO'&&!sniperRuntime.killSwitch)"),'proteção de CPU do Sniper AUTO não aplicada');
write('main.js',main);

for(const rel of ['opportunity-model.js','opportunity-core-process.js','opportunities-runtime.js'])assert(fs.existsSync(path.join(target,rel)),`${rel} ausente`);
console.log('Oportunidades preservadas entre Hunt Inteligente e Sniper; análise em background pausa durante Sniper AUTO.');
