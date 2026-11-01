(()=>{
'use strict';
const root=document.getElementById('gameApp');if(!root)return;
const mq=window.matchMedia('(max-width:900px)');
let initialized=false,activeButton=null;
const $=id=>document.getElementById(id);
function build(){if(initialized)return;initialized=true;
  const status=document.createElement('section');status.className='mobile-statusbar';status.setAttribute('aria-label','Status rápido');status.innerHTML=`
    <div class="mobile-stat"><span>CREDITS</span><b id="mCredits">0</b></div>
    <div class="mobile-stat"><span>GEMS</span><b id="mGems">0</b></div>
    <div class="mobile-stat sector"><span>SETOR</span><b id="mSector">Sol Belt</b></div>
    <div class="mobile-stat meters"><span>ESCUDO · CARGA</span><b id="mMeters">100% · 0/100</b></div>`;
  root.insertBefore(status,root.querySelector('.center-stage'));

  const dock=document.createElement('nav');dock.className='mobile-dock';dock.setAttribute('aria-label','Controles mobile');dock.innerHTML=`
    <button type="button" data-mobile="map">◉<span>Mapa</span></button>
    <button type="button" data-mobile="cargo">▦<span>Carga</span></button>
    <button type="button" data-mobile="market">▣<span>Market</span></button>
    <button type="button" data-mobile="ship">⌁<span>Nave</span></button>
    <button type="button" data-mobile="auto">⚙<span>Auto</span></button>
    <button type="button" data-mobile="chat">✦<span>Chat</span></button>`;
  root.appendChild(dock);

  const rail=root.querySelector('.right-rail');if(rail){const close=document.createElement('button');close.type='button';close.className='mobile-sheet-close';close.setAttribute('aria-label','Fechar painel');close.textContent='×';rail.prepend(close);close.addEventListener('click',closeAll)}
  dock.addEventListener('click',e=>{const b=e.target.closest('[data-mobile]');if(!b)return;const a=b.dataset.mobile;if(a==='map'){closeAll();($('navMap')||$('sectorButton'))?.click();return;}if(a==='cargo'||a==='market'){openMain(a,b);return;}if(a==='ship'){openMain('ship',b);return;}if(a==='auto'){openSheet('auto',b);return;}if(a==='chat'){openSheet('chat',b);return;}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mq.matches)closeAll()});
  const play=root.querySelector('.play-area');play?.addEventListener('pointerdown',e=>{if(!mq.matches)return;if(e.target.closest('button,input'))return;if(root.classList.contains('mobile-panel-open')||root.classList.contains('mobile-sheet-open'))closeAll();});
}
function setActive(b){root.querySelectorAll('.mobile-dock button').forEach(x=>x.classList.toggle('active',x===b));activeButton=b||null}
function closeAll(){root.classList.remove('mobile-panel-open','mobile-sheet-open');setActive(null)}
function openMain(tab,b){root.classList.remove('mobile-sheet-open');const same=root.classList.contains('mobile-panel-open')&&activeButton===b;if(same)return closeAll();const original=root.querySelector(`.nav-button.tab[data-tab="${tab}"]`);original?.click();root.classList.add('mobile-panel-open');setActive(b)}
function openSheet(section,b){root.classList.remove('mobile-panel-open');const rail=root.querySelector('.right-rail');if(!rail)return;const same=root.classList.contains('mobile-sheet-open')&&rail.dataset.mobileSection===section&&activeButton===b;if(same)return closeAll();rail.dataset.mobileSection=section;root.classList.add('mobile-sheet-open');setActive(b)}
function sync(){if(!mq.matches){root.classList.remove('mobile-panel-open','mobile-sheet-open');return;}const credits=$('credits')?.textContent||'0',gems=$('gems')?.textContent||'0',sector=$('sectorName')?.textContent||'—',shield=$('shieldText')?.textContent||'—',cargo=$('cargoText')?.textContent||'—';const mc=$('mCredits'),mg=$('mGems'),ms=$('mSector'),mm=$('mMeters');if(mc)mc.textContent=credits;if(mg)mg.textContent=gems;if(ms)ms.textContent=sector;if(mm)mm.textContent=`${shield} · ${cargo}`}
function onMq(){if(mq.matches)build();else closeAll()}
if(mq.addEventListener)mq.addEventListener('change',onMq);else mq.addListener(onMq);onMq();setInterval(sync,500);sync();
})();
