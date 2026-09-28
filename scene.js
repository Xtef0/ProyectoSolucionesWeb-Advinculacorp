import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MetroLine } from './metro.js';
import { UrbanMobility } from './mobility.js';

const clamp = THREE.MathUtils.clamp;
const palette = ['#bcb6a9','#b8b8b2','#c5c3b8','#bba594','#b2bbb7','#d1cbb8','#bfa995','#9faeaf','#bbbda9','#b39b91','#c8c9bb','#b7b0a4','#aab6ad','#b9b8bc','#cbc5bc','#a4b8b9'];
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const seeded = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const color = hex => new THREE.Color(hex);

class Batch {
  constructor() { this.p = []; this.c = []; this.uv = []; }
  triangle(a, b, c, tint, uvs = [[0,0],[1,0],[1,1]]) {
    for (const [i,p] of [a,b,c].entries()) { this.p.push(...p); this.c.push(tint.r,tint.g,tint.b); this.uv.push(...uvs[i]); }
  }
  quad(a,b,c,d,tint,width = 1,height = 1) {
    this.triangle(a,b,d,tint,[[0,0],[width,0],[0,height]]);
    this.triangle(b,c,d,tint,[[width,0],[width,height],[0,height]]);
  }
  mesh(material) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.setAttribute('uv',new THREE.Float32BufferAttribute(this.uv,2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g,material); mesh.receiveShadow = true;
    return mesh;
  }
}

function ring(points) {
  const result = points.filter((p,i) => !i || p[0] !== points[i-1][0] || p[1] !== points[i-1][1]);
  if (result.length > 2 && result[0][0] === result.at(-1)[0] && result[0][1] === result.at(-1)[1]) result.pop();
  return result;
}

function texture(kind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = kind === 'wall' ? '#d9d8d1' : '#adafa9'; ctx.fillRect(0,0,128,128);
  for (let i=0;i<2800;i++) {
    const tone = 85 + seeded(i+71)*110;
    ctx.fillStyle = `rgba(${tone},${tone},${tone},.1)`;
    ctx.fillRect(seeded(i)*128,seeded(i+1)*128,1+seeded(i+2)*2,1);
  }
  if (kind === 'wall') {
    ctx.fillStyle = '#acaea8'; ctx.fillRect(0,117,128,11);
    ctx.fillStyle = '#efeee7'; ctx.fillRect(0,119,128,3);
    ctx.fillStyle = '#a0a59f'; ctx.fillRect(25,29,72,66);
    ctx.fillStyle = '#49595a'; ctx.fillRect(29,32,63,58);
    ctx.fillStyle = '#718889'; ctx.fillRect(32,35,25,48);
    ctx.fillStyle = '#81928d'; ctx.fillRect(62,35,26,48);
    ctx.fillStyle = '#c4c8bb'; ctx.fillRect(58,33,3,58); ctx.fillRect(29,61,63,3);
    ctx.fillStyle = '#ecece1'; ctx.fillRect(25,92,72,4);
  } else if (kind === 'roof') {
    ctx.strokeStyle = '#92948d'; ctx.lineWidth = 2;
    for(let i=8;i<128;i+=17){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,128);ctx.stroke();}
    ctx.fillStyle = '#c4c4b9'; ctx.fillRect(4,4,37,47); ctx.fillRect(45,68,68,41);
    ctx.strokeStyle = '#dddcd0'; ctx.strokeRect(0,0,128,128);
  }
  const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}

function standard(options = {}) {
  return new THREE.MeshStandardMaterial({roughness:.92, metalness:0, vertexColors:true, side:THREE.DoubleSide,...options});
}

export class TerritoryScene {
  constructor(host, labels, data, massing, callbacks = {}) {
    this.host = host; this.labelHost = labels; this.data = data; this.massing = massing; this.callbacks = callbacks;
    this.labels = []; this.pins = []; this.placing = false; this.showLabels = true; this.lastHud = 0;
    this.touring = false; this.tourProgress = .12; this.lastTime = 0; this.frameCount = 0;
    this.scene = new THREE.Scene(); this.scene.background = color('#c3d5df');
    this.scene.fog = new THREE.Fog('#c9d5d8',6500,19500);
    this.camera = new THREE.PerspectiveCamera(48,1,1,40000);
    this.renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate=false;
    this.host.append(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera,this.renderer.domElement);
    Object.assign(this.controls,{enableDamping:true,dampingFactor:.075,minDistance:45,maxDistance:17000,minPolarAngle:.02,maxPolarAngle:Math.PI*.485,screenSpacePanning:false,zoomSpeed:.8,panSpeed:1.1});
    this.controls.addEventListener('start',() => { this.flight=null; this.setTour(false); this.followTrain(false); });
    this.scene.add(new THREE.HemisphereLight('#e6f0f7','#857d6d',1.55));
    this.sun = new THREE.DirectionalLight('#fff3da',2.45); this.sun.position.set(-4500,6000,2400); this.scene.add(this.sun);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(4096,4096);
    Object.assign(this.sun.shadow.camera,{left:-7500,right:7500,top:8000,bottom:-8000,near:100,far:22000});
    this.sun.shadow.bias=-.00005;this.sun.shadow.normalBias=1.2;
    this.buildings = new THREE.Group(); this.infill = new THREE.Group(); this.corridor = new THREE.Group();
    this.scene.add(this.buildings,this.infill,this.corridor);
    this.wallTexture=texture('wall');this.roofTexture=texture('roof');
    this.wallMaterial=standard({map:this.wallTexture});this.roofMaterial=standard({map:this.roofTexture});
    this.flatMaterial=standard();
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();this.scratch=new THREE.Vector3();
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(host);
    let down;
    this.renderer.domElement.addEventListener('pointerdown',e => { down=[e.clientX,e.clientY]; });
    this.renderer.domElement.addEventListener('pointerup',e => {
      if (this.placing && down && Math.hypot(e.clientX-down[0],e.clientY-down[1])<6) {
        const rect=this.renderer.domElement.getBoundingClientRect();
        this.pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
        this.raycaster.setFromCamera(this.pointer,this.camera);
        const hit=this.raycaster.intersectObject(this.terrainMesh)[0];
        if(hit) this.callbacks.onPoint?.(hit.point.x,hit.point.z);
      }
      down=null;
    });
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.callbacks.onError?.('Se perdió el contexto 3D. Recarga la página para recuperarlo.');});
  }

  heightAt(x,z) {
    const t=this.data.terrain,[x0,z0,x1,z1]=t.bounds;
    const u=clamp((x-x0)/(x1-x0)*t.columns,0,t.columns-.0001),v=clamp((z-z0)/(z1-z0)*t.rows,0,t.rows-.0001);
    const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j,k=j*(t.columns+1)+i;
    const top=t.heights[k]*(1-a)+t.heights[k+1]*a,bottom=t.heights[k+t.columns+1]*(1-a)+t.heights[k+t.columns+2]*a;
    return top*(1-b)+bottom*b-100;
  }
  geo(x,z) { return [this.data.origin[0]-z/this.data.metersPerDegree[0],this.data.origin[1]+x/this.data.metersPerDegree[1]]; }
  local(lat,lon) { return [(lon-this.data.origin[1])*this.data.metersPerDegree[1],-(lat-this.data.origin[0])*this.data.metersPerDegree[0]]; }
  withinData(x,z) { const [lat,lon]=this.geo(x,z),[s,w,n,e]=this.data.bbox;return lat>=s&&lat<=n&&lon>=w&&lon<=e; }

  async build(progress) {
    progress('Levantando cerros y manzanas');this.buildTerrain();await nextFrame();
    this.buildSurfaces();progress('Trazando 17 mil segmentos de calles');await nextFrame();
    this.buildRoads();await nextFrame();progress('Construyendo edificios y azoteas');
    this.buildMappedBuildings();await nextFrame();this.buildEstimatedBuildings();await nextFrame();
    progress('Preparando estaciones y recorrido');this.buildParks();this.buildMetro();this.buildTraffic();this.buildLabels();this.buildTour();
    this.mobility=new UrbanMobility(this.scene,this.metro,(x,z)=>this.heightAt(x,z),this.traffic,this.data.roads.map(r=>({points:r.points,highway:r.tags.highway,width:this.roadWidth(r)})));
    this.buildMinimap();this.home(false);this.resize();
    const stationView=this.metro.focusStation(3);this.camera.position.copy(stationView.camera);this.controls.target.copy(stationView.target);this.controls.update();
    this.renderer.shadowMap.needsUpdate=true;
    this.renderer.setAnimationLoop(time=>this.animate(time));
  }

  buildTerrain() {
    const t=this.data.terrain,[x0,z0,x1,z1]=t.bounds;
    const g=new THREE.PlaneGeometry(x1-x0,z1-z0,t.columns,t.rows);g.rotateX(-Math.PI/2);g.translate((x0+x1)/2,0,(z0+z1)/2);
    const p=g.attributes.position,colors=[];
    for(let i=0;i<p.count;i++) {
      p.setY(i,t.heights[i]-100);
      const h=t.heights[i],noise=seeded(i)*.08;
      const c=color(h>650?'#9f9788':h>350?'#aaa291':'#b7b0a0');c.multiplyScalar(.91+noise);
      colors.push(c.r,c.g,c.b);
    }
    g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();
    const rough=texture('ground');rough.repeat.set(650,850);
    this.terrainMesh=new THREE.Mesh(g,standard({map:rough}));this.terrainMesh.receiveShadow=true;this.scene.add(this.terrainMesh);
    const distant=new THREE.Mesh(new THREE.PlaneGeometry(100000,100000),new THREE.MeshBasicMaterial({color:'#c4c4b7'}));distant.rotation.x=-Math.PI/2;distant.position.y=-15;this.scene.add(distant);
  }

  polygon(batch,points,tint,offset=.5,fixedY=null) {
    const contour=ring(points);if(contour.length<3)return;
    const triangles=THREE.ShapeUtils.triangulateShape(contour.map(p=>new THREE.Vector2(...p)),[]);
    for(const tri of triangles) {
      const p=tri.map(i=>[contour[i][0],fixedY ?? this.heightAt(...contour[i])+offset,contour[i][1]]);
      batch.triangle(...p,tint,tri.map(i=>[contour[i][0]/12,contour[i][1]/12]));
    }
  }

  buildSurfaces() {
    const blocks=new Batch(),open=new Batch();
    for(const p of this.massing.surfaces) this.polygon(blocks,p,color('#c1bfb3'),.28);
    for(const a of this.data.areas) {
      const t=a.tags;
      if(t.landuse==='residential'||t.landuse==='industrial'||t.landuse==='commercial')continue;
      const c=t.leisure==='pitch'?'#718c7e':t.leisure==='park'?'#829574':t.landuse==='cemetery'?'#abb6a0':'#94a283';
      this.polygon(open,a.points,color(c),.7);
    }
    const base=blocks.mesh(this.flatMaterial),areas=open.mesh(this.flatMaterial);
    if(base)this.scene.add(base);if(areas)this.scene.add(areas);
  }

  roadWidth(road) {
    const t=road.tags,explicit=parseFloat(t.width);
    if(explicit>0&&explicit<50)return explicit;
    const widths={motorway:17,trunk:15,primary:13,secondary:11,tertiary:9,residential:7.5,living_street:6,service:4,footway:2.1,path:1.8,steps:2.2,track:3,cycleway:2};
    return Math.max(widths[t.highway]||5,Math.min(22,(Number(t.lanes)||0)*3.1));
  }

  ribbon(batch,points,width,tint,offset=1) {
    const sampled=[];
    for(let i=0;i<points.length-1;i++) {
      const a=points[i],b=points[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/32));
      for(let k=0;k<n;k++)sampled.push([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]);
    }
    sampled.push(points.at(-1));
    const edges=sampled.map((p,i)=>{
      const prev=sampled[Math.max(0,i-1)],next=sampled[Math.min(sampled.length-1,i+1)];
      const dx=next[0]-prev[0],dz=next[1]-prev[1],length=Math.hypot(dx,dz)||1;
      return [[p[0]-dz/length*width/2,this.heightAt(...p)+offset,p[1]+dx/length*width/2],[p[0]+dz/length*width/2,this.heightAt(...p)+offset,p[1]-dx/length*width/2]];
    });
    for(let i=0;i<edges.length-1;i++)batch.quad(edges[i][0],edges[i][1],edges[i+1][1],edges[i+1][0],tint);
  }

  buildRoads() {
    const pavement=new Batch(),asphalt=new Batch(),lines=new Batch(),highlight=new Batch();
    for(const r of this.data.roads) {
      if(['proposed','construction'].includes(r.tags.highway))continue;
      const width=this.roadWidth(r),major=r.corridor||['primary','secondary','trunk'].includes(r.tags.highway);
      if(width>5)this.ribbon(pavement,r.points,width+3.3,color('#c3c2b7'),.8);
      this.ribbon(asphalt,r.points,width,color(width<4?'#b0a798':major?'#676d6c':'#858782'),1.1);
      if(major){
        this.ribbon(lines,r.points,.22,color('#d3cda5'),1.25);
        if(r.corridor)this.ribbon(highlight,r.points,width+1,color('#e6ba61'),1.45);
      }
    }
    for(const batch of [pavement,asphalt,lines]){const mesh=batch.mesh(this.flatMaterial);if(mesh)this.scene.add(mesh);}
    const mesh=highlight.mesh(new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.25,depthWrite:false,side:THREE.DoubleSide}));
    if(mesh)this.corridor.add(mesh);
  }

  buildMappedBuildings() {
    const chunks=new Map();this.tanks=[];
    for(const b of this.data.buildings) {
      if(b.tags.building==='train_station'&&this.data.metro.stations.some(s=>b.tags.name?.includes(s.name)))continue;
      const p=ring(b.points);if(p.length<3)continue;
      const cx=p.reduce((s,v)=>s+v[0],0)/p.length,cz=p.reduce((s,v)=>s+v[1],0)/p.length;
      const key=`${Math.floor(cx/800)},${Math.floor(cz/800)}`;
      if(!chunks.has(key))chunks.set(key,{walls:new Batch(),roofs:new Batch()});
      const batch=chunks.get(key),t=b.tags;
      const floors=Number(t['building:levels'])|| (t.building==='industrial'?2:2+Math.floor(seeded(b.id)*3));
      const h=clamp(parseFloat(t.height)||floors*3.05,2.5,100);
      const ground=p.map(v=>this.heightAt(...v)),base=Math.min(...ground)-.4,top=Math.max(...ground)+h;
      const tint=color(palette[b.id%palette.length]);
      for(let i=0;i<p.length;i++){
        const a=p[i],c=p[(i+1)%p.length],w=Math.hypot(a[0]-c[0],a[1]-c[1]);
        batch.walls.quad([a[0],base,a[1]],[c[0],base,c[1]],[c[0],top,c[1]],[a[0],top,a[1]],tint,w/3.5,(top-base)/3.1);
      }
      this.polygon(batch.roofs,p,tint,0,top);
      if(b.id%3===0)this.tanks.push([cx,top+.6,cz]);
    }
    for(const batch of chunks.values())for(const [key,mat] of [['walls',this.wallMaterial],['roofs',this.roofMaterial]]){const mesh=batch[key].mesh(mat);if(mesh){mesh.castShadow=true;this.buildings.add(mesh);}}
  }

  buildEstimatedBuildings() {
    const wall=new THREE.MeshStandardMaterial({map:this.wallTexture,roughness:.94});
    // Instance dimensions give each facade a physical window repeat, not one stretched window.
    wall.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
        #ifdef USE_INSTANCING
        vec3 size = vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
        vMapUv = uv * vec2(abs(normal.x) > 0.5 ? size.z / 3.5 : size.x / 3.5, size.y / 3.1);
        #endif`);
    };
    const roof=new THREE.MeshStandardMaterial({map:this.roofTexture,roughness:.96,color:'#c4c3b9'});
    const geom=new THREE.BoxGeometry(1,1,1),matrix=new THREE.Object3D(),chunks=new Map();
    const indices=Array.from(geom.index.array);
    geom.setIndex([...indices.slice(0,12),...indices.slice(24,36),...indices.slice(12,18)]);
    geom.clearGroups();geom.addGroup(0,24,0);geom.addGroup(24,6,1);
    const mappedTankCount=this.tanks.length;
    for(const item of this.massing.instances){const key=`${Math.floor(item[0]/650)},${Math.floor(item[1]/650)}`;if(!chunks.has(key))chunks.set(key,[]);chunks.get(key).push(item);}
    for(const items of chunks.values()) {
      const mesh=new THREE.InstancedMesh(geom,[wall,roof],items.length);
      items.forEach(([x,z,w,d,angle,h,tint],i)=>{
        const base=this.heightAt(x,z);
        matrix.position.set(x,base+h/2,z);matrix.rotation.set(0,angle,0);matrix.scale.set(w,h,d);matrix.updateMatrix();
        mesh.setMatrixAt(i,matrix.matrix);mesh.setColorAt(i,color(palette[tint]));
        if(i%13===0)this.tanks.push([x,base+h+.65,z]);
      });
      mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();this.infill.add(mesh);
    }
    for(const [list,parent] of [[this.tanks.slice(0,mappedTankCount),this.buildings],[this.tanks.slice(mappedTankCount),this.infill]]){
      const tanks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.9,.9,1.5,7),new THREE.MeshStandardMaterial({color:'#747970',roughness:.8}),list.length);
      list.forEach(([x,y,z],i)=>{matrix.position.set(x,y,z);matrix.rotation.set(0,0,0);matrix.scale.set(1,1,1);matrix.updateMatrix();tanks.setMatrixAt(i,matrix.matrix);});
      tanks.computeBoundingSphere();parent.add(tanks);
    }
  }

  buildParks() {
    const trees=[],trunks=[],matrix=new THREE.Object3D();
    const inside=(x,z,p)=>{let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])hit=!hit;return hit;};
    for(const a of this.data.areas.filter(a=>['park','garden'].includes(a.tags.leisure))){
      const xs=a.points.map(p=>p[0]),zs=a.points.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
      const count=Math.min(100,Math.floor((x1-x0)*(z1-z0)/210));
      for(let i=0;i<count;i++){
        const x=x0+seeded(a.id+i)*(x1-x0),z=z0+seeded(a.id+i+300)*(z1-z0);
        if(inside(x,z,a.points)){const h=3+seeded(i+77)*4;trees.push([x,this.heightAt(x,z)+h,z,h]);}
      }
    }
    const leaves=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:'#4f795b',roughness:1}),trees.length);
    const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.3,.5,1,5),new THREE.MeshStandardMaterial({color:'#888271',roughness:1}),trees.length);
    trees.forEach(([x,y,z,h],i)=>{
      matrix.position.set(x,y,z);matrix.scale.set(h*.55,h*.62,h*.55);matrix.updateMatrix();leaves.setMatrixAt(i,matrix.matrix);leaves.setColorAt(i,color(i%3?'#a6ba85':'#80a580'));
      matrix.position.y=y-h*.5;matrix.scale.set(1,h,1);matrix.updateMatrix();stems.setMatrixAt(i,matrix.matrix);
    });leaves.computeBoundingSphere();stems.computeBoundingSphere();this.scene.add(leaves,stems);
  }

  buildMetro() {
    this.metro=new MetroLine(this.scene,this.data.metro,(x,z)=>this.heightAt(x,z));
  }

  buildTraffic() {
    this.traffic=[];const candidates=this.data.roads.filter(r=>r.corridor||['primary','secondary'].includes(r.tags.highway));
    for(const r of candidates)for(let i=0;i<r.points.length-1;i++){
      const a=r.points[i],b=r.points[i+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]);
      if(len<35)continue;
      for(let j=0;j<Math.min(5,Math.floor(len/90)+1);j++)this.traffic.push({a,b,len,speed:5+seeded(r.id+j)*6,phase:seeded(r.id+j+500),lane:j%2===0?2:-2});
    }
  }

  buildLabels() {
    const stations=this.metro.stations.map(s=>({name:s.name,type:'station',point:[s.point.x,s.point.z],metro:s}));
    const suburbs=this.data.places.filter(p=>p.name&&p.type!=='station');
    const important=['Urbanización Canto Grande','Urbanización San Rafael','10 de Octubre','Su Santidad Juan Pablo II','San Juan de Lurigancho'];
    for(const p of [...stations,...suburbs.filter(p=>important.includes(p.name))]){
      const el=document.createElement(p.metro?'button':'span');el.className=`geo-label${p.type==='station'?' station':''}`;el.textContent=p.name;this.labelHost.append(el);
      if(p.metro){el.title='Ver estación '+p.name;el.addEventListener('click',()=>{this.viewStation(this.metro.stations.indexOf(p.metro));this.callbacks.onStation?.(this.metro.stations.indexOf(p.metro));});}
      this.labels.push({el,point:new THREE.Vector3(p.point[0],p.metro?p.metro.y+12:this.heightAt(...p.point)+8,p.point[1]),priority:p.type==='station'?1:2});
    }
  }

  buildTour() {
    const p=this.data.roads.filter(r=>r.tags.name?.includes('Wiesse')).flatMap(r=>r.points),bins=new Map();
    for(const [x,z] of p){const k=Math.round(z/180);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(x);}
    const route=[...bins].sort((a,b)=>b[0]-a[0]).map(([k,xs])=>{const x=xs.reduce((a,b)=>a+b,0)/xs.length,z=k*180;return new THREE.Vector3(x,this.heightAt(x,z),z);});
    this.tourCurve=new THREE.CatmullRomCurve3(route);this.tourLength=this.tourCurve.getLength();
  }

  setReports(reports,selected,onSelect) {
    this.pins.forEach(p=>p.el.remove());this.pins=[];
    for(const report of reports){
      const el=document.createElement('button');el.className=`incident-pin ${report.status}${report.id===selected?' selected':''}`;
      el.title=report.title;el.setAttribute('aria-label',report.title);el.dataset.report=report.id;
      const icon=document.createElement('i');icon.dataset.lucide=report.category==='access'?'accessibility':report.category==='safety'?'traffic-cone':'trees';el.append(icon);
      el.addEventListener('click',()=>onSelect(report.id));this.labelHost.append(el);
      this.pins.push({el,point:new THREE.Vector3(report.x,this.heightAt(report.x,report.z)+20,report.z),priority:0});
    }
    window.lucide?.createIcons();this.updateLabels();
  }

  updateLabels() {
    const w=this.host.clientWidth,h=this.host.clientHeight,occupied=[];
    for(const item of [...this.pins,...this.labels]){
      const p=item.point.clone().project(this.camera),x=(p.x+1)*w/2,y=(1-p.y)*h/2;
      let visible=p.z>-1&&p.z<1&&x>10&&x<w-20&&y>60&&y<h-25;
      if(item.priority>0){
        visible=visible&&this.showLabels&&(item.priority!==1||this.metro.group.visible)&&y>145&&!(x<210&&y>h-240);
        if(x<320&&y<255)visible=false;
        if(visible&&occupied.some(q=>Math.abs(q.x-x)<120&&Math.abs(q.y-y)<24))visible=false;
      }
      item.el.style.display=visible?'':'none';
      if(visible){item.el.style.left=`${x}px`;item.el.style.top=`${y}px`;item.el.style.translate='-50% -100%';occupied.push({x,y});}
    }
  }

  buildMinimap() {
    this.mini=document.querySelector('#minimap');this.miniBase=document.createElement('canvas');this.miniBase.width=360;this.miniBase.height=240;
    const ctx=this.miniBase.getContext('2d'),[s,w,n,e]=this.data.bbox;
    const [x0,z1]=this.local(s,w),[x1,z0]=this.local(n,e),scale=Math.min(338/(x1-x0),210/(z1-z0));
    this.miniTransform={x0,z0,scale,ox:(360-(x1-x0)*scale)/2,oy:10};
    ctx.fillStyle='#e7eee6';ctx.fillRect(0,0,360,240);
    for(const road of this.data.roads){
      ctx.strokeStyle=road.corridor?'#ca9746':'#aebdb0';ctx.lineWidth=road.corridor?2:0.5;ctx.beginPath();
      road.points.forEach(([x,z],i)=>{const p=this.toMini(x,z);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.stroke();
    }
    document.querySelector('#scaleLabel').style.width=`${2000*scale/2}px`;
    this.mini.addEventListener('click',e=>{const rect=this.mini.getBoundingClientRect(),px=(e.clientX-rect.left)*360/rect.width,pz=(e.clientY-rect.top)*240/rect.height;this.focus((px-this.miniTransform.ox)/scale+x0,(pz-10)/scale+z0,1200);});
    this.mini.addEventListener('keydown',e=>{const step=400,move={ArrowUp:[0,-step],ArrowDown:[0,step],ArrowLeft:[-step,0],ArrowRight:[step,0]}[e.key];if(move){e.preventDefault();this.focus(this.controls.target.x+move[0],this.controls.target.z+move[1],1200);}});
  }
  toMini(x,z) {const t=this.miniTransform;return[(x-t.x0)*t.scale+t.ox,(z-t.z0)*t.scale+t.oy];}
  updateMinimap() {
    const ctx=this.mini.getContext('2d');ctx.drawImage(this.miniBase,0,0);
    if(this.metro.group.visible){
      ctx.strokeStyle='#148445';ctx.lineWidth=2.8;ctx.beginPath();this.metro.data.points.forEach(([x,z],i)=>{const p=this.toMini(x,z);i?ctx.lineTo(...p):ctx.moveTo(...p);});ctx.stroke();
      for(const s of this.metro.stations){const [x,y]=this.toMini(s.point.x,s.point.z);ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.stroke();}
      for(const t of this.metro.trains){const [x,y]=this.toMini(t.position.x,t.position.z);ctx.fillStyle='#eec945';ctx.fillRect(x-2,y-2,4,4);}
    }
    for(const pin of this.pins){const [x,z]=this.toMini(pin.point.x,pin.point.z);ctx.beginPath();ctx.arc(x,z,3,0,Math.PI*2);ctx.fillStyle='#cf6954';ctx.fill();}
    const [cx,cy]=this.toMini(this.camera.position.x,this.camera.position.z),[tx,ty]=this.toMini(this.controls.target.x,this.controls.target.z);
    const angle=Math.atan2(ty-cy,tx-cx);ctx.fillStyle='#1c706628';ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,45,angle-.45,angle+.45);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#215f55';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(tx,ty);ctx.stroke();
    ctx.fillStyle='#236e5b';ctx.beginPath();ctx.arc(tx,ty,4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.stroke();
  }

  home(animate=true) {
    const target=new THREE.Vector3(-700,this.heightAt(-700,-1000),-1000);
    const position=target.clone().add(new THREE.Vector3(1000,1150,2700));
    if(animate)this.fly(position,target);else{this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();}
  }
  overview() {this.fly(new THREE.Vector3(2800,10500,7200),new THREE.Vector3(0,100,0));}
  focus(x,z,distance=650) {
    const target=new THREE.Vector3(x,this.heightAt(x,z),z),direction=this.camera.position.clone().sub(this.controls.target).normalize();
    direction.y=Math.max(direction.y,.4);direction.normalize();this.fly(target.clone().addScaledVector(direction,distance),target);
  }
  zoom(factor) {this.fly(this.controls.target.clone().add(this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor)),this.controls.target.clone(),450);}
  north() {const distance=this.camera.position.distanceTo(this.controls.target);this.fly(this.controls.target.clone().add(new THREE.Vector3(0,distance*.75,distance*.65)),this.controls.target.clone());}
  fly(position,target,duration=1500) {
    this.setTour(false);this.followTrain(false);this.flight={start:performance.now(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:duration,from:this.camera.position.clone(),to:position,fromTarget:this.controls.target.clone(),target};
  }
  setTour(active) {if(this.touring===active)return;this.touring=active;this.flight=null;if(active)this.followTrain(false);this.callbacks.onTour?.(active);}
  viewStation(index) {const view=this.metro.focusStation(index);this.fly(view.camera,view.target);}
  showMetro(visible) {
    this.metro.group.visible=visible;this.renderer.shadowMap.needsUpdate=true;
    if(!visible)this.followTrain(false);
    this.updateLabels();this.updateMinimap();
  }
  followTrain(active) {
    if(!this.metro)return;this.metro.following=active;
    if(active){this.setTour(false);this.flight=null;}
    this.callbacks.onFollow?.(active);
  }
  resize() {
    const w=this.host.clientWidth,h=this.host.clientHeight;if(!w||!h)return;
    this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
  }
  capture() {this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png');}
  diagnostics() {return {ready:true,frames:this.frameCount,buildings:this.data.buildings.length,estimated:this.massing.instances.length,roads:this.data.roads.length,camera:this.camera.position.toArray(),target:this.controls.target.toArray(),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,metro:this.metro?.diagnostics(),mobility:this.mobility?.diagnostics()};}

  animate(time) {
    const dt=this.lastTime?Math.min((time-this.lastTime)/1000,1):0;this.lastTime=time;
    if(document.hidden)return;
    this.metro.update(dt);
    this.mobility.update(dt,this.camera);
    if(this.flight){
      const f=this.flight,t=f.duration===0?1:clamp((time-f.start)/f.duration,0,1),e=t*t*(3-2*t);
      this.camera.position.lerpVectors(f.from,f.to,e);this.controls.target.lerpVectors(f.fromTarget,f.target,e);if(t===1)this.flight=null;
    } else if(this.metro.following){
      const view=this.metro.followCamera(),factor=1-Math.exp(-dt*2.5);
      this.camera.position.lerp(view.camera,factor);this.controls.target.lerp(view.target,factor);
    } else if(this.touring){
      this.tourProgress+=dt*90/this.tourLength;
      if(this.tourProgress>.96){this.setTour(false);this.tourProgress=.03;}
      else {
        const target=this.tourCurve.getPointAt(this.tourProgress),ahead=this.tourCurve.getPointAt(Math.min(.999,this.tourProgress+.06));
        const desired=target.clone().add(new THREE.Vector3(330,460,620));
        this.camera.position.lerp(desired,1-Math.exp(-dt*1.8));this.controls.target.lerp(ahead,1-Math.exp(-dt*2));
      }
    }
    this.controls.update();
    this.camera.position.y=Math.max(this.camera.position.y,this.heightAt(this.camera.position.x,this.camera.position.z)+18);
    this.controls.target.x=clamp(this.controls.target.x,-4600,4600);this.controls.target.z=clamp(this.controls.target.z,-6300,6300);
    this.renderer.render(this.scene,this.camera);this.frameCount++;
    if(time-this.lastHud>90){this.updateLabels();this.updateMinimap();this.callbacks.onAltitude?.(Math.round(this.camera.position.y-this.heightAt(this.camera.position.x,this.camera.position.z)));this.callbacks.onMetro?.(this.metro.trains[this.metro.followIndex]);this.lastHud=time;}
  }
}
