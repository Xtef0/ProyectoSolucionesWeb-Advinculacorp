const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..'),checks=[];
const pass=name=>{checks.push(name);console.log('PASS '+name);};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',args:['--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:940}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto('http://127.0.0.1:8090/',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>window.sjlDiagnostics&&sjlMap.frameCount>=5,{timeout:120000});
    const initial=await page.evaluate(()=>sjlDiagnostics());
    assert.deepEqual(initial.metro.stationNames,['Bayóvar','Santa Rosa','San Martín','San Carlos','Los Postes','Los Jardines','Pirámide del Sol']);
    assert.ok(initial.metro.length>8100&&initial.metro.length<8300);
    assert.ok(initial.metro.stations.every(s=>s.elevation>10&&s.elevation<25));
    assert.equal(initial.metro.trains.length,4);assert.ok(initial.metro.trains.every(t=>t.cars.length===6));
    pass('Real subway alignment, seven ordered elevated stations, four six-car trains');
    await page.screenshot({path:path.join(root,'qa/metro-desktop.png')});
    const before=await page.evaluate(()=>({frames:sjlMap.frameCount,time:performance.now(),distance:sjlMap.metro.trains[0].distance}));
    await page.waitForTimeout(6500);
    const after=await page.evaluate(()=>({frames:sjlMap.frameCount,time:performance.now(),distance:sjlMap.metro.trains[0].distance}));
    assert.ok(after.distance-before.distance>25);assert.ok(after.frames>before.frames);
    const benchmark={frames:after.frames-before.frames,seconds:(after.time-before.time)/1000,movementMeters:after.distance-before.distance};
    benchmark.fps=benchmark.frames/benchmark.seconds;console.log(JSON.stringify({benchmark}));
    pass('Continuous visible train travel with measured frame rate');
    for(let index=0;index<7;index++){
      await page.selectOption('#metroStation',String(index));
      await page.waitForFunction(()=>!sjlMap.flight);
      const error=await page.evaluate(i=>Math.hypot(sjlMap.controls.target.x-sjlMap.metro.stations[i].point.x,sjlMap.controls.target.z-sjlMap.metro.stations[i].point.z),index);
      assert.ok(error<.1);
    }
    pass('All seven station selector destinations frame correctly');
    await page.selectOption('#metroStation','3');await page.waitForFunction(()=>!sjlMap.flight);
    await page.locator('#followTrain').click();
    await page.waitForTimeout(4500);
    assert.equal(await page.locator('#followTrain').getAttribute('aria-pressed'),'true');
    const cameraBefore=await page.evaluate(()=>sjlMap.camera.position.toArray());
    await page.waitForTimeout(1800);assert.notDeepEqual(await page.evaluate(()=>sjlMap.camera.position.toArray()),cameraBefore);
    await page.screenshot({path:path.join(root,'qa/metro-follow.png')});
    await page.locator('#metroPause').click();
    const paused=await page.evaluate(()=>sjlMap.metro.trains.map(t=>t.distance));await page.waitForTimeout(1400);
    assert.deepEqual(await page.evaluate(()=>sjlMap.metro.trains.map(t=>t.distance)),paused);
    await page.locator('#metroPause').click();await page.waitForTimeout(1500);
    assert.notDeepEqual(await page.evaluate(()=>sjlMap.metro.trains.map(t=>t.distance)),paused);
    pass('Train-follow camera, pause and resume work');
    await page.locator('#nextTrain').click();assert.equal(await page.evaluate(()=>sjlMap.metro.followIndex),1);
    const box=await page.locator('#scene canvas').boundingBox();
    await page.mouse.move(box.x+box.width*.55,box.y+box.height*.56);await page.mouse.down();await page.mouse.move(box.x+box.width*.58,box.y+box.height*.59,{steps:6});await page.mouse.up();
    assert.equal(await page.evaluate(()=>sjlMap.metro.following),false);pass('Manual navigation releases follow mode');
    await page.locator('#showMetro').uncheck();await page.waitForTimeout(400);
    assert.equal(await page.evaluate(()=>sjlMap.metro.group.visible),false);
    assert.equal(await page.locator('.geo-label.station:visible').count(),0);
    await page.locator('#nextTrain').click();assert.equal(await page.locator('#showMetro').isChecked(),true);
    assert.equal(await page.evaluate(()=>sjlMap.metro.group.visible),true);pass('Metro layer and train controls remain synchronized');
    await page.selectOption('#metroStation','3');await page.waitForFunction(()=>!sjlMap.flight);
    const mobility=await page.evaluate(()=>sjlMap.mobility.diagnostics());
    assert.equal(mobility.people,434);assert.ok(mobility.wheelchairs>0);assert.ok(mobility.visibleVehicles>20&&mobility.visiblePeople>20);
    pass('Nearby buses, cars, walking people and wheelchair users render');
    const turnaround=await page.evaluate(()=>{
      const metro=sjlMap.metro,t=metro.trains[0],saved={distance:t.distance,direction:t.direction,speed:t.speed,wait:t.wait};
      t.distance=85.1;t.direction=-1;t.speed=.05;t.wait=0;
      for(let i=0;i<100;i++)metro.update(.1);
      const result={direction:t.direction,finite:t.cars.every(p=>Number.isFinite(p.x+p.y+p.z)),distance:t.distance};
      Object.assign(t,saved);metro.update(0);return result;
    });
    assert.equal(turnaround.direction,1);assert.ok(turnaround.finite&&turnaround.distance>85);pass('Terminal reversal is finite and resumes travel');
    await page.locator('#metroPause').click();
    await page.evaluate(()=>{const m=sjlMap,s=m.metro.stations[3];m.metro.trains[0].distance=s.distance-12;m.metro.update(0);m.flight=null;m.controls.target.copy(s.point).add({x:0,y:2,z:0});const right=s.tangent.clone().set(s.tangent.z,0,-s.tangent.x);m.camera.position.copy(m.controls.target).addScaledVector(right,58).addScaledVector(s.tangent,-60);m.camera.position.y+=29;m.controls.update();});
    await page.waitForTimeout(500);await page.screenshot({path:path.join(root,'qa/metro-detail.png')});
    await page.locator('#followTrain').click();await page.waitForTimeout(2500);await page.locator('#followTrain').click();
    await page.locator('#scene canvas').screenshot({path:path.join(root,'qa/motion-a.png')});
    await page.locator('#metroPause').click();await page.waitForTimeout(4000);
    await page.locator('#scene canvas').screenshot({path:path.join(root,'qa/motion-b.png')});
    pass('Fixed-camera before/after frames captured for pixel checks');
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.selectOption('#metroStation','3');await page.locator('#metroStationGo').click();
      await page.waitForFunction(()=>!sjlMap.flight);await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
      await page.screenshot({path:path.join(root,'qa/metro-mobile-'+width+'.png')});
      const overlap=await page.evaluate(()=>{const a=document.querySelector('.metro-controls').getBoundingClientRect(),b=document.querySelector('.territory-caption h2').getBoundingClientRect();return a.top<b.bottom;});
      assert.equal(overlap,false);pass('Mobile '+width+'px station visible with no heading/control overlap');
    }
    assert.deepEqual(errors,[]);pass('No browser errors');
    fs.writeFileSync(path.join(root,'qa/metro-results.json'),JSON.stringify({at:new Date().toISOString(),checks,benchmark,initial,mobility,errors},null,2));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
