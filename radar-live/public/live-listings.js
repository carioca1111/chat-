(()=>{
  const baseRenderCards=renderCards;
  renderCards=function(){
    const opportunityRows=filtered(state.opportunities).slice(0,9);
    if(opportunityRows.length || state.dataMode!=='REAL_FEED')return baseRenderCards();

    const q=$('#search').value.trim().toLowerCase();
    const cur=$('#currency').value;
    const seen=new Set();
    const rows=(state.recentEvents||[])
      .filter(e=>['listing_created','listing_updated'].includes(e.type)&&e.name&&Number(e.price)>0&&e.listingId)
      .filter(e=>(!q||String(e.name).toLowerCase().includes(q))&&(cur==='ALL'||e.currency===cur))
      .filter(e=>{const k=String(e.listingId);if(seen.has(k))return false;seen.add(k);return true;})
      .slice(0,12);

    const host=$('#cards');
    if(!rows.length){host.innerHTML='<div class="empty">Feed real conectado. Aguardando novos anúncios do Market.</div>';return;}

    host.innerHTML=rows.map((e,i)=>{
      const p=e.meta?.pokemon||null;
      const details=[];
      if(p?.shiny===true)details.push('SHINY');
      if(Number.isFinite(Number(p?.quality)))details.push('Quality '+Number(p.quality));
      if(Number.isFinite(Number(p?.grade)))details.push('Grade '+Number(p.grade));
      if(Number.isFinite(Number(p?.level)))details.push('Lv. '+Number(p.level));
      const href=e.marketUrl||'https://pokeidle.io/app';
      return `<article class="opp-card live-listing-card" data-live-index="${i}"><div class="card-accent"></div><div class="card-body">
        <div class="card-head"><div><div class="asset-name">${esc(e.name)}</div><div class="asset-meta">${e.kind==='pokemon'?'POKÉMON':'ITEM'} • ${e.currency} • ANÚNCIO REAL</div></div><div class="score live-score">LIVE</div></div>
        <div class="price-grid"><div class="metric"><span>Preço anunciado</span><b>${money(Number(e.price),e.currency)}</b></div><div class="metric"><span>ID do anúncio</span><b>${esc(e.listingId)}</b></div></div>
        <div class="badges"><span class="badge hot">DADO REAL</span><span class="badge">COLETANDO HISTÓRICO</span>${details.map(x=>`<span class="badge">${esc(x)}</span>`).join('')}</div>
        <div class="mini-row"><span>${e.seller?'Vendedor '+esc(e.seller):'Vendedor não informado'}</span><span>${ago(e.ts)}</span></div>
        <button class="market-btn live-market-btn" data-live-market="${i}" data-href="${esc(href)}" data-listing="${esc(e.listingId)}" type="button">🎯 ABRIR NO MARKET</button>
      </div></article>`;
    }).join('');

    host.querySelectorAll('[data-live-market]').forEach(btn=>{
      btn.onclick=async ev=>{
        ev.preventDefault();ev.stopPropagation();
        try{await navigator.clipboard.writeText(btn.dataset.listing||'')}catch{}
        window.open(btn.dataset.href||'https://pokeidle.io/app','_blank','noopener,noreferrer');
      };
    });
  };
})();
