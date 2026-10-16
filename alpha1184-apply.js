'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[2]||'gridium-build');
const read=n=>fs.readFileSync(path.join(root,n),'utf8').replace(/\r\n/g,'\n');
const write=(n,s)=>fs.writeFileSync(path.join(root,n),s);
function once(s,a,b){const count=s.split(a).length-1;if(count!==1)throw Error('Alpha1184 expected unique anchor, got '+count+': '+a.slice(0,90));return s.replace(a,b);}
const pkg=JSON.parse(read('package.json'));if(pkg.version!=='3.0.0-alpha.11.8.3')throw Error('Expected exact 11.8.3 base');
let renderer=read('renderer.js');for(const [a,b]of require('./alpha1184-renderer-patches.json'))renderer=once(renderer,a,b);
let html=read('index.html');const partitions=html.match(/partition="[^"]+"/g);
html=once(html,'</head>','<link rel="stylesheet" href="accounts-workspace.css">\n</head>');
html=once(html,'<script src="renderer.js"></script>','<script src="accounts-workspace.js"></script>\n<script src="renderer.js"></script>');
for(let i=0;i<4;i++){const re=new RegExp('<button([^>]*data-game-slot="'+i+'"[^>]*)>[^<]*</button>','g'),matches=[...html.matchAll(re)];if(matches.length!==1)throw Error('Account tab '+i+' missing or ambiguous');html=html.replace(re,`<button$1 aria-pressed="${i===0}"><i class="session-dot" data-session-dot="${i}" aria-hidden="true"></i><span data-session-name="${i}">Sessão ${i+1}</span></button>`);}
if(JSON.stringify(partitions)!==JSON.stringify(html.match(/partition="[^"]+"/g)))throw Error('Session partitions changed');
write('renderer.js',renderer);write('index.html',html);
for(const n of ['accounts-workspace.js','accounts-workspace.css'])fs.copyFileSync(path.join(__dirname,'alpha1184-src',n),path.join(root,n));
fs.mkdirSync(path.join(root,'test'),{recursive:true});fs.copyFileSync(path.join(__dirname,'alpha1184-src/test/accounts-workspace.test.js'),path.join(root,'test/accounts-workspace.test.js'));
pkg.version='3.0.0-alpha.11.8.4';pkg.description='Gridium Alpha 11.8.4 — Contas: grade ampla, sessões persistentes e foco eficiente';write('package.json',JSON.stringify(pkg,null,2)+'\n');
console.log('Alpha 11.8.4 Accounts Workspace applied; session partitions and main process preserved.');
