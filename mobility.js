import * as THREE from 'three';
import { Parts } from './metro.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),UP=V(0,1,0),ONE=V(1,1,1);
const wheelRotation=new THREE.Quaternion().setFromAxisAngle(V(0,0,1),Math.PI/2);
const seed=n=>{const x=Math.sin(n*43.73)*12345.67;return x-Math.floor(x);};
const skins=['#8c5a3b','#c18b67','#a9704b','#dbad87','#6d4836'];
const shirts=['#3d7c97','#b25747','#daa644','#68856a','#d9ddd0','#716a8a'];

function sidewalkOffset(metro,station,side,roads) {
  const widths=[];
  // Cross sections locate the outer carriageway edge, not the rail median.
  for(const along of [-40,0,40]){
    const p=metro.point(station.distance+along),t=metro.tangent(station.distance+along),right=V(t.z,0,-t.x);let outer=19;
    for(const road of roads){
      if(!['primary','secondary','trunk'].includes(road.highway))continue;
      for(let i=1;i<road.points.length;i++){
        const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);
        if(!length||Math.abs((dx*t.x+dz*t.z)/length)<.85)continue;
        const u=(a[0]-p.x)*t.x+(a[1]-p.z)*t.z,v=(b[0]-p.x)*t.x+(b[1]-p.z)*t.z;
        if(u*v>0||Math.abs(u-v)<.001)continue;
        const f=u/(u-v),offset=((a[0]+dx*f-p.x)*right.x+(a[1]+dz*f-p.z)*right.z)*side;
        if(offset>3&&offset<42)outer=Math.max(outer,offset+road.width/2);
      }
    }
    widths.push(outer+2.2);
  }
  return Math.max(...widths);
}

class ActorBatch {
  constructor(parent,template,capacity) {
    this.parts=[];this.m=new THREE.Matrix4();this.joint=new THREE.Matrix4();this.rotate=new THREE.Matrix4();this.reverse=new THREE.Matrix4();this.color=new THREE.Color();
    for(const [key,parts] of template.items){
      const [shape,material]=key.split(':'),mesh=new THREE.InstancedMesh(template.geometries[shape],template.materials[material],capacity*parts.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.receiveShadow=true;
      parent.add(mesh);this.parts.push({mesh,parts});
    }
  }
  draw(actors) {
    for(const batch of this.parts){
      let index=0;
      for(const actor of actors)for(const part of batch.parts){
        let local=part.matrix;
        if(part.swing){
          const angle=Math.sin(actor.phase+part.swing.phase)*part.swing.gain*(actor.walking?1:0);
          this.joint.makeTranslation(...part.swing.pivot);this.rotate.makeRotationX(angle);this.reverse.makeTranslation(...part.swing.pivot.map(n=>-n));
          this.joint.multiply(this.rotate).multiply(this.reverse).multiply(part.matrix);local=this.joint;
        }
        if(part.spin){this.joint.makeTranslation(...part.spin);this.rotate.makeRotationX(actor.walking?actor.phase:0);this.reverse.makeTranslation(...part.spin.map(n=>-n));this.joint.multiply(this.rotate).multiply(this.reverse).multiply(part.matrix);local=this.joint;}
        this.m.multiplyMatrices(actor.matrix,local);batch.mesh.setMatrixAt(index,this.m);
        batch.mesh.setColorAt(index,part.tint?this.color.set(actor[part.tint]):part.color);index++;
      }
      batch.mesh.count=index;batch.mesh.instanceMatrix.needsUpdate=true;if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;
    }
  }
}

function carModel(taxi=false,suv=false) {
  const p=new Parts(),length=suv?4.7:4.3;
  p.add('rounded',[0,.8,0],[1.85,.62,length],'#bcc9bd').tint='paint';
  p.add('rounded',[0,1.32,-.15],[1.65,.75,2.55],'#466565');
  p.add('rounded',[0,1.69,-.2],[1.62,.13,1.7],'#cbd6c6').tint='paint';
  p.box(0,1.16,1.58,1.76,.12,1.02,'#c9d4c5').tint='paint';
  for(const side of [-1,1]){
    p.box(side*.84,1.32,-.1,.055,.72,.075,'#b7c4b5').tint='paint';
    for(const z of [-1.3,1.25]){p.cylinder(side*.89,.45,z,.36,.2,'#263630',wheelRotation);p.cylinder(side*.999,.45,z,.2,.024,'#b8c5b9',wheelRotation);}
    p.box(side*.98,1.22,.65,.25,.14,.3,'#b7c4b3').tint='paint';
    p.box(side*.6,.85,length/2,.48,.17,.025,'#fff0b7',undefined,'light');
    p.box(side*.6,.85,-length/2,.48,.17,.025,'#d95241',undefined,'light');
  }
  p.box(0,.63,length/2+.01,.55,.16,.025,'#e6e4cc');
  if(taxi){p.box(0,1.85,0,.63,.27,.27,'#f5ca55');p.box(0,1.87,.15,.44,.1,.025,'#3e4b34');}
  return p;
}

function busModel() {
  const p=new Parts();
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#1f3329';ctx.fillRect(0,0,512,64);ctx.fillStyle='#f5d36e';ctx.font='700 35px Arial';ctx.textAlign='center';ctx.fillText('WIESSE - SJL',256,45);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;p.materials.destination=new THREE.MeshBasicMaterial({map:texture});
  p.add('rounded',[0,1.65,0],[2.65,2.55,11.8],'#b63f38').tint='paint';
  p.add('rounded',[0,3,0],[2.48,.22,11.2],'#ccd5c3');
  p.box(0,2.15,5.91,2.4,1.23,.04,'#204b49',new THREE.Quaternion().setFromAxisAngle(V(1,0,0),-.1));
  p.box(0,1.45,5.95,2.28,.1,.03,'#d2d7c4');
  p.box(0,2.96,5.92,2.1,.28,.04,'#ffffff',undefined,'destination');
  for(const side of [-1,1]){
    p.box(side*1.335,2.23,0,.04,1.22,10.55,'#2d5452');
    for(let z=-4.8;z<5;z+=1.36)p.box(side*1.365,2.24,z,.03,1.27,.08,'#d2d9c9');
    p.box(side*1.35,1.38,0,.05,.3,11.2,'#e4dbb9');
    for(const z of [-3.85,3.85]){
      p.cylinder(side*1.28,.59,z,.56,.28,'#26362f',wheelRotation);p.cylinder(side*1.435,.59,z,.29,.04,'#b8c4b5',wheelRotation);
    }
    p.box(side*1.53,2.25,4.95,.23,.53,.3,'#333f36');
    p.box(side*.9,1.04,6,.35,.2,.025,'#fff0b4',undefined,'light');
    p.box(side*.94,1.03,-5.94,.18,.45,.025,'#e35b46',undefined,'light');
  }
  for(const z of [-1.65,3.9]){
    p.box(-1.38,1.62,z,.04,2.08,1.27,'#bac7b7');
    for(const dz of [-.31,.31])p.box(-1.409,2.01,z+dz,.025,1.14,.48,'#224b46');
    p.box(-1.413,1.57,z,.025,2.03,.04,'#4b6751');
  }
  p.box(0,3.18,-1,1.7,.22,2.1,'#a4b3a2');p.box(0,.78,6.01,.67,.21,.04,'#ece0ab');
  return p;
}

function personModel(wheelchair=false,cane=false) {
  const p=new Parts(),hip=wheelchair?.67:.88,head=wheelchair?1.37:1.64;
  p.add('sphere',[0,head,0],[.13,.16,.14],'#a97152').tint='skin';
  p.add('sphere',[0,head+.08,-.025],[.137,.11,.137],'#463b30');
  p.add('rounded',[0,hip+.27,0],[.39,.56,.25],'#5986a0').tint='shirt';
  for(const side of [-1,1]){
    const leg=p.beam(V(side*.12,hip,0),V(side*.12,wheelchair?.55:.14,wheelchair?.42:0),.079,'#475663');
    const foot=p.box(side*.12,wheelchair?.16:.08,wheelchair?.5:.09,.17,.13,.31,'#40463b');
    if(!wheelchair){leg.swing=foot.swing={pivot:[side*.12,hip,0],phase:side===1?0:Math.PI,gain:.42};}
    else p.beam(V(side*.12,.57,.4),V(side*.12,.2,.48),.075,'#465566');
    const arm=p.beam(V(side*.25,hip+.49,0),V(side*.31,hip+.02,wheelchair?.15:0),.06,'#ae7e56');arm.tint='skin';
    if(!wheelchair&&!cane)arm.swing={pivot:[side*.25,hip+.49,0],phase:side===1?Math.PI:0,gain:.33};
  }
  if(wheelchair){
    p.box(0,.55,0,.48,.1,.53,'#355f83');p.box(0,.85,-.25,.46,.62,.085,'#355f83');
    for(const side of [-1,1]){
      p.add('wheel',[side*.36,.38,-.035],[.36,.36,.36],'#48575a',new THREE.Quaternion().setFromAxisAngle(UP,Math.PI/2)).spin=[side*.36,.38,0];
      for(let i=0;i<6;i++){const angle=i*Math.PI/3;p.beam(V(side*.36,.38,0),V(side*.36,.38+Math.cos(angle)*.34,Math.sin(angle)*.34),.013,'#c1c9bc').spin=[side*.36,.38,0];}
      p.cylinder(side*.25,.12,.48,.105,.05,'#46554b',wheelRotation);p.beam(V(side*.29,.16,.44),V(side*.29,.84,-.24),.025,'#b0bfae');
    }
    p.box(0,.15,.51,.44,.045,.2,'#b3c2af');
  } else if(cane){p.beam(V(.37,.03,.26),V(.35,.87,.16),.025,'#b5bfa6');p.beam(V(.35,.87,.16),V(.25,.9,.12),.025,'#5a6455');}
  return p;
}

export class UrbanMobility {
  constructor(scene,metro,heightAt,streetTraffic=[],roads=[]) {
    this.group=new THREE.Group();this.group.name='Movilidad urbana';scene.add(this.group);this.metro=metro;this.heightAt=heightAt;this.elapsed=0;
    this.fleets=[new ActorBatch(this.group,carModel(),90),new ActorBatch(this.group,carModel(true),55),new ActorBatch(this.group,carModel(false,true),55),new ActorBatch(this.group,busModel(),45)];
    this.crowds=[new ActorBatch(this.group,personModel(),180),new ActorBatch(this.group,personModel(true),24),new ActorBatch(this.group,personModel(false,true),24)];
    this.people=[];this.vehicles=[];
    for(let i=0;i<240;i++)this.vehicles.push({id:i,type:i%9===0?3:i%5===0?2:i%4===0?1:0,base:i/240*metro.length,direction:i%2?1:-1,speed:i%9===0?6.5:8+seed(i)*5,matrix:new THREE.Matrix4(),paint:(i%9===0?['#a94139','#518e66','#ceaa47']:['#e1e4d6','#537b8a','#b85948','#d1c4a5','#677d79','#a9bac3'])[i%(i%9===0?3:6)]});
    const nearRail=(x,z)=>metro.data.points.some((a,i,points)=>{if(!i)return false;const b=points[i-1],dx=b[0]-a[0],dz=b[1]-a[1],t=THREE.MathUtils.clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz)<38;});
    streetTraffic.forEach((source,i)=>{if(!nearRail((source.a[0]+source.b[0])/2,(source.a[1]+source.b[1])/2))this.vehicles.push({id:i+240,source,type:i%14===0?3:i%5===0?1:0,matrix:new THREE.Matrix4(),paint:['#527d8b','#d2d6c8','#b84e43','#d4b56b'][i%4]});});
    const furniture=new Parts();
    for(const [stationIndex,s] of metro.stations.entries()){
      const sidewalks={};
      for(const side of [-1,1])sidewalks[side]=sidewalkOffset(metro,s,side,roads);
      for(let i=0;i<62;i++){
        const side=i%2?1:-1,platform=i<22,waiting=i>=48,mobility=i%23===0?1:i%29===0?2:0;
        this.people.push({id:stationIndex*100+i,station:s,side,sidewalk:sidewalks[side],platform,waiting,type:mobility,phase:seed(i+stationIndex*53)*Math.PI*2,speed:mobility===1?.85:mobility===2?.75:1.05+seed(i)*.25,base:seed(i+100)*90,matrix:new THREE.Matrix4(),skin:skins[(i+stationIndex)%skins.length],shirt:shirts[i%shirts.length],walking:!waiting});
      }
      for(const side of [-1,1]){
        for(let along=-64;along<110;along+=4){
          const p=metro.point(s.distance+along,side*sidewalks[side]);
          furniture.root=new THREE.Matrix4().compose(V(p.x,heightAt(p.x,p.z)+1.2,p.z),metro.orientation(s.distance+along),ONE);
          furniture.box(0,0,0,3.8,.26,4.15,'#d1d3c9');furniture.box(-side*1.83,.035,0,.13,.3,4.15,'#e3e4d7');
        }
        const location=metro.point(s.distance+95,side*sidewalks[side]),ground=heightAt(location.x,location.z)+1.33,rot=new THREE.Quaternion().setFromAxisAngle(UP,s.angle);
        furniture.root=new THREE.Matrix4().compose(V(location.x,ground,location.z),rot,ONE);
        furniture.box(0,2.7,0,2.7,.18,7,'#367961');furniture.box(side*1.15,1.5,0,.1,2.6,7,'#abc2ac',undefined,'glass');
        for(const z of [-3,3])furniture.box(side*1.14,1.3,z,.12,2.6,.12,'#307657');
        furniture.box(0,.6,0,.9,.13,4.5,'#798a72');furniture.box(0,1,0,.13,.75,4.5,'#668e70');
      }
    }
    furniture.finish(this.group);this.visibleVehicles=0;this.visiblePeople=0;
  }
  update(dt,camera) {
    this.elapsed+=dt;const vehicleBuckets=[[],[],[],[]],peopleBuckets=[[],[],[]];
    for(const actor of this.vehicles){
      let p,rotation;
      if(actor.source){const c=actor.source,f=(this.elapsed*c.speed/c.len+c.phase)%1,dx=(c.b[0]-c.a[0])/c.len,dz=(c.b[1]-c.a[1])/c.len;p=V(c.a[0]+dx*f*c.len-dz*c.lane,0,c.a[1]+dz*f*c.len+dx*c.lane);rotation=new THREE.Quaternion().setFromAxisAngle(UP,Math.atan2(dx,dz));}
      else {const distance=(actor.base+this.elapsed*actor.speed*actor.direction+this.metro.length*10)%this.metro.length;p=this.metro.point(distance,actor.direction*13.3);rotation=this.metro.orientation(distance,actor.direction);}
      const view=Math.hypot(p.x-camera.position.x,p.z-camera.position.z);
      if(view>800||vehicleBuckets[actor.type].length>=this.fleetCapacity(actor.type))continue;
      p.y=this.heightAt(p.x,p.z)+1.15;
      actor.matrix.compose(p,rotation,ONE);actor.phase=0;vehicleBuckets[actor.type].push(actor);
    }
    for(const actor of this.people){
      if(actor.platform&&!this.metro.group.visible)continue;
      const progress=(actor.base+this.elapsed*actor.speed)%180,along=actor.waiting?95+(Math.floor(actor.id%100/2)-27)*.82:(progress<90?progress:180-progress)-45;
      const offset=actor.side*((actor.platform?6.7:actor.sidewalk)+(seed(actor.id+17)-.5)*1.2),p=this.metro.point(actor.station.distance+along,offset);
      if(Math.hypot(p.x-camera.position.x,p.z-camera.position.z)>520||peopleBuckets[actor.type].length>=(actor.type===0?180:24))continue;
      p.y=actor.platform?actor.station.platformTop:this.heightAt(p.x,p.z)+1.33;
      const forward=actor.waiting?-actor.side:progress<90?1:-1,rotation=actor.waiting?new THREE.Quaternion().setFromAxisAngle(UP,actor.station.angle+actor.side*Math.PI/2):this.metro.orientation(actor.station.distance+along,forward);
      actor.matrix.compose(p,rotation,V(.92+seed(actor.id)*.17,1,1));actor.phase=this.elapsed*(actor.type===1?actor.speed/.36:5)+actor.id;
      peopleBuckets[actor.type].push(actor);
    }
    this.fleets.forEach((batch,i)=>batch.draw(vehicleBuckets[i]));this.crowds.forEach((batch,i)=>batch.draw(peopleBuckets[i]));
    this.visibleVehicles=vehicleBuckets.flat().length;this.visiblePeople=peopleBuckets.flat().length;
  }
  fleetCapacity(type){return [90,55,55,45][type];}
  diagnostics(){return{vehicles:this.vehicles.length,people:this.people.length,wheelchairs:this.people.filter(p=>p.type===1).length,visibleVehicles:this.visibleVehicles,visiblePeople:this.visiblePeople};}
}
