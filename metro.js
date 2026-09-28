import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const UP = new THREE.Vector3(0,1,0);
const IDENTITY = new THREE.Matrix4();
const clamp = THREE.MathUtils.clamp;
const smooth = x => (x=clamp(x,0,1))*x*(3-2*x);
const v = (x,y,z) => new THREE.Vector3(x,y,z);

// Repeated structural pieces share one draw call per geometry/material combination.
export class Parts {
  constructor() {
    this.items=new Map();this.root=IDENTITY;this.temp=new THREE.Matrix4();this.q=new THREE.Quaternion();
    this.geometries={box:new THREE.BoxGeometry(1,1,1),rounded:new RoundedBoxGeometry(1,1,1,2,.055),cylinder:new THREE.CylinderGeometry(1,1,1,10),sphere:new THREE.SphereGeometry(1,10,8),wheel:new THREE.TorusGeometry(1,.085,5,12)};
    this.materials={solid:new THREE.MeshStandardMaterial({roughness:.75,metalness:.12}),glass:new THREE.MeshStandardMaterial({color:'#9fc8c1',roughness:.2,metalness:.15,transparent:true,opacity:.3,depthWrite:false}),light:new THREE.MeshBasicMaterial({color:'#ffffff'})};
  }
  add(shape,pos,size,tint,rotation=new THREE.Quaternion(),material='solid') {
    const key=shape+':'+material;if(!this.items.has(key))this.items.set(key,[]);
    const matrix=new THREE.Matrix4().compose(v(...pos),rotation,v(...size));matrix.premultiply(this.root);
    const item={matrix,color:new THREE.Color(tint)};this.items.get(key).push(item);return item;
  }
  box(x,y,z,w,h,d,tint,rotation,material) {return this.add('box',[x,y,z],[w,h,d],tint,rotation,material);}
  cylinder(x,y,z,radius,height,tint,rotation) {return this.add('cylinder',[x,y,z],[radius,height,radius],tint,rotation);}
  beam(a,b,radius,tint) {const direction=b.clone().sub(a);return this.add('cylinder',a.clone().add(b).multiplyScalar(.5).toArray(),[radius,direction.length(),radius],tint,new THREE.Quaternion().setFromUnitVectors(UP,direction.normalize()));}
  finish(parent) {
    const meshes=[];
    for(const [key,items] of this.items){
      const [shape,material]=key.split(':'),mesh=new THREE.InstancedMesh(this.geometries[shape],this.materials[material],items.length);
      items.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);mesh.setColorAt(i,item.color);});
      mesh.computeBoundingSphere();mesh.castShadow=material==='solid';mesh.receiveShadow=true;parent.add(mesh);meshes.push(mesh);
    }
    return meshes;
  }
}

function canopyGeometry() {
  const positions=[],indices=[],steps=20,length=146;
  for(let j=0;j<=1;j++)for(let i=0;i<=steps;i++){
    const x=-12+i*24/steps,y=5.5+3*Math.sqrt(Math.max(0,1-(x/12)**2));
    positions.push(x,y,(j-.5)*length);
  }
  for(let i=0;i<steps;i++){const a=i,b=i+1,c=i+steps+2,d=i+steps+1;indices.push(a,b,d,b,c,d);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function stationSign(name) {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#087441';ctx.fillRect(0,0,1024,128);
  ctx.fillStyle='#ffffff';ctx.font='700 55px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('L1  '+name.toUpperCase(),512,68,970);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide});
}

export class MetroLine {
  constructor(scene,data,heightAt) {
    this.scene=scene;this.data=data;this.heightAt=heightAt;this.group=new THREE.Group();this.group.name='Metro Linea 1';scene.add(this.group);
    this.route=new THREE.CatmullRomCurve3(data.points.map(([x,z])=>v(x,0,z)),false,'centripetal');this.route.arcLengthDivisions=8192;this.route.updateArcLengths();this.length=this.route.getLength();
    this.stations=data.stations.map(s=>({...s,distance:s.distance/data.length*this.length}));
    this.elevations=[];const count=Math.ceil(this.length/8);this.elevationStep=this.length/count;
    const raw=[];
    for(let i=0;i<=count;i++){const p=this.route.getPointAt(i/count);raw.push(heightAt(p.x,p.z));}
    for(let i=0;i<=count;i++){
      const slice=raw.slice(Math.max(0,i-10),Math.min(count+1,i+11));
      this.elevations.push(Math.max(raw[i]+11,slice.reduce((a,b)=>a+b,0)/slice.length+14));
    }
    for(const s of this.stations){s.y=this.elevation(s.distance);s.point=this.route.getPointAt(s.distance/this.length);s.point.y=s.y;s.tangent=this.tangent(s.distance);s.angle=Math.atan2(s.tangent.x,s.tangent.z);}
    this.parts=new Parts();this.buildViaduct();this.buildStations();this.parts.finish(this.group);
    this.trains=[];this.running=true;this.elapsed=0;this.following=false;this.followIndex=0;
    this.buildTrains();this.update(0);
  }
  elevation(distance) {
    const a=clamp(distance/this.elevationStep,0,this.elevations.length-1.0001),i=Math.floor(a);
    return THREE.MathUtils.lerp(this.elevations[i],this.elevations[i+1],a-i);
  }
  deckHeight(distance) {
    let y=this.elevation(distance);
    for(const station of this.stations){const gap=Math.abs(distance-station.distance);if(gap<170)y=THREE.MathUtils.lerp(y,station.y,1-smooth((gap-80)/90));}
    return y;
  }
  tangent(distance) {return this.route.getTangentAt(clamp(distance/this.length,0,1)).normalize();}
  point(distance,offset=0,height=0) {
    const d=clamp(distance,0,this.length),p=this.route.getPointAt(d/this.length),t=this.tangent(d);
    p.x+=t.z*offset;p.z-=t.x*offset;p.y=this.deckHeight(d)+height;return p;
  }
  orientation(distance,direction=1) {
    const a=this.point(distance-2),b=this.point(distance+2),forward=b.sub(a).normalize().multiplyScalar(direction);
    const right=new THREE.Vector3().crossVectors(UP,forward).normalize(),up=new THREE.Vector3().crossVectors(forward,right).normalize();
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,up,forward));
  }
  buildViaduct() {
    const p=this.parts;
    for(let d=0;d<this.length;d+=8){
      const end=Math.min(this.length,d+8),mid=(d+end)/2,a=this.point(d),b=this.point(end),center=a.clone().add(b).multiplyScalar(.5),rotation=this.orientation(mid);
      p.box(center.x,center.y-1.05,center.z,10.8,1.6,a.distanceTo(b)+.16,'#aaa99b',rotation);
      for(const offset of [-5.2,5.2]){const c=this.point(mid,offset,.6);p.box(c.x,c.y,c.z,.3,1.65,a.distanceTo(b)+.2,'#b9b7a9',rotation);}
      for(const offset of [-2.3,2.3]){
        const c=this.point(mid,offset,-.13);p.box(c.x,c.y,c.z,3.25,.3,a.distanceTo(b)+.1,'#777a70',rotation);
        for(const gauge of [-.7175,.7175]){const rail=this.point(mid,offset+gauge,.1);p.box(rail.x,rail.y,rail.z,.13,.18,a.distanceTo(b)+.12,'#bec8c5',rotation);}
      }
    }
    for(let d=16;d<this.length;d+=32){
      const c=this.point(d),ground=this.heightAt(c.x,c.z),h=c.y-ground-1.7,rotation=this.orientation(d);
      p.box(c.x,ground+.5,c.z,4.5,1,4,'#a3a397',rotation);
      p.cylinder(c.x,ground+h/2,c.z,1.05,h,'#bcbeb2');
      p.box(c.x,c.y-2,c.z,8.4,1.1,2.8,'#b4b6aa',rotation);
    }
    const wirePositions=[];
    for(let d=0;d<this.length;d+=35){
      const c=this.point(d,0),end=this.point(Math.min(d+35,this.length));
      for(const offset of [-4.75,4.75]){const base=this.point(d,offset);p.beam(base,this.point(d,offset,6.25),.085,'#687d72');}
      p.beam(this.point(d,-4.75,6.25),this.point(d,4.75,6.25),.085,'#6b7d74');
      for(const offset of [-2.3,2.3]){wirePositions.push(...this.point(d,offset,5.45).toArray(),...this.point(Math.min(d+35,this.length),offset,5.45).toArray());}
    }
    const wires=new THREE.BufferGeometry();wires.setAttribute('position',new THREE.Float32BufferAttribute(wirePositions,3));this.group.add(new THREE.LineSegments(wires,new THREE.LineBasicMaterial({color:'#56675d'})));
  }
  buildStations() {
    const p=this.parts,roof=canopyGeometry();
    const roofMaterial=new THREE.MeshStandardMaterial({color:'#99b2a1',metalness:.45,roughness:.55,side:THREE.DoubleSide,transparent:true,opacity:.68,depthWrite:false});
    this.stationGroups=[];
    for(const [index,s] of this.stations.entries()){
      const rotation=new THREE.Quaternion().setFromAxisAngle(UP,s.angle),root=new THREE.Matrix4().compose(s.point,rotation,v(1,1,1));p.root=root;
      const station=new THREE.Group();station.name=s.name;station.position.copy(s.point);station.quaternion.copy(rotation);this.group.add(station);this.stationGroups.push(station);
      const canopy=new THREE.Mesh(roof,roofMaterial);canopy.castShadow=false;station.add(canopy);
      for(const side of [-1,1]){
        p.box(side*7,0,0,6,1.5,150,'#b4b6ab');
        p.box(side*7,.82,0,5.85,.16,149,'#d2d2c4');
        p.box(side*4.15,.94,0,.32,.06,147,'#eed451');
        p.box(side*9.7,1.6,0,.23,1.5,150,'#147846');
        p.box(side*10,3.8,0,.15,.8,147,'#0e7b46');
        for(let z=-66;z<=66;z+=22){
          const groundPoint=v(side*8,-1,z).applyMatrix4(root),ground=this.heightAt(groundPoint.x,groundPoint.z),height=s.y-ground-1;
          p.box(side*8,-height/2-1,z,1.3,height,1.4,'#b9bcae');
          p.box(side*9,3.4,z,.18,5,.18,'#688d76');
          p.box(side*7,1.6,z,1.5,.17,4,'#3e7356');
          p.box(side*7.5,2,z,.14,.8,4,'#638b6e');
        }
      }
      // Curved steel ribs, with an open middle sightline through the translucent roof.
      for(let z=-70;z<=70;z+=14)for(let j=0;j<20;j++){
        const x=-12+j*1.2,n=x+1.2;
        p.beam(v(x,5.5+3*Math.sqrt(Math.max(0,1-(x/12)**2)),z),v(n,5.5+3*Math.sqrt(Math.max(0,1-(n/12)**2)),z),.075,'#d3d8cb');
      }
      p.box(0,-4.2,-53,23,2.4,20,'#9bab9b');
      p.box(0,-4.2,53,23,2.4,20,'#9bab9b');
      for(const side of [-1,1])for(const end of [-1,1])this.buildAccess(p,s,root,side,end);
      for(const side of [-1,1])for(const end of [-1,1])for(let i=0;i<19;i++)p.box(side*7,-2.6+i*.185,end*(52+i*.3),2.2,.22,.31,'#b7c4af');
      const signMat=stationSign(s.name),signGeo=new THREE.PlaneGeometry(24,3);
      for(const end of [-1,1]){const sign=new THREE.Mesh(signGeo,signMat);sign.position.set(0,4.5,end*75.5);if(end<0)sign.rotation.y=Math.PI;station.add(sign);}
      for(const side of [-1,1])for(const z of [-42,42]){const sign=new THREE.Mesh(new THREE.PlaneGeometry(17,1.75),signMat);sign.position.set(side*10.1,4.25,z);sign.rotation.y=side*Math.PI/2;station.add(sign);}
      s.platformTop=s.y+.92;
    }
    p.root=IDENTITY;
  }
  buildAccess(p,station,root,side,end) {
    const x=side*21,z=end*51,world=v(x,0,z).applyMatrix4(root),ground=this.heightAt(world.x,world.z)-station.y;
    p.box(side*15,-2.8,z,14,.5,4,'#b4beaf');
    p.box(side*15,-1.7,z-2,14,1.6,.16,'#11834b');p.box(side*15,-1.7,z+2,14,1.6,.16,'#11834b');
    const height=-2.5-ground,half=height/2,steps=Math.ceil(half/.19),run=steps*.29;
    for(let flight=0;flight<2;flight++){
      const fx=x+side*(flight?1.2:-1.2);
      for(let i=0;i<steps;i++){
        const along=(flight?steps-i:i)*.29-run/2,level=ground+flight*half+(i+1)*half/steps;
        p.box(fx,level-.12,z+along,2,.24,.31,'#aeb8a8');
      }
      const start=v(fx,ground+flight*half+1,z+(flight?run/2:-run/2)),finish=v(fx,ground+(flight+1)*half+1,z+(flight?-run/2:run/2));
      for(const edge of [-1,1])p.beam(start.clone().add(v(edge*.95,0,0)),finish.clone().add(v(edge*.95,0,0)),.05,'#177b4c');
    }
    p.box(x,ground+half-.12,z+run/2,4.6,.25,2.6,'#b5bfae');
    p.box(x,ground+.15,z,7,.3,run+6,'#c8cdbb');
    const liftX=x+side*5;
    p.box(liftX,ground+height/2,z,3.3,height,3.3,'#5f9e80',undefined,'glass');
    for(const a of [-1.6,1.6])for(const b of [-1.6,1.6])p.box(liftX+a,ground+height/2,z+b,.16,height,.16,'#138b4c');
    p.box(liftX,-2,z,3.8,.35,3.8,'#1c9752');
  }
  trainPrototype(cab=false) {
    const p=new Parts();
    // Shaped roof, glazing, door frames, bogies and couplings read as rolling stock up close.
    p.add('rounded',[0,1.2,0],[2.8,1.25,17.9],'#48a627');
    p.add('rounded',[0,2.5,0],[2.75,1.45,17.85],'#dee5d5');
    p.box(0,3.36,0,2.45,.28,17.8,'#d7ddcf');
    p.box(0,.55,0,2.2,.4,15.9,'#384842');
    for(const side of [-1,1]){
      p.box(side*1.405,2.4,0,.035,1.03,16.9,'#244a47');
      p.box(side*1.417,1.7,0,.025,.13,17.8,'#218846');
      for(let z=-7.4;z<=7.5;z+=2.46){
        p.box(side*1.432,2.4,z,.035,1.08,.085,'#a8bbaa');
      }
      for(const z of [-5.5,0,5.5]){
        p.box(side*1.435,1.9,z,.035,2,1.35,'#dce5d4');
        for(const dz of [-.33,.33])p.box(side*1.46,2.35,z+dz,.025,.95,.52,'#234945');
        p.box(side*1.46,1.85,z,.025,2,.04,'#778e7c');
      }
    }
    const wheelRot=new THREE.Quaternion().setFromAxisAngle(v(0,0,1),Math.PI/2);
    for(const z of [-6.8,-5.3,5.3,6.8]){
      p.box(0,.52,z,2.2,.4,.5,'#343f3b');
      for(const side of [-1,1]){p.cylinder(side*1.12,.45,z,.42,.25,'#283530',wheelRot);p.cylinder(side*1.25,.45,z,.22,.025,'#8d9b92',wheelRot);}
    }
    for(const z of [-4.5,4.5])p.box(0,3.64,z,1.6,.3,2.5,'#98ab9c');
    p.beam(v(-.6,3.7,1.2),v(0,4.3,2.2),.045,'#59675f');p.beam(v(0,4.3,2.2),v(.6,5.3,1.2),.045,'#59675f');p.box(.6,5.3,1.2,1.25,.05,.1,'#626c62');
    p.box(0,1.5,-9.18,2.1,2.15,.42,'#4d5d51');if(!cab)p.box(0,1.5,9.18,2.1,2.15,.42,'#4d5d51');
    if(cab){
      p.box(0,1.3,9.08,2.65,1.2,.65,'#50b52d');
      p.box(0,2.5,9.1,2.5,1.32,.18,'#173b3b',new THREE.Quaternion().setFromAxisAngle(v(1,0,0),-.18));
      p.box(0,3.25,9.1,1.6,.22,.08,'#143b26');
      for(const side of [-1,1]){p.box(side*.91,1.4,9.43,.35,.18,.06,'#fff3bf',undefined,'light');p.box(side*1.02,1.04,9.43,.13,.12,.06,'#f5674b',undefined,'light');}
    }
    return p;
  }
  buildTrains() {
    const start=this.stations[3].distance;
    const placements=[{distance:start-85,direction:1},{distance:this.stations[1].distance+280,direction:-1},{distance:this.stations[5].distance+420,direction:1},{distance:this.stations[4].distance+190,direction:-1}];
    this.trainParts=[];
    for(const [i,initial] of placements.entries()){
      this.trains.push({...initial,id:'L1-'+(i+1),speed:14,wait:0,cars:[],position:v(0,0,0)});
    }
    for(const cab of [false,true]){
      const prototype=this.trainPrototype(cab);
      for(const [key,parts] of prototype.items){
        const [shape,mat]=key.split(':'),references=[];
        for(const train of this.trains)for(let car=0;car<6;car++)if((car===0||car===5)===cab)for(const part of parts)references.push({train,car,part});
        const mesh=new THREE.InstancedMesh(prototype.geometries[shape],prototype.materials[mat],references.length);
        references.forEach((r,i)=>mesh.setColorAt(i,r.part.color));mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;
        this.group.add(mesh);this.trainParts.push({mesh,references});
      }
    }
    this.matrix=new THREE.Matrix4();this.carMatrices=this.trains.map(()=>Array.from({length:6},()=>new THREE.Matrix4()));
  }
  update(dt) {
    if(this.running)this.elapsed+=dt;
    const step=this.running?dt:0,first=85,last=this.length-85;
    for(const [index,train] of this.trains.entries()){
      const remaining=train.direction>0?last-train.distance:train.distance-first;
      const nearStation=Math.min(...this.stations.map(s=>Math.abs(s.distance-train.distance)));
      const desired=Math.min(nearStation<130?9:19,Math.sqrt(Math.max(0,remaining)*1.6));
      train.speed+=clamp(desired-train.speed,-1.8*step,1.1*step);
      if(train.wait>0){train.wait-=step;train.speed=0;if(train.wait<=0)train.direction*=-1;}
      else {train.distance=clamp(train.distance+train.direction*train.speed*step,first,last);if(remaining<.4){train.wait=3;train.speed=0;}}
      train.position.copy(this.point(train.distance,train.direction*2.3,.2));
      train.cars=[];
      for(let car=0;car<6;car++){
        const distance=train.distance+(2.5-car)*18.9*train.direction;
        // Both running tracks meet through a gradual terminal crossover, avoiding teleportation.
        const crossover=smooth(Math.min(distance-first,last-distance)/125);
        const pos=this.point(distance,2.3*train.direction*crossover,.22),rotation=this.orientation(distance,train.direction*(car===5?-1:1));
        this.carMatrices[index][car].compose(pos,rotation,v(1,1,1));train.cars.push(pos);
      }
    }
    for(const batch of this.trainParts){
      batch.references.forEach((r,i)=>{const trainIndex=this.trains.indexOf(r.train);this.matrix.multiplyMatrices(this.carMatrices[trainIndex][r.car],r.part.matrix);batch.mesh.setMatrixAt(i,this.matrix);});batch.mesh.instanceMatrix.needsUpdate=true;
    }
  }
  focusStation(index) {
    const s=this.stations[index],t=s.tangent,right=v(t.z,0,-t.x),mobile=innerWidth<760,factor=mobile?1.45:1;
    const target=s.point.clone().add(v(0,3,0));
    const camera=target.clone().addScaledVector(right,150*factor).addScaledVector(t,-175*factor).add(v(0,95*factor,0));
    return {target,camera};
  }
  followCamera() {
    const train=this.trains[this.followIndex],t=this.tangent(train.distance).multiplyScalar(train.direction),right=v(t.z,0,-t.x);
    return {target:train.position.clone().add(v(0,3,0)),camera:train.position.clone().addScaledVector(right,85).addScaledVector(t,-120).add(v(0,62,0))};
  }
  diagnostics() {return {length:this.length,stationNames:this.stations.map(s=>s.name),stations:this.stations.map(s=>({name:s.name,position:s.point.toArray(),elevation:s.y-this.heightAt(s.point.x,s.point.z)})),trains:this.trains.map(t=>({id:t.id,distance:t.distance,direction:t.direction,speed:t.speed,position:t.position.toArray(),cars:t.cars.map(p=>p.toArray())})),running:this.running,elapsed:this.elapsed};}
}
