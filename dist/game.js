(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const app = document.querySelector('.app');
  const overlay = document.getElementById('overlay');
  const startButton = document.getElementById('startButton');
  const title = document.getElementById('overlayTitle');
  const overlayText = document.getElementById('overlayText');
  const healthValue = document.getElementById('healthValue');
  const healthBar = document.getElementById('healthBar');
  const medCount = document.getElementById('medCount');
  const enemyValue = document.getElementById('enemyValue');
  const enemyBar = document.getElementById('enemyBar');
  const coordinates = document.getElementById('coordinates');
  const hitMarker = document.getElementById('hitMarker');
  const damageFlash = document.getElementById('damageFlash');
  const message = document.getElementById('message');
  const keys = new Set();
  const bounds = 17;
  const moveSpeed = 4.95;
  const turnSpeed = 1.25;
  const opponentFireRate = 1.2;
  const pillars = [{x:-6,z:3,s:2.3},{x:6,z:-4,s:2.3},{x:7,z:8,s:1.8},{x:-8,z:-8,s:1.8}];
  let w=0,h=0,dpr=1,f=0,horizon=0,last=0,now=0,mode='menu',shotAt=0,flashUntil=0,hitUntil=0,damageUntil=0,messageUntil=0,walk=0,round=0;
  let player,enemy,bullets,particles,stations;

  function resize(){
    dpr=Math.min(window.devicePixelRatio||1,2);
    w=window.innerWidth;h=window.innerHeight;
    canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
    canvas.style.width=w+'px';canvas.style.height=h+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    f=Math.min(w,h)*1.14;horizon=h*.47;
  }
  window.addEventListener('resize',resize);resize();

  function reset(){
    player={x:0,z:-11,yaw:0,health:100};
    enemy={x:0,z:9,health:100,cooldown:1.8/opponentFireRate,phase:0,strafe:1,hitUntil:0};
    stations=createStations();
    bullets=[];particles=[];shotAt=0;walk=0;round++;
    document.getElementById('roundLabel').textContent='ROUND '+String(round).padStart(2,'0');
    mode='playing';overlay.classList.add('hidden');app.classList.add('playing');
    keys.clear();updateHud();showMessage('TARGET ACQUIRED',1.4);
    startButton.blur();
  }
  function finish(won){
    mode=won?'won':'lost';keys.clear();app.classList.remove('playing');
    title.innerHTML=won?'TARGET<br><em>ELIMINATED.</em>':'MISSION<br><em>FAILED.</em>';
    overlayText.textContent=won?'Arena cleared. The drone is down. Ready for another round?':'The hostile drone got the better of you. Reset and take another shot.';
    startButton.innerHTML=won?'PLAY AGAIN <span>↗</span>':'RETRY MISSION <span>↗</span>';
    overlay.classList.remove('hidden');
  }
  startButton.addEventListener('click',reset);
  window.addEventListener('keydown',e=>{
    if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
    if(e.code==='Enter'&&mode!=='playing'){reset();return;}
    keys.add(e.code);
    if(e.code==='Space'&&mode==='playing')shoot();
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',()=>keys.clear());
  document.querySelectorAll('[data-key]').forEach(button=>{
    const code=button.dataset.key;
    button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(code);if(code==='Space'&&mode==='playing')shoot();});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>keys.delete(code));
  });

  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}
  function clearPosition(x,z,r){
    if(Math.abs(x)>bounds-r||Math.abs(z)>bounds-r)return false;
    return !pillars.some(p=>Math.abs(x-p.x)<p.s/2+r&&Math.abs(z-p.z)<p.s/2+r);
  }
  function createStations(){
    const result=[];
    for(let tries=0;result.length<3&&tries<500;tries++){
      const station={x:(Math.random()*28)-14,z:(Math.random()*28)-14,used:false};
      if(!clearPosition(station.x,station.z,1.2))continue;
      if(distance(station,player)<4||distance(station,enemy)<4)continue;
      if(result.some(other=>distance(station,other)<6))continue;
      result.push(station);
    }
    return result;
  }
  function moveUnit(unit,dx,dz,r){
    if(clearPosition(unit.x+dx,unit.z,r))unit.x+=dx;
    if(clearPosition(unit.x,unit.z+dz,r))unit.z+=dz;
  }
  function lineBlocked(ax,az,bx,bz){
    for(let i=1;i<24;i++){
      const t=i/24,x=ax+(bx-ax)*t,z=az+(bz-az)*t;
      if(pillars.some(p=>Math.abs(x-p.x)<p.s/2+.12&&Math.abs(z-p.z)<p.s/2+.12))return true;
    }
    return false;
  }
  function update(dt){
    if(mode!=='playing')return;
    if(keys.has('ArrowLeft'))player.yaw-=turnSpeed*dt;
    if(keys.has('ArrowRight'))player.yaw+=turnSpeed*dt;
    let movement=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
    if(movement){let speed=moveSpeed*dt*movement;moveUnit(player,Math.sin(player.yaw)*speed,Math.cos(player.yaw)*speed,.55);walk+=dt*7;}
    for(const station of stations){
      if(!station.used&&player.health<100&&distance(player,station)<1.4){
        station.used=true;player.health=Math.min(100,player.health+30);
        updateHud();showMessage('HEALTH RESTORED +30',1.3);
      }
    }
    if(keys.has('Space'))shoot();
    const d=distance(player,enemy),angle=Math.atan2(player.x-enemy.x,player.z-enemy.z);
    enemy.phase+=dt;enemy.cooldown-=dt;
    if(d>5.5){
      const toward=3.2*dt;
      moveUnit(enemy,Math.sin(angle)*toward,Math.cos(angle)*toward,.65);
    }else if(d<3.2){
      moveUnit(enemy,-Math.sin(angle)*2.3*dt,-Math.cos(angle)*2.3*dt,.65);
    }
    const strafeSpeed=Math.sin(enemy.phase*1.7)*1.65*dt;
    moveUnit(enemy,Math.cos(angle)*strafeSpeed,-Math.sin(angle)*strafeSpeed,.65);
    if(enemy.cooldown<=0&&d<25&&!lineBlocked(enemy.x,enemy.z,player.x,player.z)){
      enemy.cooldown=(1.35+Math.random()*.65)/opponentFireRate;
      const drift=(Math.random()-.5)*.16;
      const aim=angle+drift;
      bullets.push({x:enemy.x,z:enemy.z,y:1.42,vx:Math.sin(aim)*10.5,vz:Math.cos(aim)*10.5,life:3,trail:[]});
    }
    for(const b of bullets){
      b.trail.push({x:b.x,z:b.z,y:b.y});if(b.trail.length>5)b.trail.shift();
      b.x+=b.vx*dt;b.z+=b.vz*dt;b.life-=dt;
      if(Math.hypot(b.x-player.x,b.z-player.z)<.58){b.life=0;player.health=Math.max(0,player.health-10);damageUntil=now+.23;updateHud();if(player.health<=0)finish(false);}
      if(!clearPosition(b.x,b.z,.12))b.life=0;
    }
    bullets=bullets.filter(b=>b.life>0);
    for(const p of particles){p.x+=p.vx*dt;p.z+=p.vz*dt;p.y+=p.vy*dt;p.life-=dt;}
    particles=particles.filter(p=>p.life>0);
    coordinates.innerHTML='SECTOR A-01&nbsp;&nbsp; / &nbsp;&nbsp;X '+player.x.toFixed(1)+'&nbsp; Z '+player.z.toFixed(1);
  }
  function shoot(){
    if(now-shotAt<.23)return;
    shotAt=now;flashUntil=now+.09;
    const d=distance(player,enemy);
    const targetAngle=Math.atan2(enemy.x-player.x,enemy.z-player.z);
    const delta=Math.atan2(Math.sin(targetAngle-player.yaw),Math.cos(targetAngle-player.yaw));
    const hit=Math.abs(delta)<Math.atan2(.66,d)&&d<31&&!lineBlocked(player.x,player.z,enemy.x,enemy.z);
    if(hit){
      enemy.health=Math.max(0,enemy.health-10);
      enemy.hitUntil=now+.18;hitUntil=now+.18;updateHud();
      for(let i=0;i<12;i++){let a=Math.random()*Math.PI*2;particles.push({x:enemy.x,z:enemy.z,y:1.2+Math.random()*.7,vx:Math.cos(a)*(1+Math.random()*3),vz:Math.sin(a)*(1+Math.random()*3),vy:(Math.random()-.5)*4,life:.25+Math.random()*.3});}
      if(enemy.health<=0)finish(true);
    }
  }
  function updateHud(){healthValue.textContent=player.health;healthBar.style.width=player.health+'%';enemyValue.textContent=enemy.health+'%';enemyBar.style.width=enemy.health+'%';const remaining=stations.filter(station=>!station.used).length;medCount.textContent='✚ '+remaining+' HEALING STATION'+(remaining===1?'':'S');medCount.classList.toggle('low',remaining===0);}
  function showMessage(s,seconds){message.textContent=s;messageUntil=now+seconds;}

  function camera(x,y,z){
    const dx=x-player.x,dz=z-player.z;
    return {x:dx*Math.cos(player.yaw)-dz*Math.sin(player.yaw),y:y-1.66-Math.sin(walk)*.025,z:dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw)};
  }
  function project(x,y,z){const p=camera(x,y,z);if(p.z<.08)return null;return {x:w/2+p.x/p.z*f,y:horizon-p.y/p.z*f,z:p.z};}
  function clipLine(a,b){
    if(a.z<.12&&b.z<.12)return null;
    if(a.z<.12){const t=(.12-a.z)/(b.z-a.z);a={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:.12};}
    if(b.z<.12){const t=(.12-b.z)/(a.z-b.z);b={x:b.x+(a.x-b.x)*t,y:b.y+(a.y-b.y)*t,z:.12};}
    return [a,b];
  }
  function line3(a,b,color,width=1){
    const clipped=clipLine(camera(...a),camera(...b));if(!clipped)return;
    ctx.beginPath();ctx.moveTo(w/2+clipped[0].x/clipped[0].z*f,horizon-clipped[0].y/clipped[0].z*f);ctx.lineTo(w/2+clipped[1].x/clipped[1].z*f,horizon-clipped[1].y/clipped[1].z*f);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }
  function polygon3(points,fill,stroke){
    const input=points.map(p=>camera(...p));
    const ps=[];
    for(let i=0;i<input.length;i++){
      let a=input[i],b=input[(i+1)%input.length],ain=a.z>=.12,bin=b.z>=.12;
      if(ain)ps.push(a);
      if(ain!==bin){let t=(.12-a.z)/(b.z-a.z);ps.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:.12});}
    }
    if(ps.length<3)return;
    ctx.beginPath();ps.forEach((p,i)=>{const x=w/2+p.x/p.z*f,y=horizon-p.y/p.z*f;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.stroke();}
  }
  function cube(x,z,s,height,base='#213842'){
    const r=s/2,faces=[
      {p:[[x-r,0,z-r],[x+r,0,z-r],[x+r,height,z-r],[x-r,height,z-r]],c:'#27434d'},
      {p:[[x+r,0,z-r],[x+r,0,z+r],[x+r,height,z+r],[x+r,height,z-r]],c:'#1a3039'},
      {p:[[x+r,0,z+r],[x-r,0,z+r],[x-r,height,z+r],[x+r,height,z+r]],c:'#31515a'},
      {p:[[x-r,0,z+r],[x-r,0,z-r],[x-r,height,z-r],[x-r,height,z+r]],c:'#1c333d'}];
    faces.sort((a,b)=>{const aa=a.p.reduce((s,p)=>s+Math.hypot(p[0]-player.x,p[2]-player.z),0),bb=b.p.reduce((s,p)=>s+Math.hypot(p[0]-player.x,p[2]-player.z),0);return bb-aa;});
    for(const face of faces){polygon3(face.p,face.c,'#50717a');const a=face.p[0],b=face.p[1];line3([a[0],.28,a[2]],[b[0],.28,b[2]],'#f9774e',2);line3([a[0],height-.28,a[2]],[b[0],height-.28,b[2]],'#4dcbbf',1);}
    polygon3([[x-r,height,z-r],[x+r,height,z-r],[x+r,height,z+r],[x-r,height,z+r]],base,'#65808b');
  }
  function drawStation(station){
    const {x,z}=station,r=.48;
    const faces=[
      [[x-r,0,z-r],[x+r,0,z-r],[x+r,1,z-r],[x-r,1,z-r]],
      [[x+r,0,z-r],[x+r,0,z+r],[x+r,1,z+r],[x+r,1,z-r]],
      [[x+r,0,z+r],[x-r,0,z+r],[x-r,1,z+r],[x+r,1,z+r]],
      [[x-r,0,z+r],[x-r,0,z-r],[x-r,1,z-r],[x-r,1,z+r]]
    ];
    faces.sort((a,b)=>b.reduce((sum,p)=>sum+Math.hypot(p[0]-player.x,p[2]-player.z),0)-a.reduce((sum,p)=>sum+Math.hypot(p[0]-player.x,p[2]-player.z),0));
    for(const face of faces)polygon3(face,'#17423f','#6cf5b7');
    polygon3([[x-r,1,z-r],[x+r,1,z-r],[x+r,1,z+r],[x-r,1,z+r]],'#277c68','#b1ffe1');
    const p=project(x,1.65,z);if(!p)return;
    const s=Math.min(55,Math.max(12,f/p.z*.46));
    ctx.save();ctx.translate(p.x,p.y);ctx.shadowColor='#47ffc0';ctx.shadowBlur=17;ctx.fillStyle='#71ffd0';
    ctx.fillRect(-s*.12,-s*.42,s*.24,s*.84);ctx.fillRect(-s*.42,-s*.12,s*.84,s*.24);
    ctx.shadowBlur=0;ctx.textAlign='center';ctx.font=`${Math.max(9,Math.min(12,s*.24))}px "DM Mono",monospace`;ctx.fillText('+30 HEALTH',0,-s*.68);ctx.restore();
  }
  function drawArena(){
    const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#071118');sky.addColorStop(.6,'#162d38');sky.addColorStop(1,'#2b4850');ctx.fillStyle=sky;ctx.fillRect(0,0,w,horizon+1);
    const floor=ctx.createLinearGradient(0,horizon,0,h);floor.addColorStop(0,'#1a3038');floor.addColorStop(1,'#09151c');ctx.fillStyle=floor;ctx.fillRect(0,horizon,w,h-horizon);
    const glow=ctx.createRadialGradient(w/2,horizon,10,w/2,horizon,w*.62);glow.addColorStop(0,'#62d7c51b');glow.addColorStop(1,'#62d7c500');ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    for(let n=-16;n<=16;n+=2){line3([n,0,-17],[n,0,17],n%4===0?'#6aa6a74d':'#6a9a9d2e');line3([-17,0,n],[17,0,n],n%4===0?'#6aa6a74d':'#6a9a9d2e');}
    for(let n=-16;n<=16;n+=4){line3([n,.012,-17],[n,.012,17],'#60dedc1d',2);}
    const walls=[
      {p:[[-17,0,17],[17,0,17],[17,6,17],[-17,6,17]],c:'#25404a'},
      {p:[[17,0,17],[17,0,-17],[17,6,-17],[17,6,17]],c:'#1c323c'},
      {p:[[17,0,-17],[-17,0,-17],[-17,6,-17],[17,6,-17]],c:'#223a44'},
      {p:[[-17,0,-17],[-17,0,17],[-17,6,17],[-17,6,-17]],c:'#162d38'}];
    walls.sort((a,b)=>{let aa=a.p.reduce((s,p)=>s+Math.hypot(p[0]-player.x,p[2]-player.z),0),bb=b.p.reduce((s,p)=>s+Math.hypot(p[0]-player.x,p[2]-player.z),0);return bb-aa;});
    for(const wall of walls)polygon3(wall.p,wall.c,'#557984');
    for(let n=-16;n<=16;n+=4){
      line3([n,0,-17],[n,6,-17],'#7196a344');line3([n,0,17],[n,6,17],'#7196a344');
      line3([-17,0,n],[-17,6,n],'#7196a344');line3([17,0,n],[17,6,n],'#7196a344');
    }
    for(let y of [.28,3.1,5.65]){
      const c=y===.28?'#fd785273':'#72b5bd42';
      line3([-17,y,-17],[17,y,-17],c,y===.28?2:1);line3([17,y,-17],[17,y,17],c,y===.28?2:1);line3([17,y,17],[-17,y,17],c,y===.28?2:1);line3([-17,y,17],[-17,y,-17],c,y===.28?2:1);
    }
    for(let n=-12;n<=12;n+=8){for(let z of [-16.95,16.95]){line3([n-1,4.8,z],[n+1,4.8,z],'#72fff6',3);}}
    const objects=pillars.map(p=>({type:'pillar',depth:distance(player,p),p}));
    for(const station of stations)if(!station.used)objects.push({type:'station',depth:distance(player,station),station});
    if(enemy.health>0)objects.push({type:'enemy',depth:distance(player,enemy)});
    for(const b of bullets)objects.push({type:'bullet',depth:distance(player,b),b});
    objects.sort((a,b)=>b.depth-a.depth);
    for(const o of objects){if(o.type==='pillar')cube(o.p.x,o.p.z,o.p.s,3.4);else if(o.type==='station')drawStation(o.station);else if(o.type==='enemy')drawEnemy();else drawBullet(o.b);}
  }
  function drawEnemy(){
    const p=project(enemy.x,0,enemy.z);if(!p||p.z>40)return;
    const s=f/p.z,bodyW=1.05*s,bodyH=2.2*s;
    if(p.x+bodyW<0||p.x-bodyW>w)return;
    const x=p.x,y=p.y,hit=enemy.hitUntil>now;
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    ctx.fillStyle='#0007';ctx.beginPath();ctx.ellipse(0,0,.85,.22,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=hit?'#ffb796':'#182b33';ctx.strokeStyle=hit?'#ffd2ac':'#ff754f';ctx.lineWidth=.065;
    ctx.beginPath();ctx.moveTo(-.45,-1.95);ctx.lineTo(.45,-1.95);ctx.lineTo(.62,-1.45);ctx.lineTo(.43,-.68);ctx.lineTo(-.43,-.68);ctx.lineTo(-.62,-1.45);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=hit?'#fff0cf':'#31525a';ctx.fillRect(-.38,-2.53,.76,.6);ctx.strokeRect(-.38,-2.53,.76,.6);
    ctx.fillStyle='#ff5d39';ctx.shadowColor='#ff5836';ctx.shadowBlur=.28*s;ctx.fillRect(-.28,-2.32,.56,.12);ctx.shadowBlur=0;
    ctx.fillStyle='#172c34';ctx.strokeStyle='#6eacaf';ctx.fillRect(-.43,-.7,.32,.7);ctx.fillRect(.11,-.7,.32,.7);ctx.strokeRect(-.43,-.7,.32,.7);ctx.strokeRect(.11,-.7,.32,.7);
    ctx.fillStyle='#36545e';ctx.fillRect(-.78,-1.83,.24,.9);ctx.fillRect(.54,-1.83,.24,.9);ctx.fillStyle='#ff704a';ctx.fillRect(-.27,-1.67,.54,.1);
    ctx.restore();
    const name=project(enemy.x,2.9,enemy.z);if(name){ctx.textAlign='center';ctx.font=`${Math.max(9,Math.min(12,11*s/35))}px "DM Mono",monospace`;ctx.fillStyle='#ff8b69';ctx.fillText('◆  DRONE-01',name.x,name.y);}
  }
  function drawBullet(b){
    for(let i=0;i<b.trail.length-1;i++){const a=b.trail[i],c=b.trail[i+1];line3([a.x,a.y,a.z],[c.x,c.y,c.z],`rgba(255,111,72,${(i+1)/b.trail.length*.5})`,3);}
    const p=project(b.x,b.y,b.z);if(!p)return;const r=Math.min(24,Math.max(2,f/p.z*.13));const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r*2);g.addColorStop(0,'#fff6d9');g.addColorStop(.25,'#ff8d53');g.addColorStop(1,'#ff5b3600');ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,r*2,0,Math.PI*2);ctx.fill();
  }
  function drawEffects(){
    for(const p of particles){const s=project(p.x,p.y,p.z);if(!s)continue;ctx.fillStyle=`rgba(255,${100+Math.round(100*p.life)},65,${Math.min(1,p.life*3)})`;ctx.fillRect(s.x,s.y,Math.max(2,5/s.z*5),Math.max(2,5/s.z*5));}
    if(flashUntil>now){const alpha=(flashUntil-now)/.09;ctx.fillStyle=`rgba(255,232,188,${alpha*.36})`;ctx.beginPath();ctx.moveTo(w*.5,h);ctx.lineTo(w*.46,h*.69);ctx.lineTo(w*.53,h*.69);ctx.closePath();ctx.fill();}
    hitMarker.classList.toggle('show',hitUntil>now);damageFlash.classList.toggle('show',damageUntil>now);message.classList.toggle('show',messageUntil>now);
    const vignette=ctx.createRadialGradient(w/2,h*.5,h*.15,w/2,h*.5,Math.max(w,h)*.73);vignette.addColorStop(0,'#0000');vignette.addColorStop(1,'#02090c9c');ctx.fillStyle=vignette;ctx.fillRect(0,0,w,h);
  }
  function frame(t){now=t/1000;let dt=Math.min(.05,(t-last)/1000||0);last=t;if(player){update(dt);drawArena();drawEffects();}requestAnimationFrame(frame);}
  player={x:0,z:-11,yaw:0,health:100};enemy={x:0,z:9,health:100,hitUntil:0};bullets=[];particles=[];stations=[];
  requestAnimationFrame(frame);
})();
