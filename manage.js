'use strict';
(() => {
  const $=s=>document.querySelector(s);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories=['Travel','Nursery','Bath & Care','Clothing','Diapering','Feeding','Health & Safety','Playtime'];
  let csrf='',revision='',items=[],original='',featured=new Set(),selectedId=null,saving=false;
  const api='/api/manage?action=';
  function failure(message){$('#error-banner').textContent=message;$('#error-banner').hidden=false;}
  function clearFailure(){$('#error-banner').hidden=true;}
  async function request(action,options={}) {
    const res=await fetch(api+action,{
      credentials:'same-origin',
      cache:'no-store',
      headers:{...(csrf?{'x-admin-csrf':csrf}:{}),...(options.body?{'Content-Type':'application/json'}:{})},
      ...options
    });
    let data={};try{data=await res.json();}catch{}
    if(!res.ok){
      if(res.status===401 && action!=='login' && action!=='session')lockManager(data.rememberedDevice!==false);
      const error=new Error(data.error||'Unable to connect to the gift manager');error.status=res.status;throw error;
    }
    return data;
  }
  function standardize(x) {
    const match=x.name?.match(/^\s*(\d+)\s*[×x]\s*/i);
    const wanted=x.quantityWanted??(match?Number(match[1]):1);
    let received=x.quantityReceived??(x.purchased?wanted:0);
    let status=x.status??(x.purchased?'received':'needed');
    if(received>=wanted){received=wanted;status='received';}
    else if(received>0)status='partial';
    return {...x,quantityWanted:wanted,quantityReceived:received,status,notes:x.notes||'',archived:Boolean(x.archived)};
  }
  function dirty(){return JSON.stringify(items)!==original;}
  function refreshSaveBar(message) {
    $('#save-button').disabled=saving||!dirty();
    const count=items.length;
    $('#save-message').textContent=message||(dirty()?'You have unsaved changes':'All '+count+' entries are saved');
  }
  function statusOf(item) {
    if(item.quantityReceived>=item.quantityWanted)return 'received';
    if(item.quantityReceived>0)return 'partial';
    return item.status==='reserved'?'reserved':'needed';
  }
  const statusLabel={needed:'Still needed',reserved:'Reserved',partial:'Partly received',received:'Received'};
  function metrics() {
    const active=items.filter(i=>!i.archived);
    const counts={needed:0,reserved:0,partial:0,received:0};
    active.forEach(i=>counts[statusOf(i)]++);
    $('#metrics').innerHTML=
      [['Total',active.length],['Needed',counts.needed],['Reserved',counts.reserved],['Partial',counts.partial],['Received',counts.received]]
      .map(([key,val])=>'<div class="metric"><small>'+key+'</small><strong>'+val+'</strong></div>').join('');
  }
  function render() {
    const query=$('#search').value.trim().toLowerCase();
    const category=$('#category-filter').value;
    const status=$('#status-filter').value;
    const showArchived=$('#show-archived').checked;
    const visible=items.filter(i=>(showArchived||!i.archived)&&(category==='all'||i.category===category)&&
      (status==='all'||statusOf(i)===status)&&(!query||(i.name+' '+(i.notes||'')).toLowerCase().includes(query)));
    $('#visible-count').textContent=visible.length+' of '+items.length+' items';
    $('#items-body').innerHTML=visible.map(i=>'<tr class="'+(i.archived?'archived-row':'')+'">'+
      '<td><div class="item-name">'+escape(i.name)+'</div>'+(i.notes?'<div class="item-note">'+escape(i.notes.slice(0,80))+'</div>':'')+'</td>'+
      '<td>'+escape(i.category)+'</td>'+
      '<td><select aria-label="Status for '+escape(i.name)+'" class="status-select" data-status="'+i.id+'">'+
      Object.entries(statusLabel).map(([key,label])=>'<option value="'+key+'"'+(statusOf(i)===key?' selected':'')+'>'+label+'</option>').join('')+'</select></td>'+
      '<td class="count-cell"><input aria-label="Quantity received for '+escape(i.name)+'" class="received-input" type="number" min="0" max="'+i.quantityWanted+'" data-qty="'+i.id+'" value="'+i.quantityReceived+'"> / '+i.quantityWanted+'</td>'+
      '<td><button class="edit-link" type="button" data-edit="'+i.id+'">Edit</button></td></tr>').join('');
    $('#empty-message').hidden=visible.length>0;
    metrics();refreshSaveBar();
  }
  function itemById(id){return items.find(i=>i.id===Number(id));}
  function updateStatus(i,s) {
    if(s==='received')i.quantityReceived=i.quantityWanted;
    else if(s==='partial')i.quantityReceived=i.quantityWanted>1?Math.max(1,Math.min(i.quantityReceived||1,i.quantityWanted-1)):i.quantityWanted;
    else i.quantityReceived=0;
    i.status=s;
    i.status=statusOf(i);
    i.purchased=i.status==='received';
  }
  function updateQuantity(i,n) {
    i.quantityReceived=Math.max(0,Math.min(i.quantityWanted,n));
    i.status=statusOf(i);
    i.purchased=i.status==='received';
  }
  function fillCategorySelect() {
    const choices='<option value="all">All categories</option>'+categories.map(c=>'<option>'+escape(c)+'</option>').join('');
    $('#category-filter').innerHTML=choices;
    $('#edit-form').elements.category.innerHTML=categories.map(c=>'<option>'+escape(c)+'</option>').join('');
  }
  function showEdit(id=null) {
    selectedId=id===null?null:Number(id);
    const i=selectedId===null?{name:'',category:'Nursery',status:'needed',quantityWanted:1,quantityReceived:0,links:[],notes:'',archived:false}:itemById(id);
    const form=$('#edit-form');
    form.reset();$('#edit-error').hidden=true;
    $('#edit-title').textContent=id===null?'Add a gift':'Edit a gift';
    form.elements.name.value=i.name;
    form.elements.category.value=i.category;
    form.elements.wanted.value=i.quantityWanted;
    form.elements.received.value=i.quantityReceived;
    form.elements.status.value=statusOf(i);
    form.elements.links.value=(i.links||[]).join('\n');
    form.elements.notes.value=i.notes||'';
    form.elements.archived.checked=Boolean(i.archived);
    const featuredItem=selectedId!==null&&featured.has(selectedId);
    form.elements.category.disabled=featuredItem;
    form.elements.archived.disabled=featuredItem;
    $('#featured-note').hidden=!featuredItem;
    $('#archive-line').hidden=featuredItem;
    $('#edit-dialog').showModal();
    form.elements.name.focus();
  }
  function closeEdit(){$('#edit-dialog').close();}
  function submitEdit(event) {
    event.preventDefault();
    const form=$('#edit-form');
    const old=selectedId===null?null:itemById(selectedId);
    const wanted=Number(form.elements.wanted.value),qty=Number(form.elements.received.value);
    let status=form.elements.status.value;
    const name=form.elements.name.value.trim();
    const links=form.elements.links.value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    function invalid(msg){$('#edit-error').textContent=msg;$('#edit-error').hidden=false;}
    if(!name)return invalid('Please enter an item name.');
    if(!Number.isInteger(wanted)||wanted<1||wanted>1000)return invalid('Quantity needed must be between 1 and 1000.');
    if(!Number.isInteger(qty)||qty<0||qty>wanted)return invalid('Quantity received must be between 0 and the needed amount.');
    if(links.length>6||links.some(x=>{try{return new URL(x).protocol!=='https:';}catch{return true;}}))return invalid('Use up to six valid HTTPS shopping links, one per line.');
    let received=qty;
    if(status==='received')received=wanted;
    if(status==='reserved'||status==='needed')received=0;
    if(status==='partial'&&(received===0||received>=wanted)){
      if(wanted<2)return invalid('For a quantity of one, choose Received instead of Partly received.');
      return invalid('For Partly received, enter a number greater than zero and less than the total needed.');
    }
    if(received>=wanted)status='received';
    else if(received>0)status='partial';
    const id=selectedId===null?Math.max(-1,...items.map(x=>x.id))+1:selectedId;
    const updated={...(old||{}),id,name,category:old&&featured.has(id)?old.category:form.elements.category.value,
      quantityWanted:wanted,quantityReceived:received,status,purchased:status==='received',
      links,notes:form.elements.notes.value.trim(),archived:old&&featured.has(id)?false:form.elements.archived.checked};
    if(old)items=items.map(x=>x.id===id?updated:x);
    else items=[...items,updated];
    closeEdit();render();
    if(selectedId===null)$('#search').value='';
  }
  async function loadRegistry() {
    clearFailure();
    const data=await request('registry');
    if(!data.registry||!Array.isArray(data.registry.items))throw Error('Received an invalid list');
    revision=data.sha;
    featured=new Set(data.registry.categories.flatMap(c=>c.featured||[]));
    items=data.registry.items.map(standardize);
    original=JSON.stringify(items);
    $('#revision').textContent='Synced with GitHub';
    render();
  }
  async function save() {
    if(saving||!dirty())return;
    saving=true;refreshSaveBar('Saving changes securely…');
    clearFailure();
    try {
      await request('registry',{method:'PUT',body:JSON.stringify({sha:revision,items})});
      await loadRegistry();
      refreshSaveBar('Saved to GitHub! Vercel will publish the changes shortly.');
    }catch(e) {
      failure(e.status===409?'Someone saved a newer version. Your edits are still on this screen. Export a backup, then refresh to review the latest list.':e.message);
    }finally{saving=false;$('#save-button').disabled=!dirty();}
  }
  function lockManager(remembered=false) {
    csrf='';
    $('#manager-panel').hidden=true;
    $('#login-panel').hidden=false;
    if($('#edit-dialog').open)$('#edit-dialog').close();
    $('#login-intro').textContent=remembered
      ? 'Welcome back! This browser is remembered, but the manager password is required again for today.'
      : 'Enter your manager password. This browser will be remembered for 30 days, but you will still sign in every new day.';
    $('#daily-login-note').textContent='For your security, access resets at midnight Pacific Time, including on previously recognized devices.';
  }
  async function checkDailySession() {
    if($('#setup-panel').hidden===false||$('#login-panel').hidden===false||$('#manager-panel').hidden===true)return;
    try {
      const session=await request('session');
      if(!session.authenticated)lockManager(Boolean(session.rememberedDevice));
    }catch(err){if(err.status===401)lockManager(true);}
  }
  async function authenticate() {
    try {
      const setup=await request('setup');
      if(!setup.ready){$('#setup-panel').hidden=false;return;}
      const session=await request('session');
      if(!session.authenticated){lockManager(Boolean(session.rememberedDevice));return;}
      csrf=session.csrf;
      $('#manager-panel').hidden=false;
      await loadRegistry();
    }catch(e){failure(e.message);}
  }
  $('#login-form').addEventListener('submit',async e=>{
    e.preventDefault();clearFailure();
    const button=$('#login-form button');button.disabled=true;
    try {
      const response=await request('login',{method:'POST',body:JSON.stringify({password:$('#login-password').value})});
      csrf=response.csrf;
      $('#login-password').value='';
      $('#login-panel').hidden=true;
      $('#manager-panel').hidden=false;
      if(items.length && dirty()){
        refreshSaveBar('Re-authenticated. Your unsaved edits are still here; save them when ready.');
      } else {
        await loadRegistry();
      }
    }catch(error){failure(error.message);}finally{button.disabled=false;}
  });
  $('#logout-button').addEventListener('click',async()=>{
    if(dirty()&&!confirm('You have unsaved edits. Sign out anyway?'))return;
    try{await request('logout',{method:'POST',body:'{}'});}catch{}
    csrf='';location.reload();
  });
  $('#refresh-button').addEventListener('click',()=>{
    if(dirty()&&!confirm('Discard unsaved edits and load the latest list?'))return;
    loadRegistry().catch(e=>failure(e.message));
  });
  $('#export-button').addEventListener('click',()=>{
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),items},null,2)],{type:'application/json'});
    const a=document.createElement('a');const url=URL.createObjectURL(blob);
    a.href=url;a.download='baby-gift-list-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  });
  $('#search').addEventListener('input',render);
  $('#category-filter').addEventListener('change',render);
  $('#status-filter').addEventListener('change',render);
  $('#show-archived').addEventListener('change',render);
  $('#add-button').addEventListener('click',()=>showEdit());
  $('#save-button').addEventListener('click',save);
  $('#items-body').addEventListener('change',e=>{
    const sel=e.target.closest('[data-status]');
    const field=e.target.closest('[data-qty]');
    if(sel){const i=itemById(sel.dataset.status);updateStatus(i,sel.value);render();}
    if(field){
      const i=itemById(field.dataset.qty);const n=Number(field.value);
      if(!Number.isInteger(n)){failure('Please enter a whole number.');return;}
      updateQuantity(i,n);render();
    }
  });
  $('#items-body').addEventListener('click',e=>{
    const b=e.target.closest('[data-edit]');if(b)showEdit(b.dataset.edit);
  });
  $('#edit-form').addEventListener('submit',submitEdit);
  $('#close-dialog').addEventListener('click',closeEdit);
  $('#cancel-dialog').addEventListener('click',closeEdit);
  $('#edit-dialog').addEventListener('click',e=>{
    if(e.target===$('#edit-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeEdit();}
  });
  window.addEventListener('beforeunload',e=>{
    if(dirty()){e.preventDefault();e.returnValue='';}
  });
  fillCategorySelect();
  // A tab left open overnight locks again, even without a page reload.
  setInterval(checkDailySession, 60*1000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDailySession();});
  authenticate();
})();