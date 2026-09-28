import { TerritoryScene } from './scene.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const statusNames = {open:'Reportado',progress:'En atención',resolved:'Resuelto'};
const categoryNames = {access:'Accesibilidad',safety:'Seguridad vial',public:'Espacio público'};
const STORAGE = 'sjl3d-geographic-reports-v2';
let map, geography, reports=[], selectedId=null, statusFilter=null, pendingPoint=null, toastTimer;
let searchEntries=[];
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normalize = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const icons = () => window.lucide?.createIcons();
const timestamp = () => new Date().toISOString();
const dateLabel = date => new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(date));
const coordinateText = (x,z) => map.geo(x,z).map(n=>n.toFixed(5)).join(', ');

function showToast(message) {
  $('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4200);
}
function persist() {
  try {localStorage.setItem(STORAGE,JSON.stringify({version:2,reports}));return true;}
  catch {showToast('No se pudo guardar. Exporta los reportes antes de cerrar esta página.');return false;}
}
function nearestRoad(x,z,avenue=null) {
  let closest=null,best=Infinity;
  for(const road of geography.roads) {
    if(!road.tags.name || (avenue&&!normalize(road.tags.name).includes(normalize(avenue))))continue;
    for(let i=0;i<road.points.length-1;i++){
      const a=road.points[i],b=road.points[i+1],dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz;
      const t=den?Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/den)):0;
      const px=a[0]+dx*t,pz=a[1]+dz*t,d=(px-x)**2+(pz-z)**2;
      if(d<best){best=d;closest={name:road.tags.name,x:px,z:pz,distance:Math.sqrt(d)};}
    }
  }
  return closest;
}
function makeSamples() {
  const examples=[
    ['R-041','access','Rampa ocupada en el cruce','Ejemplo: el acceso peatonal se encuentra bloqueado.','open',-100,-1174,'Wiesse'],
    ['R-039','safety','Señalización poco visible','Ejemplo: señal del cruce que necesita mantenimiento.','progress',-1500,680,'Wiesse'],
    ['R-036','access','Vereda con desnivel','Ejemplo: un cambio de nivel dificulta el recorrido peatonal.','open',-1600,-1100,'Canto Grande'],
    ['R-032','public','Luminaria fuera de servicio','Ejemplo: luminaria apagada junto al recorrido peatonal.','progress',500,-3860,'Wiesse'],
    ['R-029','public','Cruce peatonal renovado','Ejemplo: mantenimiento finalizado en el sector.','resolved',580,-2140,'Wiesse']
  ];
  return examples.map(([id,category,title,description,status,x,z,avenue])=>{
    const p=nearestRoad(x,z,avenue);
    return {id,category,title,description,status,x:p.x,z:p.z,place:p.name,demo:true,reporter:'Ciudadano de ejemplo',initials:'DE',date:timestamp(),history:[{text:'Reporte de demostración',date:timestamp()}]};
  });
}
function validReport(r) {
  return r&&typeof r.id==='string'&&typeof r.title==='string'&&typeof r.description==='string'&&
    Object.hasOwn(statusNames,r.status)&&Object.hasOwn(categoryNames,r.category)&&Number.isFinite(r.x)&&Number.isFinite(r.z)&&
    map.withinData(r.x,r.z)&&Array.isArray(r.history)&&r.history.every(h=>h&&typeof h.text==='string'&&!Number.isNaN(Date.parse(h.date)))&&!Number.isNaN(Date.parse(r.date));
}
function loadReports() {
  try {
    const state=JSON.parse(localStorage.getItem(STORAGE)||'null');
    if(state?.version===2&&Array.isArray(state.reports)){
      reports=state.reports.filter(validReport);
      if(reports.length || state.reports.length===0)return;
    }
  } catch {showToast('El almacenamiento anterior no pudo leerse. Se conservan sus datos sin sobrescribirlos.');}
  reports=makeSamples();
  // Preserve earlier local reports, relocating conceptual coordinates to their named avenue.
  try {
    const previous=JSON.parse(localStorage.getItem('sjl3d-reports')||'[]');
    for(const r of Array.isArray(previous)?previous:[]){
      if(!r.local||!r.title||!Object.hasOwn(categoryNames,r.category))continue;
      const p=nearestRoad(-1000,-800,String(r.place).includes('Canto')?'Canto Grande':'Wiesse');
      reports.unshift({id:'M-'+r.id,category:r.category,title:r.title,description:String(r.description||''),status:statusNames[r.status]?r.status:'open',x:p.x,z:p.z,place:p.name,reporter:r.reporter||'Ciudadano local',initials:r.initials||'CL',date:timestamp(),demo:false,approximate:true,history:[{text:'Migrado del prototipo. Ubicación aproximada por avenida.',date:timestamp()}]});
    }
  } catch { /* The previous storage remains untouched. */ }
}
function visibleReports() {
  const categories=$$('.layer-item input:checked').map(input=>input.value);
  return reports.filter(r=>categories.includes(r.category)&&(!statusFilter||r.status===statusFilter));
}
function render() {
  const visible=visibleReports();
  $('#reportList').innerHTML=visible.length?'':'<p class="empty-list">No hay reportes con estos filtros.</p>';
  visible.forEach(report=>{
    const button=document.createElement('button');
    button.className='report-row'+(report.id===selectedId?' selected':'');button.dataset.id=report.id;
    button.innerHTML='<span class="row-dot '+report.status+'"></span><span class="row-copy"><strong>'+esc(report.title)+'</strong><small>'+esc(report.place)+' · '+statusNames[report.status]+'</small><em>'+(report.demo?'Ejemplo ficticio':esc(report.id))+'</em></span><i data-lucide="chevron-right"></i>';
    button.addEventListener('click',()=>selectReport(report.id));$('#reportList').append(button);
  });
  $('#listCount').textContent=visible.length;
  for(const status of Object.keys(statusNames))$('#'+status+'Count').textContent=reports.filter(r=>r.status===status).length;
  $$('.metric-strip button').forEach(button=>button.classList.toggle('active',button.dataset.status===statusFilter));
  $$('.layer-item').forEach(label=>label.querySelector('small').textContent=reports.filter(r=>r.category===label.querySelector('input').value).length);
  map.setReports(visible,selectedId,selectReport);
  if(selectedId&&!visible.some(r=>r.id===selectedId))$('#detailPanel').classList.add('closed');
  icons();
}
function selectReport(id) {
  const report=reports.find(r=>r.id===id);if(!report)return;
  selectedId=id;render();updateDetail();$('#detailHistory').hidden=true;
  $('#detailPanel').classList.remove('closed');map.focus(report.x,report.z,650);
  if(matchMedia('(max-width:760px)').matches)$('#mapPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function updateDetail() {
  const r=reports.find(r=>r.id===selectedId);if(!r)return;
  $('#detailId').textContent=r.id;$('#detailCategory').textContent=categoryNames[r.category];
  $('#detailTitle').textContent=r.title;$('#detailDescription').textContent=r.description;
  $('#detailStatus').textContent=statusNames[r.status];$('#detailStatus').className='status-chip '+r.status;
  $('#detailDate').textContent=r.demo?'Ejemplo ficticio':dateLabel(r.date);
  $('#detailStreet').textContent=r.place;$('#detailCoordinates').textContent=coordinateText(r.x,r.z)+(r.approximate?' · aproximado':'');
  $('#detailReporter').textContent=r.reporter;$('#detailAvatar').textContent=r.initials;
  $('#detailOrigin').textContent=r.demo?'DEMOSTRACIÓN':'LOCAL';
  const role=$('#roleSelect').value;
  const labels=role==='citizen'?{open:'Ver seguimiento',progress:'Ver seguimiento',resolved:'Ver historial'}:role==='admin'?{open:'Asignar a técnico de zona',progress:'Confirmar resolución',resolved:'Ver historial'}:{open:'Iniciar atención',progress:'Resolver incidencia',resolved:'Ver historial'};
  $('#detailAction').textContent=labels[r.status];
  $('#detailHistory').innerHTML=r.history.map(h=>'<li>'+esc(h.text)+'<small>'+esc(dateLabel(h.date))+'</small></li>').join('');
}
function action() {
  const r=reports.find(r=>r.id===selectedId);if(!r)return;
  const role=$('#roleSelect').value;
  if(role==='citizen'||r.status==='resolved'){$('#detailHistory').hidden=!$('#detailHistory').hidden;return;}
  r.status=r.status==='open'?'progress':'resolved';
  r.history.push({text:role==='admin'?(r.status==='progress'?'Asignado al técnico de zona':'Resolución confirmada por administración'):(r.status==='progress'?'Atención iniciada por el técnico':'Incidencia resuelta por el técnico'),date:timestamp()});
  const saved=persist();render();updateDetail();$('#detailHistory').hidden=false;
  if(saved)showToast('Estado actualizado y guardado en este navegador.');
}
function beginPlacement() {
  if(!map)return;
  map.setTour(false);$('#detailPanel').classList.add('closed');
  map.followTrain(false);
  map.placing=true;$('#placementBanner').hidden=false;$('#mapPanel').classList.add('placing');
  if(matchMedia('(max-width:760px)').matches)$('#mapPanel').scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelPlacement() {map.placing=false;$('#placementBanner').hidden=true;$('#mapPanel').classList.remove('placing');}
function picked(x,z) {
  if(!map.withinData(x,z)){showToast('Selecciona un punto dentro de la zona cartografiada.');return;}
  const near=nearestRoad(x,z);
  pendingPoint={x:Math.round(x*10)/10,z:Math.round(z*10)/10,place:near&&near.distance<250?near.name:'Sector de SJL'};
  cancelPlacement();$('#issuePlace').textContent=pendingPoint.place;$('#issueCoordinates').textContent=coordinateText(x,z);
  $('#reportModal').showModal();
}
function newReport(event) {
  event.preventDefault();if(!pendingPoint||!$('#reportForm').reportValidity())return;
  const title=$('#issueTitle').value.trim(),description=$('#issueDescription').value.trim();
  if(title.length<5||description.length<10)return showToast('Completa un título y una descripción del problema.');
  const report={...pendingPoint,id:'SJL-'+Date.now().toString(36).toUpperCase(),title,description,category:$('#issueCategory').value,status:'open',date:timestamp(),reporter:'Ciudadano local',initials:'CL',demo:false,history:[{text:'Incidencia registrada por el ciudadano',date:timestamp()}]};
  reports.unshift(report);const saved=persist();
  statusFilter=null;$$('.layer-item input').forEach(i=>i.checked=true);
  $('#reportModal').close();$('#reportForm').reset();pendingPoint=null;
  selectReport(report.id);if(saved)showToast('Reporte registrado con coordenadas y guardado en este navegador.');
}
function buildSearch() {
  const names=new Map();
  for(const road of geography.roads){const name=road.tags.name;if(!name)continue;if(!names.has(name))names.set(name,[]);names.get(name).push(...road.points);}
  searchEntries=[...names].map(([name,p])=>({name,x:p.reduce((s,v)=>s+v[0],0)/p.length,z:p.reduce((s,v)=>s+v[1],0)/p.length,kind:'road'}));
  for(const p of geography.places.filter(p=>p.name))searchEntries.push({name:(p.type==='station'?'Estación ':'')+p.name,x:p.point[0],z:p.point[1],kind:p.type});
  searchEntries.sort((a,b)=>a.name.localeCompare(b.name));
  $('#placesList').innerHTML=searchEntries.map(p=>'<option value="'+esc(p.name)+'"></option>').join('');
}
function search() {
  const query=normalize($('#placeSearch').value);if(!query)return;
  const found=searchEntries.find(p=>normalize(p.name)===query)||searchEntries.find(p=>normalize(p.name).includes(query));
  if(!found)return showToast('No se encontró ese lugar en la cartografía descargada.');
  $('#detailPanel').classList.add('closed');
  const station=map.metro.stations.findIndex(s=>normalize('Estación '+s.name)===normalize(found.name));
  if(station>=0){map.showMetro(true);$('#showMetro').checked=true;map.viewStation(station);$('#metroStation').value=station;}else map.focus(found.x,found.z,found.kind==='road'?1100:700);
  $('#placeSearch').value=found.name;
}
function download(url,name) {const a=document.createElement('a');a.href=url;a.download=name;a.click();}
function wire() {
  $('#newReport').addEventListener('click',beginPlacement);
  $('#cancelPlacement').addEventListener('click',cancelPlacement);
  $('#changeLocation').addEventListener('click',()=>{$('#reportModal').close();beginPlacement();});
  $('#reportForm').addEventListener('submit',newReport);
  for(const id of ['modalClose','cancelReport'])$('#'+id).addEventListener('click',()=>$('#reportModal').close());
  $('#closeDetail').addEventListener('click',()=>$('#detailPanel').classList.add('closed'));
  $('#detailAction').addEventListener('click',action);
  $('#roleSelect').addEventListener('change',()=>{updateDetail();$('#listTitle').textContent=$('#roleSelect').value==='admin'?'GESTIÓN DEL TERRITORIO':$('#roleSelect').value==='technician'?'ATENCIÓN DE INCIDENCIAS':'REPORTES DEL TERRITORIO';});
  $$('.layer-item input').forEach(input=>input.addEventListener('change',render));
  $$('.metric-strip button').forEach(button=>button.addEventListener('click',()=>{statusFilter=statusFilter===button.dataset.status?null:button.dataset.status;render();}));
  $('#seeAll').addEventListener('click',()=>{statusFilter=null;$$('.layer-item input').forEach(input=>input.checked=true);render();});
  $('#resetView').addEventListener('click',()=>{$('#detailPanel').classList.add('closed');map.home();});
  $('#toggleView').addEventListener('click',()=>{$('#detailPanel').classList.add('closed');map.overview();});
  $('#zoomIn').addEventListener('click',()=>map.zoom(.65));
  $('#zoomOut').addEventListener('click',()=>map.zoom(1.5));
  $('#northView').addEventListener('click',()=>map.north());
  $('#toggleSidebar').addEventListener('click',()=>{$('#workspace').classList.toggle('sidebar-hidden');$('#toggleSidebar').setAttribute('aria-expanded',!$('#workspace').classList.contains('sidebar-hidden'));});
  $('#showBuildings').addEventListener('change',event=>{map.buildings.visible=event.target.checked;map.infill.visible=event.target.checked&&$('#showEstimated').checked;map.renderer.shadowMap.needsUpdate=true;});
  $('#showEstimated').addEventListener('change',event=>{map.infill.visible=event.target.checked&&$('#showBuildings').checked;map.renderer.shadowMap.needsUpdate=true;});
  $('#showCorridor').addEventListener('change',event=>map.corridor.visible=event.target.checked);
  $('#showLabels').addEventListener('change',event=>{map.showLabels=event.target.checked;map.updateLabels();});
  $('#showMetro').addEventListener('change',event=>map.showMetro(event.target.checked));
  const enableMetro=()=>{map.showMetro(true);$('#showMetro').checked=true;$('#detailPanel').classList.add('closed');};
  const stationView=()=>{enableMetro();map.viewStation(Number($('#metroStation').value));};
  $('#metroStation').addEventListener('change',stationView);$('#metroStationGo').addEventListener('click',stationView);
  $('#followTrain').addEventListener('click',()=>{enableMetro();map.followTrain(!map.metro.following);});
  $('#nextTrain').addEventListener('click',()=>{enableMetro();map.metro.followIndex=(map.metro.followIndex+1)%map.metro.trains.length;map.followTrain(true);});
  $('#metroPause').addEventListener('click',()=>{
    map.metro.running=!map.metro.running;const paused=!map.metro.running;
    $('#metroPause').setAttribute('aria-pressed',paused);$('#metroPause').setAttribute('aria-label',paused?'Reanudar trenes':'Pausar trenes');$('#metroPause').title=paused?'Reanudar trenes':'Pausar trenes';$('#metroPause').innerHTML='<i data-lucide="'+(paused?'play':'pause')+'"></i>';icons();
  });
  $('#searchGo').addEventListener('click',search);
  $('#placeSearch').addEventListener('keydown',e=>{if(e.key==='Enter')search();});
  $('#tourButton').addEventListener('click',()=>{$('#detailPanel').classList.add('closed');map.setTour(!map.touring);});
  $('#fullscreen').addEventListener('click',async()=>{
    try {if(document.fullscreenElement)await document.exitFullscreen();else await $('#mapPanel').requestFullscreen();}
    catch {showToast('La pantalla completa no está disponible en este navegador.');}
  });
  $('#captureView').addEventListener('click',()=>download(map.capture(),'sjl-corredor-3d.png'));
  $('#exportReports').addEventListener('click',()=>{
    const payload={version:2,exportedAt:timestamp(),storage:'Prototipo local, no conectado a MySQL',reports:reports.map(r=>({...r,coordinates:map.geo(r.x,r.z)}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));download(url,'sjl-reportes.json');setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('#aboutMap').addEventListener('click',()=>$('#aboutModal').showModal());
  $('#closeAbout').addEventListener('click',()=>$('#aboutModal').close());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&map.placing)cancelPlacement();});
}
async function start() {
  icons();
  try {
    const [geoResponse,massingResponse,metroResponse]=await Promise.all([fetch('./data/sjl-geography.json'),fetch('./data/sjl-massing.json'),fetch('./data/sjl-metro.json')]);
    if(!geoResponse.ok||!massingResponse.ok||!metroResponse.ok)throw new Error('Faltan los archivos cartográficos locales.');
    geography=await geoResponse.json();geography.metro=await metroResponse.json();const massing=await massingResponse.json();
    $('#metroStation').innerHTML=geography.metro.stations.map((s,i)=>'<option value="'+i+'">'+esc(s.name)+'</option>').join('');$('#metroStation').value='3';
    map=new TerritoryScene($('#scene'),$('#mapLabels'),geography,massing,{
      onPoint:picked,onError:showToast,onAltitude:alt=>$('#cameraAltitude').textContent=alt.toLocaleString('es-PE')+' m AGL',
      onStation:index=>$('#metroStation').value=index,
      onFollow:active=>{$('#followTrain').setAttribute('aria-pressed',active);$('#followTrain').classList.toggle('active',active);$('#followTrain span').textContent=active?'Siguiendo':'Seguir tren';},
      onMetro:train=>$('#metroLive').textContent=(map?.metro.running?'Simulación · '+Math.round(train.speed*3.6)+' km/h':'En pausa'),
      onTour:active=>{$('#tourButton').classList.toggle('active',active);$('#tourButton').setAttribute('aria-pressed',active);$('#tourButton').setAttribute('aria-label',active?'Pausar recorrido aéreo':'Iniciar recorrido aéreo');$('#tourButton').innerHTML='<i data-lucide="'+(active?'pause':'play')+'"></i><span>'+(active?'Pausar recorrido':'Recorrido aéreo')+'</span>';icons();}
    });
    await map.build(message=>$('#loadingText').textContent=message);
    loadReports();buildSearch();wire();render();
    $('#mapSummary').textContent='10 km de norte a sur · '+geography.buildings.length.toLocaleString('es-PE')+' huellas OSM';
    $('#dataStats').innerHTML='<dt>Segmentos de vías</dt><dd>'+geography.roads.length.toLocaleString('es-PE')+'</dd><dt>Huellas OSM</dt><dd>'+geography.buildings.length.toLocaleString('es-PE')+'</dd><dt>Volúmenes estimados</dt><dd>'+massing.instances.length.toLocaleString('es-PE')+'</dd><dt>Fecha de la fuente OSM</dt><dd>'+esc(geography.source.timestamp?.slice(0,10)||'Sin fecha')+'</dd>';
    $('#sceneLoader').classList.add('hidden');icons();
    window.sjlMap=map;
    window.sjlDiagnostics=()=>({...map.diagnostics(),reports:reports.length,persisted:localStorage.getItem(STORAGE)!==null});
  } catch(error) {
    console.error(error);$('#sceneLoader strong').textContent='No se pudo abrir el mapa';
    $('#loadingText').textContent=error.message+' Abre el proyecto desde su servidor local.';
    $('.loader-ring').hidden=true;
  }
}
start();
