'use strict';
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const {spawnSync}=require('child_process');
const target=process.argv[2];
if(!target)throw new Error('Uso: node apply-alpha911.js <diretorio-alvo>');
const root=path.resolve(process.cwd(),target);
if(!fs.existsSync(root))throw new Error('Diretorio alvo nao existe: '+root);
const partsDir=path.join(__dirname,'alpha911-parts');
const parts=fs.readdirSync(partsDir).filter(x=>/^part\d+\.b64$/.test(x)).sort();
if(!parts.length)throw new Error('Alpha 9.11: partes do patch ausentes');
const b64=parts.map(n=>fs.readFileSync(path.join(partsDir,n),'utf8').trim()).join('');
const packed=Buffer.from(b64,'base64');
function inflateGzipPayloadIgnoringChecksum(buf){
  if(buf.length<18||buf[0]!==0x1f||buf[1]!==0x8b||buf[2]!==8)throw new Error('Alpha 9.11: pacote gzip invalido');
  const flags=buf[3];let p=10;
  if(flags&4){if(p+2>buf.length)throw new Error('Alpha 9.11: gzip extra invalido');const xlen=buf.readUInt16LE(p);p+=2+xlen;}
  const skipZ=()=>{while(p<buf.length&&buf[p++]!==0){};};
  if(flags&8)skipZ();
  if(flags&16)skipZ();
  if(flags&2)p+=2;
  if(p>=buf.length-8)throw new Error('Alpha 9.11: gzip truncado');
  return zlib.inflateRawSync(buf.subarray(p,buf.length-8));
}
let patch;
try{patch=zlib.gunzipSync(packed);}catch(err){
  if(err?.code!=='Z_DATA_ERROR')throw err;
  patch=inflateGzipPayloadIgnoringChecksum(packed);
  const txt=patch.toString('utf8');
  const required=['diff --git','recoverUnlistedPositionsTick','liveEcoMode','SEM ANÚNCIO','GRID_ALPHA911_LISTING_RECOVERY_LIVE_ECO'];
  if(!required.every(x=>txt.includes(x)))throw new Error('Alpha 9.11: recuperação do patch falhou na validação de integridade');
  console.warn('Alpha 9.11: checksum gzip divergente; payload DEFLATE recuperado e validado por marcadores.');
}
const tmp=path.join(__dirname,'.alpha911.patch.tmp');fs.writeFileSync(tmp,patch);
try{
  const rel=path.relative(process.cwd(),root).replace(/\\/g,'/');
  if(!rel||rel.startsWith('..'))throw new Error('Diretorio alvo invalido: '+rel);
  const r=spawnSync('git',['apply','--unsafe-paths','--whitespace=nowarn',`--directory=${rel}`,tmp],{cwd:process.cwd(),stdio:'inherit'});
  if(r.error)throw r.error;if(r.status!==0)throw new Error('Alpha 9.11: git apply falhou com codigo '+r.status);
}finally{try{fs.unlinkSync(tmp)}catch{}}
const pkgPath=path.join(root,'package.json'),pkg=JSON.parse(fs.readFileSync(pkgPath,'utf8'));
if(pkg.version!=='3.0.0-alpha.9.10')throw new Error('Alpha 9.11: base 9.10 esperada, atual '+pkg.version);
pkg.version='3.0.0-alpha.9.11';fs.writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');
const testDir=path.join(root,'test');fs.mkdirSync(testDir,{recursive:true});
fs.writeFileSync(path.join(testDir,'alpha911-listing-recovery.test.js'),`'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {AlphaEngine}=require('../alpha-engine');
function engine(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g911-')),e=new AlphaEngine(path.join(dir,'a.sqlite'));return {dir,e};}
test('snapshot parcial não apaga anúncios próprios já conhecidos',()=>{const {dir,e}=engine();try{e.updateOwnListings(0,[{listingId:'a',assetType:'item',assetId:'23',currency:'coins',price:120000}]);e.ingestProtocol({slot:0,validation:{ownListingsMapped:false},ownListings:[]});assert.equal(e.ownListings[0].length,1);e.ingestProtocol({slot:0,validation:{createListingValidated:true},ownListings:[{listingId:'b',assetType:'item',assetId:'24',currency:'coins',price:130000}]});assert.equal(e.ownListings[0].length,2);}finally{e.close();fs.rmSync(dir,{recursive:true,force:true});}});
test('metadata de posição guarda estado e tentativas do anúncio',()=>{const {dir,e}=engine();try{const id=e.openPosition({slot:0,strategy:'balanced',mode:'real',assetType:'item',assetId:'23',name:'Stone',currency:'coins',entry:100000});e.updatePositionMetadata(id,{listingStatus:'pending',listingAttempts:2,listingRetryAt:123});const p=e.positions(true).find(x=>x.id===id);assert.equal(p.metadata.listingStatus,'pending');assert.equal(p.metadata.listingAttempts,2);assert.equal(p.metadata.listingRetryAt,123);}finally{e.close();fs.rmSync(dir,{recursive:true,force:true});}});
test('recuperador procura posições sem anúncio, usa backoff e confirmação real',()=>{const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8');assert.ok(main.includes('recoverUnlistedPositionsTick'));assert.ok(main.includes('uncoveredRealPositions'));assert.ok(main.includes('executeLiveCreate(slot,listing,price'));assert.ok(main.includes('2**Math.min(attempts,5)'));assert.ok(main.includes('listingRecoveryTimer=setInterval'));assert.ok(main.includes('Anúncio não encontrado em Meus anúncios'));});
test('falha do anúncio inicial não derruba o Auto Trader',()=>{const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8'),at=main.indexOf('const resaleProblem='),end=main.indexOf('if(result?.ok)autoOrderFailures=0',at),seg=main.slice(at,end);assert.ok(at>0&&end>at);assert.match(seg,/resalePending:true/);assert.doesNotMatch(seg,/fatal:true/);assert.match(seg,/recuperador tentará novamente/);});
test('painel mostra anunciadas e SEM ANÚNCIO por conta',()=>{const r=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8'),h=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');assert.match(h,/alphaRecoveryBadge/);assert.match(r,/renderMarketRecovery/);assert.match(r,/SEM ANÚNCIO/);assert.match(r,/alpha-listing-health/);});
`,'utf8');
fs.writeFileSync(path.join(testDir,'alpha911-live-eco.test.js'),`'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const main=fs.readFileSync(path.join(__dirname,'..','main.js'),'utf8'),renderer=fs.readFileSync(path.join(__dirname,'..','renderer.js'),'utf8'),html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),css=fs.readFileSync(path.join(__dirname,'..','styles.css'),'utf8');
test('Lives econômicas existe e persiste nas configurações',()=>{assert.match(html,/id="liveEcoMode"/);assert.match(renderer,/liveEcoMode/);assert.match(main,/liveEcoMode:false/);assert.match(main,/liveEcoMode:settings\.liveEcoMode/);});
test('Lives econômicas reduz composição sem pausar a reprodução',()=>{assert.ok(main.includes("const cap=focused?(layout==='focus'?30:20):(visible?8:3)"));assert.ok(main.includes('setFrameRate'));assert.ok(main.includes('setBackgroundThrottling(settings.liveEcoMode?false'));assert.ok(!main.includes('playbackRate='));assert.ok(!main.includes('video.pause('));});
test('modo declara explicitamente que não simula visualização',()=>{assert.match(html,/não simula visualização/);assert.match(html,/não pausa vídeo/);assert.match(css,/GRID_ALPHA911_LISTING_RECOVERY_LIVE_ECO/);assert.match(html,/liveEcoBadge/);});
`,'utf8');
console.log('Gridium 3.0.0-alpha.9.11 aplicado: Recuperador de Anúncios + Lives Econômicas.');
