'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.AccountsWorkspace=api;})(typeof window==='undefined'?null:window,function(){
  let nodes=null;
  const put=(el,value)=>{if(el&&el.textContent!==value)el.textContent=value;};
  function refs(){if(nodes)return nodes;nodes=Array.from({length:4},(_,i)=>({name:document.getElementById('name'+i),mini:document.getElementById('mini'+i),zoom:document.getElementById('zoom'+i),meta:document.getElementById('accountMeta'+i),tab:document.querySelector(`[data-session-name="${i}"]`),dot:document.querySelector(`[data-session-dot="${i}"]`),panel:document.querySelector(`.game-panel[data-slot="${i}"]`)}));return nodes;}
  function status(row){if(row?.record?.live?.browserOnline===false||row?.record?.live?.connectionIssue===true)return 'offline';return row?.health==='online'?'online':row?.health==='idle'?'idle':'offline';}
  function update(data,format=String){refs().forEach((n,i)=>{const row=data.rows?.[i]||{},r=row.record,name=r?.nick||`Conta ${i+1}`,state=status(row),hint=row.status||'Aguardando jogo';put(n.name,name);put(n.tab,name);put(n.mini,r?`${format(r.values?.capturas||0)} capturas · ${hint}`:hint);put(n.zoom,Math.round((data.settings?.zoom?.[i]||1)*100)+'%');
    // The lightweight core snapshot does not carry confirmed Market balances.
    // Never retain balances from a previous identity in these headers.
    put(n.meta,state==='online'?'Online':state==='idle'?'Sem atividade recente':'Sem conexão confirmada');
    for(const el of [n.dot,n.panel])if(el&&el.dataset.connection!==state)el.dataset.connection=state;
    if(n.tab&&n.tab.parentElement.title!==`${name} · ${hint}`)n.tab.parentElement.title=`${name} · ${hint}`;
  });}
  function createPublisher(send){let previous='';return function(section,layout,slot,visible){const key=section+'|'+layout+'|'+slot+'|'+visible.join(',');if(key===previous)return false;previous=key;try{Promise.resolve(send({section,layout,focusedSlot:slot,visibleSlots:visible})).catch(()=>{if(previous===key)previous='';});}catch{previous='';}return true;};}
  function visibleSlots(section,layout,slot){if(section!=='games')return [];return layout==='focus'?[slot]:layout==='duo'?[slot,(slot+1)%4]:[0,1,2,3];}
  return {update,createPublisher,visibleSlots,status};
});
