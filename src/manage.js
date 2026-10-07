import { artworks, portfolio, replacePortfolio } from './artworks.js';
import { refreshGallery, setCuratorMode, setCuratorTool } from './scene.js';

if (import.meta.env.DEV && /^\/manage\/?$/.test(location.pathname)) {
  const tokenKey = 'illustration-curator-token';
  const artworkCategories = [['vtuber','VTUBER'],['pngtuber','PNGTUBER'],['stream-assets','STREAM ASSETS'],['illustration','ILLUSTRATION'],['character-design','CHARACTER DESIGN'],['other','OTHER']];
  const serviceCategories = [['vtuber','VTUBER'],['pngtuber','PNGTUBER'],['stream-assets','STREAM ASSETS'],['illustration','ILLUSTRATION']];
  const root = document.querySelector('#app');
  const panel = document.createElement('section');
  panel.id = 'curator';
  panel.setAttribute('aria-label', 'Curator workspace');
  document.body.append(panel);
  root.classList.add('curator-active');

  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  let token = sessionStorage.getItem(tokenKey) || '';
  let state = null;
  let selectedId = null;
  let selectedService = null;
  let activeTab = 'artwork';
  let tool = 'move';
  let dirty = false;
  let savedSnapshot = '';
  let preview = false;
  let history = [];
  let future = [];
  const status = message => { const el = panel.querySelector('[data-status]'); if (el) el.textContent = message; };
  const request = async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...(options.body ? { 'content-type':'application/json' } : {}), ...(token ? { authorization:`Bearer ${token}` } : {}), ...options.headers } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  };
  const snapshot = () => JSON.stringify(state);
  const remember = () => { history.push(snapshot()); if (history.length > 40) history.shift(); future = []; dirty = true; status('Unsaved changes'); };
  const getArt = () => state.artworks.find(art => art.id === selectedId) || null;
  const normalized = value => ({ ...value, artworks:value.artworks.map(({ placement = {}, ...art }) => ({ ...art, scene:placement.scene || 'gallery', position:placement.position || [0,0,-3], size:placement.size || [1.5,1.5], rotation:placement.rotation || 0, visible:placement.visible !== false, published:placement.published !== false, featured:Boolean(placement.featured), archived:Boolean(placement.archived), placement })) });
  const serialized = () => ({ ...state, artworks:state.artworks.map(({ position, size, rotation, visible, published, featured, archived, scene, placement, ...art }) => ({ ...art, placement:{ scene:scene || 'gallery', position:[...position], size:[...size], rotation, visible:visible !== false, published:published !== false, featured:Boolean(featured), archived:Boolean(archived) } })), commissions:state.commissions.map(service=>({...service,categoryLabel:serviceCategories.find(([value])=>value===service.category)?.[1]||service.category?.toUpperCase()})) });
  const persistPlacement = art => {
    const { position, rotation, size, visible, published, featured, archived, scene } = art;
    art.placement = { scene: scene || 'gallery', position: [...position], rotation, size: [...size], visible: visible !== false, published: published !== false, featured: Boolean(featured), archived: Boolean(archived) };
  };
  const refreshData = () => {
    replacePortfolio(state);
    refreshGallery(state);
    window.dispatchEvent(new CustomEvent('portfolio-updated'));
  };
  const sync = () => {
    for (const art of state.artworks) persistPlacement(art);
    refreshData();
    if(selectedId) window.dispatchEvent(new CustomEvent('curator-select',{detail:{id:selectedId}}));
    renderList();
    renderFields();
    status(dirty ? 'Unsaved changes' : 'Saved');
  };

  function loginScreen(error = '') {
    panel.innerHTML = `<div class="curator-login"><p class="curator-kicker">PRIVATE STUDIO / CURATOR ACCESS</p><h1>Enter the<br><em>exhibition.</em></h1><p>The curator access token is printed in the terminal running the local Vite server.</p><form data-login><label>Access token<input name="token" type="password" autocomplete="current-password" required /></label><button type="submit">Enter curator mode ↗</button><p class="curator-error">${escapeHTML(error)}</p></form><a href="/" class="curator-exit">← Return to the public exhibition</a></div>`;
    panel.querySelector('[data-login]').addEventListener('submit', async event => {
      event.preventDefault();
      token = new FormData(event.currentTarget).get('token').toString().trim();
      const button = event.currentTarget.querySelector('button'); button.disabled = true; button.textContent = 'Checking access…';
      try {
        await request('/api/manage/auth', { method:'POST', body:JSON.stringify({ token }) });
        sessionStorage.setItem(tokenKey, token);
        state = normalized(await request('/api/manage/portfolio'));
        savedSnapshot = JSON.stringify(state);
        selectedId = state.artworks[0]?.id || null;
        setCuratorMode(true);
        sync();
        editorScreen();
      } catch (error) { token = ''; sessionStorage.removeItem(tokenKey); loginScreen(error.message); }
    });
  }

  function editorScreen() {
    panel.innerHTML = `<header class="curator-bar"><a href="/" class="curator-wordmark">CURATOR'S ROOM <span>PRIVATE / LOCAL</span></a><nav class="curator-tools" aria-label="Curator tools"><button data-action="add">+ ADD ARTWORK</button><button data-action="undo">UNDO</button><button data-action="redo">REDO</button><button data-action="preview">PREVIEW</button><button data-action="save" class="curator-save">SAVE CHANGES</button></nav><span class="curator-status" data-status>Saved</span></header><div class="curator-board"><aside class="curator-list"><p class="curator-kicker">THE EXHIBITION / <span data-count></span></p><div data-art-list></div><div class="curator-list-bottom"><button data-action="add">+ Add artwork</button><a href="/" target="_blank">Open public site ↗</a></div></aside><section class="curator-editor"><div class="curator-tabs"><button data-tab="artwork" class="is-active">ARTWORK</button><button data-tab="commissions">COMMISSIONS</button><button data-tab="studio">STUDIO NOTE</button></div><div data-editor-content></div></section></div>`;
    panel.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.action)));
    panel.querySelectorAll('[data-tab]').forEach(button => button.addEventListener('click', () => { activeTab = button.dataset.tab; renderTabs(); renderFields(); }));
    window.addEventListener('curator-select', event => { selectedId = event.detail.id; renderList(); renderFields(); });
    window.addEventListener('curator-move-start', () => remember());
    window.addEventListener('curator-move', event => { selectedId = event.detail.id; const art = getArt(); if (!art) return; art.position = [...event.detail.position]; art.size=[...event.detail.size]; art.rotation=event.detail.rotation; art.placement.position = [...art.position]; art.placement.size=[...art.size]; art.placement.rotation=art.rotation; dirty = true; status('Unsaved changes'); updateNumbers(); });
    window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('keydown', event => { if (event.key === 'Escape' && preview) leavePreview(); });
    renderTabs(); renderList(); renderFields();
  }

  function renderTabs() {
    panel.querySelectorAll('[data-tab]').forEach(button => button.classList.toggle('is-active', button.dataset.tab === activeTab));
  }
  function renderList() {
    const list = panel.querySelector('[data-art-list]'); if (!list) return;
    panel.querySelector('[data-count]').textContent = String(state.artworks.length).padStart(2, '0');
    list.replaceChildren(...state.artworks.map((art, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = `curator-art-item${art.id === selectedId ? ' is-selected' : ''}`;
      button.innerHTML = `<span>${String(index + 1).padStart(2,'0')}</span><strong>${escapeHTML(art.title || 'Untitled')}</strong><small>${art.archived ? 'ARCHIVED' : art.published === false || art.visible === false ? 'UNPUBLISHED' : escapeHTML(art.categoryLabel || art.category?.toUpperCase() || 'OTHER')}</small>`;
      button.addEventListener('click', () => { selectedId = art.id; window.dispatchEvent(new CustomEvent('curator-select',{detail:{id:art.id}})); renderList(); renderFields(); }); return button;
    }));
  }
  function formField(label, key, value, type = 'text', wide = false) {
    const area = type === 'textarea';
    return `<label class="curator-field${wide ? ' wide' : ''}">${label}<${area ? 'textarea' : 'input'} data-field="${key}" ${area ? 'rows="3"' : `type="${type}"`} ${area ? '' : 'step="any"'}>${area ? escapeHTML(value) : ''}</${area ? 'textarea' : 'input'}></label>`;
  }
  function renderFields() {
    const content = panel.querySelector('[data-editor-content]'); if (!content || !state) return;
    if (activeTab === 'artwork') {
      const art = getArt();
      if (!art) { content.innerHTML = '<p class="curator-empty">Add an artwork to begin arranging the exhibition.</p>'; return; }
      content.innerHTML = `<div class="curator-heading"><div><p class="curator-kicker">SELECTED WORK / ${escapeHTML(art.id)}</p><h2>${escapeHTML(art.title)}</h2></div><label class="curator-upload">REPLACE IMAGE<input data-image type="file" accept="image/png,image/jpeg,image/webp" /></label></div><div class="curator-form-grid">${formField('Title','title',art.title)}${formField('Year','year',art.year)}${formField('Medium / type','medium',art.medium,true)}<label class="curator-field">Category<select data-field="category">${artworkCategories.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>${formField('Description','description',art.description,'textarea',true)}${formField('Story (optional)','storyBody',art.storyBody || art.story || '','textarea',true)}${formField('Client (optional)','client',art.client || '')}${formField('External link (optional)','link',art.link || '','url')}<div class="curator-field wide curator-image-field"><span>ARTWORK IMAGE</span><img src="${escapeHTML(art.image)}" alt="Current artwork" /></div></div><div class="curator-placement"><div class="curator-section-title"><span>PLACEMENT / GALLERY WALL</span><div class="curator-modes"><button data-tool="move">MOVE</button><button data-tool="rotate">ROTATE</button><button data-tool="scale">SCALE</button></div></div><p>Drag the selected artwork in the scene. Use these controls for precise placement.</p><div class="curator-form-grid placement-grid">${formField('X','x',art.position[0],'number')}${formField('Y','y',art.position[1],'number')}${formField('Depth','z',art.position[2],'number')}${formField('Rotation°','rotation',Math.round((art.rotation || 0) * 180 / Math.PI),'number')}${formField('Scale','scale',art.size[0],'number')}</div><div class="curator-flags"><label><input data-flag="published" type="checkbox" ${art.published !== false ? 'checked' : ''}/> Published</label><label><input data-flag="featured" type="checkbox" ${art.featured ? 'checked' : ''}/> Featured</label><label><input data-flag="archived" type="checkbox" ${art.archived ? 'checked' : ''}/> Archive</label><button data-action="duplicate">Duplicate</button><button data-action="delete" class="curator-delete">Delete</button></div></div>`;
      const category = content.querySelector('[data-field="category"]'); category.value = artworkCategories.some(([value])=>value===art.category) ? art.category : 'other';
      content.querySelectorAll('[data-tool]').forEach(button => { button.classList.toggle('selected', button.dataset.tool === tool); button.addEventListener('click', () => { tool = button.dataset.tool; setCuratorTool(tool); content.querySelectorAll('[data-tool]').forEach(item => item.classList.toggle('selected', item === button)); }); });
      content.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', () => changeArtworkField(input)));
      content.querySelectorAll('[data-flag]').forEach(input => input.addEventListener('change', () => { remember(); art[input.dataset.flag] = input.checked; sync(); }));
      content.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => action(button.dataset.action)));
      content.querySelector('[data-image]').addEventListener('change', uploadImage);
      return;
    }
    if (activeTab === 'commissions') { renderCommissions(content); return; }
    renderProfile(content);
  }
  function changeArtworkField(input) {
    const art = getArt(); if (!art) return;
    remember();
    const key = input.dataset.field;
    if (['x','y','z','rotation','scale'].includes(key)) {
      const value = Number(input.value); if (!Number.isFinite(value)) return;
      if (key === 'x') art.position[0] = Math.max(-5.3, Math.min(5.3, value));
      if (key === 'y') art.position[1] = Math.max(-3.1, Math.min(3.1, value));
      if (key === 'z') art.position[2] = Math.max(-12, Math.min(-2, value));
      if (key === 'rotation') art.rotation = Math.max(-180, Math.min(180, value)) * Math.PI / 180;
      if (key === 'scale') art.size = [Math.max(.4, Math.min(4, value)), Math.max(.4, Math.min(4, value))];
      art.position = [...art.position]; art.placement.position = [...art.position]; art.placement.rotation = art.rotation; art.placement.size = [...art.size];
      sync(); return;
    }
    art[key] = input.value;
    if (key === 'category') art.categoryLabel = artworkCategories.find(([value])=>value===art.category)?.[1] || 'OTHER';
    refreshData(); renderList(); status('Unsaved changes');
  }
  function updateNumbers() {
    const art = getArt(); if (!art) return;
    for (const [key, value] of Object.entries({ x:art.position[0], y:art.position[1], z:art.position[2], rotation:Math.round(art.rotation * 180 / Math.PI), scale:art.size[0] })) {
      const input = panel.querySelector(`[data-field="${key}"]`); if (input && document.activeElement !== input) input.value = value;
    }
  }
  function renderCommissions(content) {
    const active = state.commissions.find(item => item.id === selectedService) || state.commissions[0]; selectedService = active?.id || null;
    content.innerHTML = `<div class="curator-heading"><div><p class="curator-kicker">THE OFFER / CONFIGURABLE DETAILS</p><h2>Commission work</h2></div><button data-add-service>+ ADD TYPE</button></div><div class="curator-service-layout"><nav data-service-list></nav><div data-service-form></div></div>`;
    const list = content.querySelector('[data-service-list]');
    list.replaceChildren(...state.commissions.map(item => { const button=document.createElement('button'); button.textContent=item.title; button.className=item.id===selectedService?'selected':''; button.onclick=()=>{selectedService=item.id;renderFields();}; return button; }));
    const form=content.querySelector('[data-service-form]');
    if (!active) { form.innerHTML='<p class="curator-empty">Add a commission type to describe available work.</p>'; }
    else {
      form.innerHTML=`<label class="curator-field">Category<select data-field="serviceCategory">${serviceCategories.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>${formField('Service name','serviceTitle',active.title)}${formField('Short description','serviceDescription',active.description,'textarea',true)}${formField('What is included (optional)','serviceReceives',active.receives,'textarea',true)}<label class="curator-field">Example artwork (optional)<select data-service-art><option value="">No example selected</option>${state.artworks.map(art=>`<option value="${escapeHTML(art.id)}">${escapeHTML(art.title)}</option>`).join('')}</select></label>${formField('Price / quote note (optional)','price',active.price || '')}${formField('Turnaround (optional)','turnaround',active.turnaround || '')}${formField('Availability (optional)','availability',active.availability || '')}<label class="curator-check"><input data-service-featured type="checkbox" ${active.featured?'checked':''}/> Featured offering</label><label class="curator-check"><input data-service-published type="checkbox" ${active.published?'checked':''}/> Published on commissions page</label><button class="curator-delete" data-remove-service>Remove this offering</button>`;
      form.querySelector('[data-field="serviceCategory"]').value=serviceCategories.some(([value])=>value===active.category)?active.category:'illustration';
      form.querySelector('[data-service-art]').value=active.artworkId || '';
      form.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('change',()=>{remember(); const key=input.dataset.field; active[{serviceCategory:'category',serviceTitle:'title',serviceDescription:'description',serviceReceives:'receives'}[key] || key]=input.value; active.categoryLabel=serviceCategories.find(([value])=>value===active.category)?.[1]||'ILLUSTRATION'; refreshData(); status('Unsaved changes');}));
      form.querySelector('[data-service-art]').onchange=event=>{remember();active.artworkId=event.target.value;refreshData();};
      form.querySelector('[data-service-featured]').onchange=event=>{remember();active.featured=event.target.checked;refreshData();};
      form.querySelector('[data-service-published]').onchange=event=>{remember();active.published=event.target.checked;refreshData();};
      form.querySelector('[data-remove-service]').onclick=()=>{if(!confirm('Remove this commission offering?'))return;remember();state.commissions=state.commissions.filter(item=>item.id!==active.id);selectedService=state.commissions[0]?.id||null;renderFields();};
    }
    content.querySelector('[data-add-service]').onclick=()=>{remember();const item={id:`service-${crypto.randomUUID().slice(0,8)}`,artworkId:'',category:'illustration',categoryLabel:'ILLUSTRATION',title:'',description:'',receives:'',price:'',turnaround:'',availability:'',featured:false,published:false};state.commissions.push(item);selectedService=item.id;renderFields();};
  }
  function renderProfile(content) {
    const profile=state.profile;
    content.innerHTML=`<div class="curator-heading"><div><p class="curator-kicker">PUBLIC BIOGRAPHY / CONTACT</p><h2>Studio note</h2></div></div><div class="curator-form-grid">${formField('Artist / studio name','artistName',profile.artistName)}${formField('Location','location',profile.location)}${formField('Biography','biography',profile.biography,'textarea',true)}${formField('Artistic focus','focus',profile.focus,'textarea',true)}${formField('Mediums','mediums',profile.mediums,'textarea',true)}${formField('Email','email',profile.email,'email')}${formField('Instagram URL','instagram',profile.instagram,'url')}${formField('Are.na URL','areNa',profile.areNa,'url')}${formField('Commission availability','availability',profile.availability,'textarea',true)}</div>`;
    content.querySelectorAll('[data-field]').forEach(input=>input.addEventListener('change',()=>{remember();profile[input.dataset.field]=input.value;refreshData();status('Unsaved changes');}));
  }
  async function uploadImage(event) {
    const file=event.target.files[0]; if(!file)return;
    const art=getArt();
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024){status('Choose a PNG, JPEG, or WebP under 8 MB');return;}
    const bitmap=await createImageBitmap(file);
    if(bitmap.width<128||bitmap.height<128||bitmap.width>6000||bitmap.height>6000||bitmap.width*bitmap.height>30000000){bitmap.close();status('Image must be 128–6,000 px per side and under 30 megapixels');return;}
    const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    status('Optimizing image…');
    try{const data=canvas.toDataURL('image/webp',.88);const result=await request('/api/manage/image',{method:'POST',body:JSON.stringify({data})});remember();art.image=result.image;sync();status('Unsaved changes');}
    catch(error){status(error.message);}
  }
  async function action(name) {
    if(name==='add'){
      remember();const id=`work-${crypto.randomUUID().slice(0,8)}`;state.artworks.unshift({id,title:'New artwork',category:'other',categoryLabel:'OTHER',year:String(new Date().getFullYear()),medium:'',image:'/artworks/little-hour.jpg',description:'',story:'',storyBody:'',client:null,link:null,position:[0,0,-3.5],size:[1.65,1.65],rotation:0,visible:true,published:true,featured:false,archived:false,scene:'gallery',placement:{scene:'gallery',position:[0,0,-3.5],size:[1.65,1.65],rotation:0,visible:true,published:true,featured:false,archived:false}});selectedId=id;sync();activeTab='artwork';renderTabs();renderFields();panel.querySelector('[data-image]').click();return;
    }
    if(name==='save'){
      status('Saving…');const button=panel.querySelector('[data-action="save"]');button.disabled=true;
      try{for(const art of state.artworks)persistPlacement(art);await request('/api/manage/portfolio',{method:'PUT',body:JSON.stringify(serialized())});dirty=false;history=[];future=[];savedSnapshot=JSON.stringify(state);status('Saved');}
      catch(error){status(error.message);}finally{button.disabled=false;}return;
    }
    if(name==='preview'){
      if(dirty&&!confirm('There are unsaved changes. Preview the last saved exhibition?'))return;
      if(dirty){state=normalized(await request('/api/manage/portfolio'));sync();dirty=false;savedSnapshot=JSON.stringify(state);}
      preview=true;panel.hidden=true;root.classList.remove('curator-active');setCuratorMode(false);return;
    }
    if(name==='undo'&&history.length){future.push(snapshot());state=JSON.parse(history.pop());dirty=snapshot()!==savedSnapshot;sync();status(dirty?'Unsaved changes':'Saved');return;}
    if(name==='redo'&&future.length){history.push(snapshot());state=JSON.parse(future.pop());dirty=snapshot()!==savedSnapshot;sync();status(dirty?'Unsaved changes':'Saved');return;}
    if(name==='duplicate'){
      const art=getArt();if(!art)return;remember();const copy=JSON.parse(JSON.stringify(art));copy.id=`work-${crypto.randomUUID().slice(0,8)}`;copy.title=`${copy.title} copy`;copy.position[0]=Math.min(5.3,copy.position[0]+.45);copy.placement.position=[...copy.position];state.artworks.splice(state.artworks.indexOf(art)+1,0,copy);selectedId=copy.id;sync();return;
    }
    if(name==='delete'){
      const art=getArt();if(!art||!confirm(`Delete “${art.title}” from the portfolio?`))return;remember();state.artworks=state.artworks.filter(item=>item.id!==art.id);for(const service of state.commissions)if(service.artworkId===art.id)service.artworkId=state.artworks[0]?.id||'';selectedId=state.artworks[0]?.id||null;sync();return;
    }
  }
  function leavePreview() { preview=false;panel.hidden=false;root.classList.add('curator-active');setCuratorMode(true);status(dirty?'Unsaved changes':'Saved'); }

  loginScreen();
  if(token) panel.querySelector('[data-login] input').value=token;
  if(token) panel.querySelector('[data-login]').requestSubmit();
}
