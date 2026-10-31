'use strict';
(() => {
  const $ = selector => document.querySelector(selector);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const art = name => `assets/approved/${name}.webp`;
  const check = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-8"/></svg>';
  let registry = null;
  let browseState = {category:'all',status:'all',query:''};
  let returnToBrowse = false;
  let toastTimer;
  const dialog = $('#gift-dialog');
  function statusOf(item) {
    if(item.purchased || item.status==='received') return 'received';
    if(item.status==='partial'||(item.quantityReceived||0)>0)return 'partial';
    if(item.status==='reserved')return 'reserved';
    return 'needed';
  }
  function badge(item) {
    const state=statusOf(item);
    const label=state==='received'?check+'Purchased':state==='reserved'?'Reserved':state==='partial'?'Partly gifted':'Still needed';
    return `<span class="status${state==='received'?' purchased':state==='reserved'?' reserved':state==='partial'?' partial':''}">${label}</span>`;
  }
  function showDialog(title, content) {
    $('#dialog-title').textContent=title;
    $('#dialog-content').innerHTML=content;
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() { if(dialog.open) dialog.close(); }
  function notify(message) {
    $('#toast').textContent=message;$('#toast').hidden=false;
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},3500);
  }
  function renderHome() {
    const {items,categories}=registry;
    const active=items.filter(item=>!item.archived);
    const purchased=active.filter(item=>statusOf(item)==='received').length;
    const percent=Math.round(purchased/Math.max(1,active.length)*100);
    $('#summary-text').textContent=`${purchased} of ${active.length} gifts purchased`;
    $('#progress-percent').textContent=`${percent}%`;
    $('#progress-fill').style.width=`${percent}%`;
    $('.progress-track').setAttribute('aria-valuenow',String(percent));
    $('.progress-track').setAttribute('aria-valuetext',`${purchased} of ${items.length} gifts purchased`);
    $('#purchased-count').textContent=purchased;
    $('#needed-count').textContent=active.length-purchased;
    $('#categories').innerHTML=categories.map(category=>{
      const gifts=category.featured.map(id=>items.find(item=>item.id===id));
      const count=active.filter(item=>item.category===category.name).length;
      return `<article class="category${gifts.length===4?' four-up':''}" aria-labelledby="heading-${category.id}"><div class="category-heading"><h3 id="heading-${category.id}"><span class="category-icon" aria-hidden="true"><img src="${art('heading-'+category.id)}" alt=""></span><span class="category-title-text">${escapeHtml(category.name)}</span></h3><span class="category-count">${count} items</span></div><div class="products" style="--columns:${gifts.length}">${gifts.map(item=>`<button class="product" type="button" data-item="${item.id}" aria-label="${escapeHtml(item.name)} — ${item.purchased?'purchased':'still needed'}"><img class="product-art" src="${art('product-'+item.art)}" width="105" height="90" alt="" decoding="async"><span class="product-name">${escapeHtml(item.label)}</span>${badge(item)}</button>`).join('')}</div><button class="category-more" type="button" data-category="${category.id}">View all ${escapeHtml(category.name.toLowerCase())} items <span class="arrow" aria-hidden="true">→</span></button></article>`;
    }).join('');
  }
  function renderBrowseResults() {
    const query=browseState.query.trim().toLowerCase();
    const category=registry.categories.find(c=>c.id===browseState.category);
    const visible=registry.items.filter(item=>!item.archived&&(!category||item.category===category.name)&&(!query||(item.name+' '+item.category).toLowerCase().includes(query))&&(browseState.status==='all'||(browseState.status==='purchased'?statusOf(item)==='received':statusOf(item)!=='received')));
    $('#result-count').textContent=`${visible.length} gift${visible.length===1?'':'s'}`;
    $('#browse-results').innerHTML=visible.map(item=>`<button class="dialog-gift" type="button" data-item="${item.id}">${item.art?`<img src="${art('product-'+item.art)}" alt="" loading="lazy">`:'<span class="placeholder" aria-hidden="true">From our gift list</span>'}<span>${escapeHtml(item.name)}</span>${badge(item)}</button>`).join('')||'<p>No gifts match these filters.</p>';
  }
  function browse(category='all',status='all',preserve=false) {
    if (!registry) {notify('The gift list is still loading. Please try again.');return;}
    if(!preserve) browseState={category,status,query:''};
    const categoryName=registry.categories.find(c=>c.id===browseState.category)?.name;
    showDialog(categoryName||'Our gift list',`<p>Choose a gift to view its details and shopping links.</p><div class="dialog-toolbar"><input type="search" id="gift-search" placeholder="Search gifts…" aria-label="Search gifts" value="${escapeHtml(browseState.query)}"><select id="gift-status" aria-label="Filter gifts"><option value="all">All gifts</option><option value="needed">Still needed</option><option value="purchased">Purchased</option></select></div><p id="result-count" aria-live="polite"></p><div class="dialog-results" id="browse-results"></div><p class="dialog-note">Purchases at external stores do not automatically update this list. Please let us know when you buy a gift so we can prevent duplicates.</p>`);
    $('#gift-status').value=browseState.status;
    $('#gift-search').addEventListener('input',event=>{browseState.query=event.target.value;renderBrowseResults();});
    $('#gift-status').addEventListener('change',event=>{browseState.status=event.target.value;renderBrowseResults();});
    renderBrowseResults();returnToBrowse=true;
  }
  function showItem(id) {
    const item=registry?.items.find(item=>item.id===id);if(!item)return;
    const cameFromBrowse=Boolean($('#browse-results'))||returnToBrowse;
    const links=item.links.filter(link=>{try{return new URL(link).protocol==='https:';}catch{return false;}});
    showDialog('Gift details',`${cameFromBrowse?'<button class="back-link" id="back-to-results" type="button">← Back to gifts</button>':''}${item.art?`<img class="detail-art" src="${art('product-'+item.art)}" alt="Illustration of ${escapeHtml(item.label.replace(/\n/g,' '))}">`:''}<p class="detail-category">${escapeHtml(item.category)} · ${item.purchased?'Already purchased':'Still needed'}</p><h3 class="detail-name">${escapeHtml(item.name)}</h3>${item.quantityWanted?`<p class="detail-category">Received ${item.quantityReceived||0} of ${item.quantityWanted}</p>`:''}${item.notes?`<p class="dialog-note">${escapeHtml(item.notes)}</p>`:''}<p>${item.purchased?'This gift has already been purchased. Thank you for helping us get ready!':'This item is on our wishlist. Thank you for thinking of our growing family!'}</p><div>${links.map((link,index)=>`<a class="shop-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${links.length>1?'View product option '+(index+1):'View product'} ↗</a>`).join('')}</div>${!links.length?'<p class="dialog-note">A specific store or product has not been selected for this item. Please check with us before buying.</p>':''}<p class="dialog-note">Artwork is illustrative. Use the store link for the exact product, price, size, and availability. Please notify us after buying; this list does not automatically track store purchases.</p><button class="dialog-action secondary" type="button" data-close>Back to the website</button>`);
    $('#back-to-results')?.addEventListener('click',()=>browse(browseState.category,browseState.status,true));
  }
  async function share() {
    const url=new URL(location.href);url.hash='';url.search='';
    const payload={title:'Baby Gift List',text:'A little wishlist for our growing family ♡',url:url.href};
    try {
      if(navigator.share){await navigator.share(payload);return;}
      if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(url.href);notify('Link copied — thank you for sharing!');return;}
    } catch(error) {if(error.name==='AbortError')return;}
    showDialog('Share our gift list',`<p>Copy this link to share with family and friends.</p><input class="copy-url" aria-label="Website address" readonly value="${escapeHtml(url.href)}"><button class="dialog-action" data-close type="button">Done</button>`);
    $('.copy-url').focus();$('.copy-url').select();
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('button,a');if(!target)return;
    if(target.hasAttribute('data-share')){event.preventDefault();share();}
    else if(target.hasAttribute('data-browse')){const status=target.dataset.browse;returnToBrowse=false;browse('all',status==='all'?'all':status);}
    else if(target.hasAttribute('data-category')){returnToBrowse=false;browse(target.dataset.category);}
    else if(target.hasAttribute('data-item')){if(!dialog.open)returnToBrowse=false;showItem(Number(target.dataset.item));}
    else if(target.hasAttribute('data-close')||target.classList.contains('close-dialog'))closeDialog();
  });
  // Capture Escape before search inputs consume it to clear their value.
  dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDialog();}},true);
  dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
  $('#tips-button').addEventListener('click',()=>showDialog('Tips & inspiration','<p>Thank you for helping us prepare for our little one!</p><p class="dialog-note">Check the purchased status before shopping. Where we have chosen a product, follow its store link to confirm the exact model and options. For gifts without a link, please check with us first.</p><p>After purchasing, let us know so we can update the list and avoid duplicates.</p><button type="button" class="dialog-action" data-browse="needed">See gifts still needed</button>'));
  fetch('data/registry.json').then(response=>{if(!response.ok)throw new Error(`Registry HTTP ${response.status}`);return response.json();}).then(data=>{
    if(!Array.isArray(data.items)||!Array.isArray(data.categories)||!data.items.length)throw new Error('Invalid registry');
    registry=data;renderHome();
  }).catch(error=>{console.error('Registry load failed:',error);$('#load-error').hidden=false;$('#summary-text').textContent='Gift list unavailable';});
})();
