'use strict';
const fs=require('fs');
const path=require('path');

const target=path.resolve(process.argv[2]||'gridium-build');
function file(name){return path.join(target,name);}
function read(name){return fs.readFileSync(file(name),'utf8');}
function write(name,text){fs.writeFileSync(file(name),text,'utf8');}
function exists(name){return fs.existsSync(file(name));}

for(const required of ['package.json','index.html','styles.css','renderer.js','main.js']){
  if(!exists(required)) throw new Error(`Gridium Popular: arquivo ausente: ${required}`);
}

// Identidade totalmente separada da edição interna.
const pkg=JSON.parse(read('package.json'));
pkg.name='gridium-popular';
pkg.productName='Gridium Popular';
pkg.version='1.0.0';
pkg.description='Gridium Popular: central de contas e painel para PokeIdle.io';
pkg.build=pkg.build||{};
pkg.build.appId='com.gridium.popular';
pkg.build.productName='Gridium Popular';
pkg.build.win=pkg.build.win||{};
pkg.build.win.artifactName='Gridium-Popular-Setup-${version}.${ext}';
pkg.build.nsis=pkg.build.nsis||{};
pkg.build.nsis.shortcutName='Gridium Popular';
write('package.json',JSON.stringify(pkg,null,2)+'\n');

// Mantém os elementos internos no DOM para não quebrar o renderer legado,
// mas torna toda a superfície do Alpha Terminal inacessível na edição Popular.
let css=read('styles.css');
css += `\n/* GRID_POPULAR_EDITION_LOCK */\n`+
`[data-tab*="alpha" i],[data-view*="alpha" i],[data-page*="alpha" i],\n`+
`[id^="alpha" i],[id*="alpha-terminal" i],[id*="alphaTerminal" i],\n`+
`[class*="alpha-terminal" i],[class*="alphaTerminal" i]{display:none!important;visibility:hidden!important;pointer-events:none!important;}\n`;
write('styles.css',css);

let html=read('index.html');
html=html.replace(/<title>[^<]*<\/title>/i,'<title>Gridium Popular</title>');
html=html.replace(/Gridium\s+Desktop/gi,'Gridium Popular');
const lockScript=`\n<script id="gridium-popular-lock">\n(()=>{\n  const alphaKey=/alpha(?:\\s|-|_)*terminal|terminal(?:\\s|-|_)*alpha/i;\n  const alphaToken=/^alpha$|alpha(?:-|_|\\s)*(terminal|trade|market|engine)|(?:terminal|trade|market)(?:-|_|\\s)*alpha/i;\n  function hide(el){\n    if(!el||el.dataset?.gridiumPopularHidden==='1')return;\n    el.dataset.gridiumPopularHidden='1';\n    el.setAttribute('aria-hidden','true');\n    el.style.setProperty('display','none','important');\n    el.style.setProperty('pointer-events','none','important');\n  }\n  function sanitize(){\n    document.title='Gridium Popular';\n    document.querySelectorAll('button,a,[role="tab"],[data-tab],[data-view],[data-page]').forEach(el=>{\n      const text=(el.textContent||'').trim();\n      const tokens=[el.id,el.className,el.getAttribute('data-tab'),el.getAttribute('data-view'),el.getAttribute('data-page')].filter(Boolean).join(' ');\n      if(alphaKey.test(text)||alphaToken.test(tokens)) hide(el);\n    });\n    document.querySelectorAll('[id]').forEach(el=>{\n      if(alphaToken.test(el.id||'')) hide(el);\n    });\n  }\n  const start=()=>{\n    sanitize();\n    setTimeout(sanitize,50);\n    setTimeout(sanitize,500);\n    new MutationObserver(sanitize).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-tab','data-view','data-page']});\n  };\n  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();\n})();\n</script>\n`;
if(!html.includes('id="gridium-popular-lock"')){
  if(html.includes('</body>')) html=html.replace('</body>',lockScript+'</body>');
  else html+=lockScript;
}
write('index.html',html);

// Marca a edição no renderer sem tocar no motor interno da versão privada.
let renderer=read('renderer.js');
if(!renderer.includes('GRID_POPULAR_EDITION')){
  renderer=`const GRID_POPULAR_EDITION=true;\n`+renderer;
}
write('renderer.js',renderer);

let main=read('main.js');
if(!main.includes('GRID_POPULAR_EDITION')){
  main=`const GRID_POPULAR_EDITION=true;\n`+main;
}
main=main.replace(/Gridium Desktop/gi,'Gridium Popular');
write('main.js',main);

console.log('Gridium Popular 1.0.0 aplicado: Alpha Terminal bloqueado na interface e identidade separada configurada.');
