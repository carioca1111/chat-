'use strict';
(() => {
  const ITEM_MAP={
    'poke ball':'poke-ball','poké ball':'poke-ball','great ball':'great-ball','ultra ball':'ultra-ball','master ball':'master-ball','rare candy':'rare-candy',
    'fire stone':'fire-stone','water stone':'water-stone','thunder stone':'thunder-stone','leaf stone':'leaf-stone','moon stone':'moon-stone','sun stone':'sun-stone','dusk stone':'dusk-stone','dawn stone':'dawn-stone','shiny stone':'shiny-stone','ice stone':'ice-stone'
  };
  // Explicit overrides only. Special forms must be added here instead of assuming an internal PokeIdle ID is a National Dex number.
  const FORM_MAP={};
  const clean=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
  const safeDex=v=>{const n=Number(v);return Number.isInteger(n)&&n>=1&&n<=1025?n:null;};
  const existsCache=new Map();
  const fallbackPokemon='assets/sniper/unknown-pokemon.svg',fallbackItem='assets/sniper/unknown-item.svg';
  function pokemon({dex,speciesId,name,shiny=false,form='' }={}){
    const formKey=clean(form||name);const explicit=FORM_MAP[formKey];const id=safeDex(explicit||dex||speciesId);
    if(!id)return fallbackPokemon;
    return `assets/sniper/pokemon/${shiny?'shiny':'normal'}/${id}.png`;
  }
  function item({slug,name,itemId}={}){
    let key=clean(slug||name).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const mapped=ITEM_MAP[clean(name)]||ITEM_MAP[clean(slug)];if(mapped)key=mapped;
    if(!key&&itemId!=null)key=String(itemId).replace(/[^a-zA-Z0-9_-]/g,'');
    return key?`assets/sniper/items/${key}.png`:fallbackItem;
  }
  function forListing(l={}){
    if(l.assetType==='pokemon')return pokemon({speciesId:l.pokemon?.speciesId||l.assetId,name:l.name,shiny:l.shiny===true||l.pokemon?.shiny===true,form:l.pokemon?.form||''});
    return item({name:l.name,itemId:l.assetId,slug:l.metadata?.slug});
  }
  function fallbackFor(l={}){return l.assetType==='pokemon'?fallbackPokemon:fallbackItem;}
  function bindImage(img,listing){if(!img)return;img.src=forListing(listing);img.onerror=()=>{img.onerror=null;img.src=fallbackFor(listing);};}
  window.SniperAssets={pokemon,item,forListing,fallbackFor,bindImage,existsCache};
})();
