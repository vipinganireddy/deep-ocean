    const FIREBASE_CONFIG = (() => {
      try {
        return JSON.parse(localStorage.getItem('deep-ocean:firebase-config') || '{}');
      } catch {
        return {};
      }
    })();
    const FIREBASE_ENABLED = Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);

const Game = (() => {
  'use strict';

  const canvas = document.getElementById('ocean');
  const ctx    = canvas.getContext('2d');

  let W, H, dpr;
  let playing = false;
  const care = { happiness:100 };

  function resize() {
    // cap DPR: on Retina screens dpr=2 means 4x the pixels to fill every frame,
    // which is the single biggest cause of dropped frames here. 1.5 still looks sharp.
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W*dpr; canvas.height = H*dpr;
    canvas.style.width = W+'px'; canvas.style.height = H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  window.addEventListener('resize', resize);

  const mouse = { x:0, y:0, px:0, py:0, vx:0, vy:0, moving:false, moveTimer:0 };
  function ptrMove(e) {
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    mouse.x = cx; mouse.y = cy; mouse.moving = true; mouse.moveTimer = 0;
  }
  window.addEventListener('mousemove', ptrMove);
  window.addEventListener('touchmove', ptrMove, { passive:true });
  window.addEventListener('touchstart', ptrMove, { passive:true });
  // tap anywhere on the water to drop food there
  window.addEventListener('pointerdown', (e)=>{
    if(!playing) return;
    if(e.target && e.target.closest && e.target.closest('button,a,input,select,.food-menu,#landing-screen,#home-screen,.chip')) return;
    dropFoodAt(e.clientX, e.clientY);
  });

  const { PI, sin, cos, atan2, sqrt, abs, min, max, random, floor } = Math;
  const TAU = PI * 2;
  function lerp(a,b,t){ return a+(b-a)*t; }
  function lerpAngle(a,b,t){
    let d=b-a; while(d>PI)d-=TAU; while(d<-PI)d+=TAU; return a+d*t;
  }
  function clamp(v,lo,hi){ return v<lo?lo:v>hi?hi:v; }

  const S = 1.1;

  // ══════════════════════════════════════════════
  //   FISH — velocity physics
  // ══════════════════════════════════════════════
  const fish = {
    x:0, y:0, vx:0, vy:0, angle:0, speed:0,
    tailPhase:0, finPhase:0, blinkTimer:3000,
    blinkAmount:0, mouthOpen:0, chomp:0, mouthAnticip:0, breathPhase:0, tilt:0, rest:0,
    facing:1,
  };

  const target = { x:0, y:0 };

  function initFish(){
    fish.x=W/2; fish.y=H/2;
    mouse.x=W/2; mouse.y=H/2;
    mouse.px=W/2; mouse.py=H/2; mouse.vx=0; mouse.vy=0;
    target.x=W/2; target.y=H/2;
  }

  function updateFish(dt) {
    mouse.moveTimer += dt;
    if (mouse.moveTimer > 150) mouse.moving = false;

    if (!playing) {
      fish.breathPhase += 0.018;
      fish.tailPhase   += 0.048;
      fish.finPhase    += 0.026;
      fish.x = lerp(fish.x, W/2, 0.004);
      fish.y = lerp(fish.y, H/2 + sin(fish.breathPhase*0.6)*18, 0.008);
      fish.angle = lerpAngle(fish.angle, sin(fish.breathPhase*0.25)*0.1, 0.015);
      fish.tilt  = lerp(fish.tilt, 0, 0.05);
      fish.speed = lerp(fish.speed, 0, 0.1);
      return;
    }

    const step = clamp(dt / 16.67, 0.5, 2);
    // track cursor velocity — lets the fish match your motion instead of always trailing it
    mouse.vx += ((mouse.x - mouse.px) - mouse.vx) * 0.25;
    mouse.vy += ((mouse.y - mouse.py) - mouse.vy) * 0.25;
    mouse.px = mouse.x; mouse.py = mouse.y;
    const idleDrift = mouse.moving ? 0 : 1;
    // rest: after a long idle the fish drifts home and nestles in its anemone
    const idleLong = mouse.moveTimer > 30000;
    fish.rest = lerp(fish.rest, idleLong ? 1 : 0, (idleLong ? 0.012 : 0.08) * step);
    const nestX = anemone.fx * W;
    const nestY = H - 52 + sin(fish.breathPhase * 0.7) * 5;
    const calmX = mouse.x + sin(fish.breathPhase * 0.35) * 22 * idleDrift;
    const calmY = mouse.y + cos(fish.breathPhase * 0.28) * 14 * idleDrift;
    const tgX = lerp(calmX, nestX, fish.rest);
    const tgY = lerp(calmY, nestY, fish.rest);

    target.x = lerp(target.x, tgX, 0.32 * step);
    target.y = lerp(target.y, tgY, 0.32 * step);

    const dx = target.x - fish.x;
    const dy = target.y - fish.y;
    const dist = sqrt(dx*dx + dy*dy);
    const targetAngle = dist > 0.1 ? atan2(dy, dx) : fish.angle;
    const comfortDistance = 18;
    const followDistance = max(0, dist - comfortDistance);
    const maxSpeed = 8.6;
    const desiredSpeed = min(maxSpeed, followDistance * 0.072);
    const ux = dist > 0.1 ? dx / dist : 0;
    const uy = dist > 0.1 ? dy / dist : 0;
    const ease = clamp(0.11 + followDistance * 0.0013, 0.11, 0.26) * step;

    // tail-beat propulsion: slight surge on each stroke (kept subtle so it stays responsive)
    const beat = 0.92 + 0.08 * sin(fish.tailPhase * 2.0);
    // feedforward: match the cursor's own velocity so the fish doesn't permanently trail it
    const ff = 1 - fish.rest;
    const wantX = ux * desiredSpeed * beat + mouse.vx * ff;
    const wantY = uy * desiredSpeed * beat + mouse.vy * ff;
    fish.vx = lerp(fish.vx, wantX, ease);
    fish.vy = lerp(fish.vy, wantY, ease);

    // speed-dependent turn radius: still banks, but snaps to heading quickly
    const speedFrac = min(fish.speed / maxSpeed, 1);
    const turnRate = clamp((0.11 + followDistance * 0.0012) * (1 - speedFrac * 0.3), 0.06, 0.22) * step;
    if (dist > 4) fish.angle = lerpAngle(fish.angle, targetAngle, turnRate);

    // Banking tilt when turning
    let dAng = targetAngle - fish.angle;
    while(dAng>PI)dAng-=TAU; while(dAng<-PI)dAng+=TAU;
    fish.tilt = lerp(fish.tilt, clamp(dAng*0.35, -0.5, 0.5), 0.09);

    // Drag — water resistance
    fish.vx *= 0.980; fish.vy *= 0.980;

    const rawSpeed = sqrt(fish.vx*fish.vx + fish.vy*fish.vy);
    if (rawSpeed > maxSpeed) {
      const scale = maxSpeed / rawSpeed;
      fish.vx *= scale; fish.vy *= scale;
    }

    if (dist < comfortDistance) { fish.vx *= 0.88; fish.vy *= 0.88; }

    fish.x += fish.vx * step; fish.y += fish.vy * step;
    fish.speed = sqrt(fish.vx*fish.vx + fish.vy*fish.vy);

    // Soft bounds
    const m = 45;
    if(fish.x<m){fish.x=m; fish.vx=abs(fish.vx)*0.3;}
    if(fish.x>W-m){fish.x=W-m; fish.vx=-abs(fish.vx)*0.3;}
    if(fish.y<m){fish.y=m; fish.vy=abs(fish.vy)*0.3;}
    if(fish.y>H-m){fish.y=H-m; fish.vy=-abs(fish.vy)*0.3;}

    fish.tailPhase  += (0.035 + min(fish.speed, 9) * 0.020) * (1 - fish.rest * 0.55);
    fish.finPhase   += 0.020 + min(fish.speed, 9) * 0.004;
    fish.breathPhase += 0.017;
    // mouth: gentle idle motion, opens wide when anticipating/eating food
    fish.chomp = lerp(fish.chomp, 0, 0.18);
    fish.mouthOpen  = lerp(fish.mouthOpen, fish.speed>1.4?0.35:0.04, 0.05);
    if (cos(fish.angle) > 0.08) fish.facing = 1;
    if (cos(fish.angle) < -0.08) fish.facing = -1;
    fish.blinkTimer -= dt;
    if(fish.blinkTimer <= 0){ fish.blinkTimer=2500+random()*4000; fish.blinkAmount=1; }
    fish.blinkAmount = lerp(fish.blinkAmount, 0, 0.11);
  }

  // ══════════════════════════════════════════════
  //   TRAIL SYSTEM
  // ══════════════════════════════════════════════
  class TrailParticle {
    constructor(x, y, angle, speed, kind = 'glow') {
      const spread = kind === 'ribbon' ? 4 : 9;
      this.x = x + (random()-0.5)*spread;
      this.y = y + (random()-0.5)*spread;
      const sp = speed * (kind === 'bubble' ? 0.12 : 0.22) + 0.18;
      this.vx = -cos(angle + (random()-0.5)*0.65) * sp;
      this.vy = -sin(angle + (random()-0.5)*0.65) * sp - random()*0.16;
      this.life = 1;
      this.kind = kind;
      this.decay = kind === 'ribbon' ? 0.009 + random()*0.006 : 0.012 + random()*0.011;
      this.r = kind === 'ribbon' ? random()*6 + 5 : random()*2.8 + 0.7;
      this.spin = random() * TAU;
    }
    update() {
      this.x += this.vx; this.y += this.vy;
      this.vx *= 0.965; this.vy *= 0.965;
      this.spin += 0.025;
      if(this.kind === 'bubble') this.y -= 0.22;
      this.life -= this.decay;
    }
    draw() {
      if(this.life <= 0) return;
      const t = this.life;
      if(this.kind === 'bubble') {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.r*t, 0, TAU);
        ctx.strokeStyle = `rgba(155,225,255,${t*0.42})`; ctx.lineWidth=0.7; ctx.stroke();
        ctx.beginPath(); ctx.arc(this.x-this.r*0.3, this.y-this.r*0.3, this.r*0.2*t, 0, TAU);
        ctx.fillStyle = `rgba(220,248,255,${t*0.72})`; ctx.fill();
      } else if(this.kind === 'ribbon') {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.spin);
        const g = ctx.createRadialGradient(0,0,0,0,0,this.r*t);
        g.addColorStop(0, `rgba(255,224,115,${t*0.18})`);
        g.addColorStop(0.45, `rgba(100,210,255,${t*0.10})`);
        g.addColorStop(1, 'rgba(100,210,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0,0,this.r*1.9*t,this.r*0.45*t,0,0,TAU);
        ctx.fill();
        ctx.restore();
      } else {
        const g = ctx.createRadialGradient(this.x,this.y,0,this.x,this.y,this.r*t*2);
        g.addColorStop(0, `rgba(255,220,110,${t*0.45})`);
        g.addColorStop(0.4, `rgba(120,215,255,${t*0.16})`);
        g.addColorStop(1, `rgba(160,120,30,0)`);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(this.x,this.y,this.r*t*2,0,TAU); ctx.fill();
      }
    }
  }

  let trail = []; let trailT = 0;

  // ══════════════════════════════════════════════
  //   DRAW FISH
  // ══════════════════════════════════════════════
  function drawFish(time) {
    drawClownfish(time);
    return;

    // ══ Ocellaris clownfish (real species) ═════════════════════
    function drawClownfish(t){
      const bob=sin(fish.breathPhase)*1.0;
      const facingLeft=fish.facing<0;
      const bodyAngle=facingLeft?fish.angle-PI:fish.angle;
      const wag=sin(fish.tailPhase);
      const flap=sin(fish.finPhase);

      ctx.save();
      ctx.translate(fish.x, fish.y+bob);
      ctx.rotate(bodyAngle);
      ctx.rotate((facingLeft?-fish.tilt:fish.tilt)*0.12);
      if(facingLeft) ctx.scale(-1,1);

      const O_BACK='#c9490a', O_MID='#f2701a', O_HI='#ff9c40', O_BELLY='#f28a37';

      const bodyPath=()=>{
        ctx.beginPath();
        ctx.moveTo(35*S,0);
        ctx.bezierCurveTo(31*S,-12*S,21*S,-20*S,7*S,-20.5*S);
        ctx.bezierCurveTo(-6*S,-20.5*S,-16*S,-16*S,-23*S,-7*S);
        ctx.bezierCurveTo(-25.5*S,-3*S,-25.5*S,3*S,-23*S,7*S);
        ctx.bezierCurveTo(-16*S,16*S,-6*S,19.5*S,8*S,19.5*S);
        ctx.bezierCurveTo(21*S,19.5*S,31*S,12*S,35*S,0);
        ctx.closePath();
      };

      // soft depth shadow beneath the fish
      const dsh=ctx.createRadialGradient(0,11*S,2*S,0,11*S,32*S);
      dsh.addColorStop(0,'rgba(0,14,22,0.30)'); dsh.addColorStop(1,'rgba(0,14,22,0)');
      ctx.fillStyle=dsh; ctx.beginPath(); ctx.ellipse(0,11*S,30*S,8*S,0,0,TAU); ctx.fill();

      // ---------- CAUDAL FIN ----------
      ctx.save(); ctx.translate(-21*S,0); ctx.rotate(wag*0.13);
      ctx.beginPath();
      ctx.moveTo(1*S,-7*S);
      ctx.quadraticCurveTo(-16*S,-22*S,-26*S,-19*S);
      ctx.quadraticCurveTo(-18*S,-7*S,-19*S,0);
      ctx.quadraticCurveTo(-18*S,7*S,-26*S,19*S);
      ctx.quadraticCurveTo(-16*S,22*S,1*S,7*S);
      ctx.closePath();
      let fg=ctx.createLinearGradient(0,0,-26*S,0);
      fg.addColorStop(0,'rgba(242,112,24,0.96)'); fg.addColorStop(1,'rgba(246,150,64,0.72)');
      ctx.fillStyle=fg; ctx.fill();
      ctx.strokeStyle='rgba(150,55,10,0.32)'; ctx.lineWidth=1*S;
      for(let i=-4;i<=4;i++){ const a=i/4*0.62; ctx.beginPath(); ctx.moveTo(-2*S,0); ctx.lineTo(-24*S*cos(a),-24*S*sin(a)); ctx.stroke(); }
      ctx.strokeStyle='rgba(20,12,6,0.88)'; ctx.lineWidth=1.6*S; ctx.lineJoin='round';
      ctx.beginPath(); ctx.moveTo(-26*S,-19*S);
      ctx.quadraticCurveTo(-18*S,-7*S,-19*S,0);
      ctx.quadraticCurveTo(-18*S,7*S,-26*S,19*S); ctx.stroke();
      ctx.restore();

      // ---------- DORSAL FIN ----------
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(15*S,-17*S);
      ctx.quadraticCurveTo(9*S,-26*S,1*S,-25*S);
      ctx.quadraticCurveTo(-8*S,-24*S,-15*S,-15.5*S);
      ctx.lineTo(-13*S,-13*S);
      ctx.quadraticCurveTo(-4*S,-18*S,15*S,-14*S);
      ctx.closePath();
      let dg=ctx.createLinearGradient(0,-26*S,0,-13*S);
      dg.addColorStop(0,'rgba(238,104,22,0.78)'); dg.addColorStop(1,'rgba(242,116,28,0.96)');
      ctx.fillStyle=dg; ctx.fill();
      ctx.strokeStyle='rgba(150,55,10,0.3)'; ctx.lineWidth=0.9*S;
      for(let i=0;i<7;i++){ const x=13*S-i*4*S; ctx.beginPath(); ctx.moveTo(x,-13.5*S); ctx.lineTo(x-1*S,-23*S+abs(i-3)*1.2*S); ctx.stroke(); }
      ctx.strokeStyle='rgba(20,12,6,0.82)'; ctx.lineWidth=1.4*S; ctx.lineJoin='round';
      ctx.beginPath(); ctx.moveTo(15*S,-17*S);
      ctx.quadraticCurveTo(9*S,-26*S,1*S,-25*S);
      ctx.quadraticCurveTo(-8*S,-24*S,-15*S,-15.5*S); ctx.stroke();
      ctx.restore();

      // ---------- ANAL FIN ----------
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(4*S,14*S);
      ctx.quadraticCurveTo(-2*S,22*S,-12*S,20*S);
      ctx.quadraticCurveTo(-14*S,16*S,-12*S,13*S);
      ctx.quadraticCurveTo(-3*S,16*S,4*S,12*S);
      ctx.closePath();
      ctx.fillStyle='rgba(241,114,26,0.92)'; ctx.fill();
      ctx.strokeStyle='rgba(150,55,10,0.3)'; ctx.lineWidth=0.9*S;
      for(let i=0;i<5;i++){ const x=2*S-i*3*S; ctx.beginPath(); ctx.moveTo(x,13*S); ctx.lineTo(x-1*S,20*S-abs(i-2)*1*S); ctx.stroke(); }
      ctx.strokeStyle='rgba(20,12,6,0.78)'; ctx.lineWidth=1.3*S; ctx.lineJoin='round';
      ctx.beginPath(); ctx.moveTo(4*S,14*S);
      ctx.quadraticCurveTo(-2*S,22*S,-12*S,20*S); ctx.stroke();
      ctx.restore();

      // ---------- PELVIC FIN ----------
      ctx.save(); ctx.translate(16*S,14*S); ctx.rotate(flap*0.14+0.25);
      ctx.beginPath(); ctx.moveTo(0,0);
      ctx.quadraticCurveTo(2*S,9*S,-3*S,11*S);
      ctx.quadraticCurveTo(-6*S,7*S,-4*S,0); ctx.closePath();
      ctx.fillStyle='rgba(241,114,26,0.94)'; ctx.fill();
      ctx.strokeStyle='rgba(20,12,6,0.78)'; ctx.lineWidth=1.2*S; ctx.stroke();
      ctx.restore();

      // ---------- BODY ----------
      bodyPath();
      let bg=ctx.createLinearGradient(0,-20*S,0,19*S);
      bg.addColorStop(0,O_BACK); bg.addColorStop(0.28,O_MID);
      bg.addColorStop(0.58,O_HI); bg.addColorStop(0.82,O_MID); bg.addColorStop(1,O_BELLY);
      ctx.fillStyle=bg; ctx.fill();

      // interior shading for volume
      ctx.save(); bodyPath(); ctx.clip();
      let shn=ctx.createRadialGradient(11*S,-9*S,1*S,7*S,-3*S,28*S);
      shn.addColorStop(0,'rgba(255,214,158,0.75)'); shn.addColorStop(1,'rgba(255,214,158,0)');
      ctx.fillStyle=shn; ctx.fillRect(-30*S,-22*S,70*S,44*S);
      let bk=ctx.createLinearGradient(0,-21*S,0,-5*S);
      bk.addColorStop(0,'rgba(110,36,0,0.55)'); bk.addColorStop(1,'rgba(110,36,0,0)');
      ctx.fillStyle=bk; ctx.fillRect(-30*S,-22*S,70*S,17*S);
      let bo=ctx.createLinearGradient(0,19*S,0,3*S);
      bo.addColorStop(0,'rgba(120,45,5,0.45)'); bo.addColorStop(1,'rgba(120,45,5,0)');
      ctx.fillStyle=bo; ctx.fillRect(-30*S,1*S,70*S,21*S);
      ctx.strokeStyle='rgba(150,55,8,0.10)'; ctx.lineWidth=0.7*S;
      for(let ry=-14;ry<=14;ry+=5){ for(let rx=-20;rx<=28;rx+=7){ const off=(Math.floor(rx/7)%2)?2.5:0;
        ctx.beginPath(); ctx.arc(rx*S,(ry+off)*S,2.6*S,PI*0.15,PI*0.85); ctx.stroke(); } }
      ctx.restore();

      // ---------- WHITE BANDS (clipped) ----------
      ctx.save(); bodyPath(); ctx.clip();
      const band=(pts,edgeW)=>{
        ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
        for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
        ctx.closePath();
        let wg=ctx.createLinearGradient(0,-20*S,0,19*S);
        wg.addColorStop(0,'#e9eef1'); wg.addColorStop(0.5,'#ffffff'); wg.addColorStop(1,'#d8e1e6');
        ctx.fillStyle=wg; ctx.fill();
        ctx.strokeStyle='rgba(16,11,7,0.9)'; ctx.lineWidth=edgeW; ctx.lineJoin='round'; ctx.stroke();
      };
      band([[20*S,-23*S],[14*S,-23*S],[12*S,23*S],[18*S,23*S]],1.3*S);
      band([[2*S,-23*S],[-8*S,-23*S],[-8*S,23*S],[2*S,23*S],[4*S,9*S],[8.5*S,0],[4*S,-9*S]],1.4*S);
      band([[-16*S,-23*S],[-20*S,-23*S],[-20*S,23*S],[-16*S,23*S]],1.2*S);
      ctx.restore();

      // gill crease
      ctx.save(); bodyPath(); ctx.clip();
      ctx.strokeStyle='rgba(150,60,15,0.3)'; ctx.lineWidth=1.1*S;
      ctx.beginPath(); ctx.moveTo(24*S,-14*S); ctx.quadraticCurveTo(21*S,0,24*S,13*S); ctx.stroke();
      // inner rim shade for depth
      ctx.lineWidth=3.4*S; ctx.strokeStyle='rgba(90,28,0,0.28)'; bodyPath(); ctx.stroke();
      ctx.restore();

      // drifting caustic sunlight on the body
      ctx.save(); bodyPath(); ctx.clip(); ctx.globalCompositeOperation='lighter';
      for(let i=0;i<3;i++){
        const px=sin(t*0.0009+i*2.1)*16*S, py=cos(t*0.0011+i*1.7)*7*S-3*S;
        const cr=ctx.createRadialGradient(px,py,1,px,py,13*S);
        cr.addColorStop(0,'rgba(255,242,205,0.10)'); cr.addColorStop(1,'rgba(255,242,205,0)');
        ctx.fillStyle=cr; ctx.fillRect(-30*S,-24*S,70*S,48*S);
      }
      ctx.restore();

      // ---------- PECTORAL FIN ----------
      ctx.save(); ctx.translate(7*S,3*S); ctx.rotate(0.2+flap*0.16);
      ctx.beginPath(); ctx.moveTo(0,0);
      ctx.quadraticCurveTo(11*S,3*S,13*S,15*S);
      ctx.quadraticCurveTo(4*S,15*S,-2*S,7*S); ctx.closePath();
      let pg=ctx.createLinearGradient(0,0,6*S,15*S);
      pg.addColorStop(0,'rgba(248,142,54,0.72)'); pg.addColorStop(1,'rgba(238,108,24,0.5)');
      ctx.fillStyle=pg; ctx.fill();
      ctx.strokeStyle='rgba(150,55,10,0.3)'; ctx.lineWidth=0.8*S;
      for(let i=0;i<5;i++){ const a=i/4; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(lerp(0,10*S,a),lerp(4*S,15*S,a)); ctx.stroke(); }
      ctx.strokeStyle='rgba(20,12,6,0.5)'; ctx.lineWidth=1*S;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(11*S,3*S,13*S,15*S); ctx.stroke();
      ctx.restore();

      // ---------- EYE ----------
      const ex=24.5*S, ey=-3*S;
      ctx.beginPath(); ctx.arc(ex,ey,6.4*S,0,TAU); ctx.fillStyle='rgba(120,45,5,0.5)'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex,ey,5.4*S,0,TAU); ctx.fillStyle='#ffe9cf'; ctx.fill();
      let ig=ctx.createRadialGradient(ex-1.4*S,ey-1.4*S,0.4*S,ex,ey,5*S);
      ig.addColorStop(0,'#8a4415'); ig.addColorStop(0.6,'#4a2208'); ig.addColorStop(1,'#160a03');
      ctx.beginPath(); ctx.arc(ex,ey,4.9*S,0,TAU); ctx.fillStyle=ig; ctx.fill();
      ctx.beginPath(); ctx.arc(ex,ey,2.5*S,0,TAU); ctx.fillStyle='#070402'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex-1.6*S,ey-1.8*S,1.5*S,0,TAU); ctx.fillStyle='rgba(255,255,255,0.95)'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex+1.8*S,ey+1.5*S,0.7*S,0,TAU); ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex,ey,5.4*S,0,TAU); ctx.strokeStyle='rgba(30,15,5,0.5)'; ctx.lineWidth=0.8*S; ctx.stroke();
      // eyelid — sweeps down when the fish blinks
      const blink = (fish.blinkAmount||0);
      if(blink>0.02){
        ctx.save();
        ctx.beginPath(); ctx.arc(ex,ey,5.5*S,0,TAU); ctx.clip();
        const lidY = (ey-6*S) + blink*12*S;
        const lg=ctx.createLinearGradient(0,ey-6*S,0,lidY);
        lg.addColorStop(0,'#f0851f'); lg.addColorStop(1,'#dd6a12');
        ctx.fillStyle=lg; ctx.fillRect(ex-6*S, ey-6*S, 12*S, lidY-(ey-6*S));
        ctx.strokeStyle='rgba(110,45,10,0.55)'; ctx.lineWidth=1*S;
        ctx.beginPath(); ctx.moveTo(ex-6*S, lidY); ctx.lineTo(ex+6*S, lidY); ctx.stroke();
        ctx.restore();
      }

      // ---------- MOUTH (opens when eating) + wet back streak ----------
      const gape = max(0, min(1, (fish.mouthOpen||0)*0.4 + (fish.mouthAnticip||0)*0.7 + (fish.chomp||0)));
      const jaw = gape*4.6*S;
      if(gape>0.03){
        ctx.beginPath();
        ctx.moveTo(34.6*S,2.6*S);
        ctx.quadraticCurveTo(30*S,4*S,28.4*S,4.2*S);
        ctx.quadraticCurveTo(31*S,6*S+jaw,34.9*S,4.4*S+jaw*0.5);
        ctx.closePath();
        const mg=ctx.createLinearGradient(34*S,2*S,30*S,6*S+jaw);
        mg.addColorStop(0,'#7a2412'); mg.addColorStop(1,'#360d07');
        ctx.fillStyle=mg; ctx.fill();
      }
      ctx.strokeStyle='rgba(120,50,14,0.95)'; ctx.lineWidth=1.6*S; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(35*S,2.6*S); ctx.quadraticCurveTo(31*S,3.8*S,28.5*S,4.1*S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(35*S,2.9*S); ctx.quadraticCurveTo(31.5*S,5.8*S+jaw,28.5*S,4.6*S+jaw*0.6); ctx.stroke();
      ctx.save(); bodyPath(); ctx.clip();
      ctx.strokeStyle='rgba(255,228,175,0.4)'; ctx.lineWidth=2*S; ctx.lineCap='round';
      ctx.beginPath(); ctx.moveTo(18*S,-15*S); ctx.quadraticCurveTo(2*S,-18*S,-14*S,-11*S); ctx.stroke();
      ctx.restore();

      ctx.restore();
    }
  }

  // ══════════════════════════════════════════════
  //   WATER ENVIRONMENT
  // ══════════════════════════════════════════════

  // Deep gradient background
  function drawBg(t) {
    const hue = 198 + sin(t*0.00009)*5;
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,   `hsl(${hue-4},70%,30%)`);   // sunlit surface water
    g.addColorStop(0.34,`hsl(${hue},68%,19%)`);
    g.addColorStop(0.68,`hsl(${hue+6},72%,10%)`);
    g.addColorStop(1,   `hsl(${hue+12},78%,4.5%)`);  // deeper below
    ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    // sun glow filtering from the surface
    const sun = ctx.createRadialGradient(W*0.5,-H*0.12,12, W*0.5,-H*0.12,H*0.95);
    sun.addColorStop(0,'rgba(180,240,255,0.26)');
    sun.addColorStop(0.5,'rgba(150,225,255,0.07)');
    sun.addColorStop(1,'rgba(150,225,255,0)');
    ctx.fillStyle=sun; ctx.fillRect(0,0,W,H);
  }

  // Caustic light patterns
  class Caustic {
    constructor(){
      this.x=random()*W; this.y=H*0.5+random()*H*0.55;
      this.r=random()*40+18; this.ph=random()*TAU;
      this.sp=random()*0.0008+0.0004; this.drift=( random()-0.5)*0.08;
    }
    draw(t){
      const pulse = sin(t*this.sp+this.ph)*0.5+0.5;
      const pulse2= sin(t*this.sp*1.7+this.ph+1.2)*0.5+0.5;
      const alpha = pulse*0.028 + 0.008;
      this.x += this.drift;
      if(this.x<-80)this.x=W+80; if(this.x>W+80)this.x=-80;
      // Outer ring
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r*(0.85+pulse*0.3),0,TAU);
      ctx.strokeStyle=`rgba(80,200,255,${alpha*1.5})`; ctx.lineWidth=1.8; ctx.stroke();
      // Inner glow
      ctx.beginPath(); ctx.arc(this.x,this.y,this.r*(0.4+pulse2*0.25),0,TAU);
      ctx.strokeStyle=`rgba(120,220,255,${alpha*1.2})`; ctx.lineWidth=1; ctx.stroke();
    }
  }
  const caustics = Array.from({length:28},()=>new Caustic());

  // Animated caustic light — rippling bright bands + dappled sunlight on the water
  function drawCausticBands(t){
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    const rows=7;
    for(let r=0;r<rows;r++){
      const yBase = H*0.26 + r*(H*0.64/rows);
      const a = 0.018 + 0.014*sin(t*0.0011 + r*1.3);
      ctx.beginPath();
      for(let x=0;x<=W;x+=16){
        const y = yBase
          + sin(x*0.012 + t*0.0009 + r*0.7)*14
          + sin(x*0.031 - t*0.0013 + r)*7;
        x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      }
      ctx.strokeStyle=`rgba(120,215,255,${max(a,0)})`;
      ctx.lineWidth = 2.2 + sin(t*0.0007+r)*1.2;
      ctx.stroke();
    }
    const blobs=10;
    for(let i=0;i<blobs;i++){
      const bx = W*(i+0.5)/blobs + sin(t*0.0004+i*1.3)*60;
      const by = H*0.30 + sin(t*0.0006+i)*H*0.28 + H*0.18;
      const rr = 40 + sin(t*0.001+i)*18;
      const a  = max(0, 0.028 + 0.02*sin(t*0.0012+i*0.9));
      const g  = ctx.createRadialGradient(bx,by,0,bx,by,rr);
      g.addColorStop(0,`rgba(150,225,255,${a})`);
      g.addColorStop(1,'rgba(150,225,255,0)');
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(bx,by,rr,0,TAU); ctx.fill();
    }
    ctx.restore();
  }

  // Improved light rays
  class Ray {
    constructor(){ this.r(); }
    r(){
      this.x=random()*W; this.w=random()*60+20;
      this.ba=random()*0.018+0.004; this.dr=(random()-0.5)*0.25;
      this.ph=random()*TAU; this.tilt=(random()-0.5)*0.15;
    }
    u(){ this.x+=this.dr; if(this.x<-120||this.x>W+120)this.r(); }
    d(t){
      const a=this.ba*(sin(t*0.0006+this.ph)*0.5+0.65);
      ctx.save(); ctx.translate(this.x,0); ctx.rotate(this.tilt);
      const g=ctx.createLinearGradient(0,0,0,H);
      g.addColorStop(0,`rgba(140,220,255,${a*4.6})`);
      g.addColorStop(0.2,`rgba(90,185,245,${a*2.4})`);
      g.addColorStop(0.6,`rgba(45,140,215,${a*0.7})`);
      g.addColorStop(1,'rgba(0,40,80,0)');
      ctx.beginPath();
      ctx.moveTo(-this.w/2,0); ctx.lineTo(this.w/2,0);
      ctx.lineTo(this.w*0.15,H); ctx.lineTo(-this.w*0.15,H);
      ctx.closePath(); ctx.fillStyle=g; ctx.fill();
      ctx.restore();
    }
  }
  const rays = Array.from({length:15},()=>new Ray());

  // Water surface shimmer at top
  function drawSurface(t){
    const g=ctx.createLinearGradient(0,0,0,80);
    g.addColorStop(0,'rgba(30,160,220,0.18)');
    g.addColorStop(1,'rgba(0,80,140,0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,W,80);
    // Ripple lines
    for(let i=0;i<5;i++){
      const y=6+i*3.5+sin(t*0.002+i*1.1)*2.5;
      ctx.beginPath();
      for(let x=0;x<=W;x+=12){
        const wy=y+sin(t*0.0015+x*0.018+i*0.8)*1.8;
        x===0?ctx.moveTo(x,wy):ctx.lineTo(x,wy);
      }
      ctx.strokeStyle=`rgba(140,220,255,${0.10-i*0.015})`;
      ctx.lineWidth=0.8; ctx.stroke();
    }
  }

  // Depth fog layers
  function drawDepthFog(){
    const g=ctx.createLinearGradient(0,H*0.3,0,H);
    g.addColorStop(0,'rgba(0,20,50,0)');
    g.addColorStop(1,'rgba(0,10,30,0.45)');
    ctx.fillStyle=g; ctx.fillRect(0,H*0.3,W,H*0.7);
  }

  // Bubbles
  class Bub {
    constructor(){ this.r(); }
    r(){
      this.x=random()*W; this.y=H+random()*80;
      this.rad=random()*2.8+0.5; this.sp=random()*0.5+0.1;
      this.wS=random()*0.008+0.003; this.ph=random()*TAU; this.a=random()*0.22+0.05;
    }
    u(t){ this.y-=this.sp; this.x+=sin(t*this.wS+this.ph)*0.3; if(this.y<-15)this.r(); }
    d(){
      ctx.beginPath(); ctx.arc(this.x,this.y,this.rad,0,TAU);
      ctx.strokeStyle=`rgba(140,215,255,${this.a})`; ctx.lineWidth=0.6; ctx.stroke();
      ctx.fillStyle=`rgba(100,190,255,${this.a*0.2})`; ctx.fill();
      ctx.beginPath(); ctx.arc(this.x-this.rad*0.3,this.y-this.rad*0.35,this.rad*0.22,0,TAU);
      ctx.fillStyle=`rgba(220,248,255,${this.a*1.3})`; ctx.fill();
    }
  }
  const bubs = Array.from({length:34},()=>new Bub());

  // Marine snow — slow drifting particles
  class Snow {
    constructor(){
      this.x=random()*W; this.y=random()*H;
      this.sz=random()*0.9+0.2; this.vy=random()*0.18+0.06;
      this.vx=(random()-0.5)*0.06; this.a=random()*0.12+0.03; this.ph=random()*TAU;
    }
    u(t){
      this.x+=this.vx+sin(t*0.0004+this.ph)*0.05;
      this.y+=this.vy;
      if(this.y>H+8)this.y=-8; if(this.x<-4)this.x=W+4; if(this.x>W+4)this.x=-4;
    }
    d(){
      ctx.beginPath(); ctx.arc(this.x,this.y,this.sz,0,TAU);
      ctx.fillStyle=`rgba(190,225,250,${this.a})`; ctx.fill();
    }
  }
  const snow = Array.from({length:60},()=>new Snow());

  // Plankton
  class Pk {
    constructor(){
      this.x=random()*W; this.y=random()*H;
      this.sz=random()*1+0.3; this.vx=(random()-0.5)*0.09;
      this.vy=(random()-0.5)*0.06; this.a=random()*0.14+0.03; this.ph=random()*TAU;
    }
    u(t){
      this.x+=this.vx+sin(t*0.0005+this.ph)*0.04;
      this.y+=this.vy+cos(t*0.0006+this.ph)*0.03;
      if(this.x<-6)this.x=W+6; if(this.x>W+6)this.x=-6;
      if(this.y<-6)this.y=H+6; if(this.y>H+6)this.y=-6;
    }
    d(){ ctx.beginPath(); ctx.arc(this.x,this.y,this.sz,0,TAU); ctx.fillStyle=`rgba(150,210,240,${this.a})`; ctx.fill(); }
  }
  const pks = Array.from({length:40},()=>new Pk());

  // Seaweed
  class Sw {
    constructor(){
      this.x=random()*W; this.seg=5+floor(random()*4);
      this.h=random()*110+55; this.ph=random()*TAU;
      this.ss=random()*0.004+0.003; this.hu=random()*22+115;
      this.w=random()*2.3+1.2; this.a=random()*0.20+0.10;
    }
    d(t){
      const sH=this.h/this.seg;
      ctx.beginPath(); ctx.moveTo(this.x,H);
      let cx=this.x, cy=H;
      for(let i=0;i<this.seg;i++){
        const sw=sin(t*this.ss+this.ph+i*0.5)*(6+i*2.4);
        cy-=sH; cx=this.x+sw; ctx.lineTo(cx,cy);
      }
      ctx.strokeStyle=`hsla(${this.hu},40%,18%,${this.a})`;
      ctx.lineWidth=this.w; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();
    }
  }
  const sws = Array.from({length:16},()=>new Sw());

  // ── Reef backdrop: coral & rock silhouettes ──────────────
  const reefShapes = [
    {fx:0.06,type:'mound',s:1.15,hue:192},
    {fx:0.19,type:'branch',s:0.95,hue:202},
    {fx:0.33,type:'mound',s:0.8,hue:186},
    {fx:0.47,type:'brain',s:1.0,hue:196},
    {fx:0.60,type:'branch',s:1.1,hue:205},
    {fx:0.84,type:'mound',s:1.25,hue:188},
    {fx:0.94,type:'brain',s:0.82,hue:198},
  ];
  function drawReef(t){
    reefShapes.forEach(sp=>{
      const x=sp.fx*W, baseY=H+6, sc=sp.s*(0.7+H/1000);
      ctx.save(); ctx.translate(x,baseY); ctx.scale(sc,sc);
      const g=ctx.createLinearGradient(0,-90,0,0);
      g.addColorStop(0,`hsla(${sp.hue},46%,19%,0.92)`);
      g.addColorStop(1,`hsla(${sp.hue},52%,6%,0.96)`);
      ctx.fillStyle=g;
      if(sp.type==='mound'){
        ctx.beginPath(); ctx.moveTo(-72,0);
        ctx.bezierCurveTo(-60,-56,-22,-72,0,-67);
        ctx.bezierCurveTo(32,-73,62,-50,72,0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle=`hsla(${sp.hue},55%,44%,0.22)`; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(-56,-30); ctx.bezierCurveTo(-30,-66,30,-66,56,-28); ctx.stroke();
      } else if(sp.type==='brain'){
        ctx.beginPath(); ctx.ellipse(0,-26,56,33,0,PI,TAU); ctx.lineTo(56,0); ctx.lineTo(-56,0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle=`hsla(${sp.hue},46%,40%,0.18)`; ctx.lineWidth=1.5;
        for(let i=-3;i<=3;i++){ ctx.beginPath(); ctx.moveTo(i*15,-6); ctx.quadraticCurveTo(i*15+6,-32,i*15,-50); ctx.stroke(); }
      } else {
        const branch=(x0,y0,ang,len,d)=>{ if(d<=0)return; const x1=x0+cos(ang)*len,y1=y0+sin(ang)*len;
          ctx.strokeStyle=`hsla(${sp.hue},50%,17%,0.95)`; ctx.lineCap='round';
          ctx.lineWidth=3+d*2.4; ctx.beginPath(); ctx.moveTo(x0,y0); ctx.lineTo(x1,y1); ctx.stroke();
          branch(x1,y1,ang-0.5,len*0.72,d-1); branch(x1,y1,ang+0.42,len*0.7,d-1); };
        branch(0,0,-PI/2,36,3); branch(-26,0,-PI/2-0.2,28,2); branch(26,0,-PI/2+0.2,30,2);
      }
      ctx.restore();
    });
  }

  // ── Sea anemone — the clownfish's home ───────────────────
  const anemone = {
    fx:0.70, tentacles:[],
    init(){
      const N=56; this.tentacles=[];
      for(let i=0;i<N;i++){
        const a=-PI/2 + (i/(N-1)-0.5)*2.3;
        this.tentacles.push({ a, len:0.78+random()*0.5, ph:random()*TAU,
          sp:0.0015+random()*0.0013, w:2.2+random()*2.4, tipHue:296+random()*46, back:i%2===0 });
      }
    },
    draw(t, layer){
      const x=this.fx*W, baseY=H-4, R=70*(0.7+H/1000);
      ctx.save(); ctx.translate(x,baseY);
      if(layer!=='front'){
        const bg=ctx.createRadialGradient(0,-6,4,0,-2,48);
        bg.addColorStop(0,'#cf9078'); bg.addColorStop(1,'#57383e');
        ctx.fillStyle=bg; ctx.beginPath(); ctx.ellipse(0,0,46,27,0,PI,TAU); ctx.lineTo(46,8); ctx.lineTo(-46,8); ctx.closePath(); ctx.fill();
      }
      this.tentacles.forEach(te=>{
        if(layer==='back' && !te.back) return;
        if(layer==='front' && te.back) return;
        const len=R*te.len;
        const sway=sin(t*te.sp+te.ph)*(0.26+0.14*sin(t*0.0007+te.ph));
        const ax=cos(te.a), ay=sin(te.a), px=-ay, py=ax;
        const tipx=ax*len + px*sway*len*0.5;
        const tipy=ay*len + py*sway*len*0.5 - 8;
        const midx=ax*len*0.5 + px*sway*len*0.32;
        const midy=ay*len*0.5 + py*sway*len*0.32 - 6;
        ctx.strokeStyle= te.back?'rgba(128,104,126,0.5)':'rgba(178,148,168,0.8)';
        ctx.lineWidth=te.w; ctx.lineCap='round';
        ctx.beginPath(); ctx.moveTo(0,-4); ctx.quadraticCurveTo(midx,midy,tipx,tipy); ctx.stroke();
        const tg=ctx.createRadialGradient(tipx,tipy,0,tipx,tipy,te.w*2.3);
        tg.addColorStop(0,`hsla(${te.tipHue},72%,74%,0.95)`);
        tg.addColorStop(1,`hsla(${te.tipHue},72%,60%,0)`);
        ctx.fillStyle=tg; ctx.beginPath(); ctx.arc(tipx,tipy,te.w*2.3,0,TAU); ctx.fill();
      });
      ctx.restore();
    }
  };
  anemone.init();

  // ── Companion reef fish (background school) ──────────────
  class Buddy {
    constructor(){
      this.x=random()*W; this.y=H*0.28+random()*H*0.45;
      this.vx=(random()-0.5)*1.4; this.vy=(random()-0.5)*0.6;
      this.sz=6+random()*5; this.ph=random()*TAU;
      const pal=[[204,68],[188,60],[46,78]]; const c=pal[floor(random()*pal.length)];
      this.hue=c[0]; this.sat=c[1]; this.a=0.5+random()*0.3;
    }
    update(dt){
      const step=max(0.5,min(2,dt/16.67)), now=performance.now();
      this.vx += sin(now*0.0004+this.ph)*0.03*step;
      this.vy += cos(now*0.0005+this.ph)*0.02*step;
      if(this.x<40)this.vx+=0.05; if(this.x>W-40)this.vx-=0.05;
      if(this.y<H*0.18)this.vy+=0.04; if(this.y>H*0.80)this.vy-=0.04;
      const dx=this.x-fish.x, dy=this.y-fish.y, d=sqrt(dx*dx+dy*dy)||1;
      if(d<95){ this.vx+=dx/d*0.16*step; this.vy+=dy/d*0.16*step; }
      const sp=sqrt(this.vx*this.vx+this.vy*this.vy), ms=2.3;
      if(sp>ms){ this.vx*=ms/sp; this.vy*=ms/sp; }
      if(sp<0.6){ this.vx*=1.12; this.vy*=1.12; }
      this.x+=this.vx*step; this.y+=this.vy*step;
      if(this.x<-24)this.x=W+24; if(this.x>W+24)this.x=-24;
    }
    draw(t){
      const dir=this.vx<0?-1:1, s=this.sz;
      ctx.save(); ctx.translate(this.x,this.y); ctx.scale(dir,1); ctx.globalAlpha=this.a;
      ctx.fillStyle=`hsl(${this.hue},${this.sat}%,54%)`;
      ctx.beginPath(); ctx.moveTo(-s*0.9,0); ctx.lineTo(-s*1.7,-s*0.7); ctx.lineTo(-s*1.7,s*0.7); ctx.closePath(); ctx.fill();
      const bgr=ctx.createLinearGradient(0,-s*0.7,0,s*0.7);
      bgr.addColorStop(0,`hsl(${this.hue},${this.sat}%,63%)`); bgr.addColorStop(1,`hsl(${this.hue},${this.sat}%,41%)`);
      ctx.fillStyle=bgr; ctx.beginPath(); ctx.ellipse(0,0,s,s*0.62,0,0,TAU); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.fillRect(-s*0.12,-s*0.55,s*0.22,s*1.1);
      ctx.fillStyle='#08202c'; ctx.beginPath(); ctx.arc(s*0.5,-s*0.08,s*0.14,0,TAU); ctx.fill();
      ctx.restore(); ctx.globalAlpha=1;
    }
  }
  const buddies=Array.from({length:8},()=>new Buddy());

  // Falling food
  const foods = [];
  let onFoodCaught = null;

  class Food {
    constructor(type, ambient, px, py) {
      this.type = type;
      this.ambient = !!ambient;
      this.x = (px!=null) ? px : W * (0.18 + random() * 0.64);
      this.y = (py!=null) ? py : -18;
      this.vy = 0.9 + random() * 0.45;
      this.vx = (random() - 0.5) * 0.22;
      this.spin = random() * TAU;
      this.spinSpeed = (random() - 0.5) * 0.05;
      this.phase = random() * TAU;
      this.r = 7;
    }
    update(t, dt) {
      const step = dt / 16.67;
      this.y += this.vy * step;
      this.x += (this.vx + sin(t * 0.002 + this.phase) * 0.18) * step;
      this.spin += this.spinSpeed * step;
      return this.y < H + 36;
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      const r = this.r;
      const pulse = 0.82 + 0.18 * sin(performance.now() * 0.005 + this.phase);
      // gold glow halo
      const glow = ctx.createRadialGradient(0,0,0,0,0,r*2.8*pulse);
      glow.addColorStop(0,'rgba(255,214,96,0.55)');
      glow.addColorStop(0.4,'rgba(255,190,60,0.24)');
      glow.addColorStop(1,'rgba(255,180,40,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(0,0,r*2.8*pulse,0,TAU); ctx.fill();
      // gold sphere
      const g = ctx.createRadialGradient(-r*0.35,-r*0.35,0,0,0,r);
      g.addColorStop(0,'#fff4c6');
      g.addColorStop(0.4,'#ffd45e');
      g.addColorStop(0.75,'#f0a92e');
      g.addColorStop(1,'#c9791a');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.fill();
      // rim + specular highlight
      ctx.strokeStyle='rgba(255,240,180,0.5)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(0,0,r,0,TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(-r*0.32,-r*0.34,r*0.30,0,TAU);
      ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fill();
      ctx.restore();
    }
  }

  function dropFood(type) {
    foods.push(new Food(type, false));
    if(foods.length > 20) foods.splice(0, foods.length-20);
  }

  function dropFoodAt(x, y){
    foods.push(new Food('pellets', false, x, y));
    if(foods.length > 20) foods.splice(0, foods.length-20);
  }

  function updateFoods(time, dt) {
    let nearest = 1e9;
    for (let i=foods.length-1; i>=0; i--) {
      const food = foods[i];
      const alive = food.update(time, dt);
      const dx = food.x - fish.x;
      const dy = food.y - fish.y;
      const d = sqrt(dx*dx + dy*dy);
      if (d < nearest) nearest = d;
      if (d < 34) {
        foods.splice(i, 1);
        fish.chomp = 1;                       // bite!
        if (onFoodCaught && !food.ambient) onFoodCaught(food.type);
      } else if (!alive) {
        foods.splice(i, 1);
      }
    }
    // open mouth in anticipation as the fish closes in on food
    const want = nearest < 90 ? (1 - nearest/90) : 0;
    fish.mouthAnticip = lerp(fish.mouthAnticip, want, 0.2);
  }

  // occasional single piece of food drifting down while playing
  let foodDrip = 3500;
  function updateFoodRain(dt){
    if(!playing) return;
    foodDrip -= dt;
    if(foodDrip <= 0){
      foods.push(new Food('pellets', true));
      foodDrip = 4500 + random()*4500;
    }
    if(foods.length > 20) foods.splice(0, foods.length-20);
  }

  function drawFoods() {
    foods.forEach(food => food.draw());
  }

  // Cursor glow
  function drawCursor(){
    if(!playing) return;
    const g=ctx.createRadialGradient(mouse.x,mouse.y,0,mouse.x,mouse.y,32);
    g.addColorStop(0,'rgba(255,130,55,0.12)'); g.addColorStop(0.5,'rgba(180,140,30,0.04)');
    g.addColorStop(1,'rgba(120,80,10,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(mouse.x,mouse.y,32,0,TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mouse.x,mouse.y,2.5,0,TAU);
    ctx.fillStyle='rgba(255,220,120,0.5)'; ctx.fill();
  }

  // Vignette
  function drawVignette(){
    const v=ctx.createRadialGradient(W/2,H/2,W*0.22,W/2,H/2,W*0.9);
    v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,0.55)');
    ctx.fillStyle=v; ctx.fillRect(0,0,W,H);
  }

  // ══════════════════════════════════════════════
  //   MAIN LOOP
  // ══════════════════════════════════════════════
  let lastTime = 0;

  function frame(time) {
    let dt = time - lastTime || 16;
    lastTime = time;
    if (dt > 50) dt = 50;   // guard: after a tab switch, don't let the fish teleport

    drawBg(time);
    ctx.save(); ctx.globalCompositeOperation='lighter';
    rays.forEach(r=>{ r.u(); r.d(time); });
    ctx.restore();
    drawSurface(time);
    caustics.forEach(c=>c.draw(time));
    drawCausticBands(time);
    drawReef(time);
    sws.forEach(s=>s.d(time));
    snow.forEach(s=>{ s.u(time); s.d(); });
    pks.forEach(p=>{ p.u(time); p.d(); });
    bubs.forEach(b=>{ b.u(time); b.d(); });

    updateFoodRain(dt);
    updateFoods(time, dt);
    updateFish(dt);

    // Spawn trail
    trailT += dt;
    if(trailT > 18 && fish.speed > 0.32 && playing){
      trailT = 0;
      const tx = fish.x - cos(fish.angle)*26*S;
      const ty = fish.y - sin(fish.angle)*26*S;
      trail.push(new TrailParticle(tx,ty,fish.angle,fish.speed,'ribbon'));
      const sparkleCount = floor(min(fish.speed * 0.55, 3)) + 1;
      for(let i=0;i<sparkleCount;i++) trail.push(new TrailParticle(tx,ty,fish.angle,fish.speed,'glow'));
      if(random() < min(0.2 + fish.speed * 0.045, 0.72)) {
        trail.push(new TrailParticle(tx,ty,fish.angle,fish.speed,'bubble'));
      }
    }
    trail.forEach(p=>{ p.update(); p.draw(); });
    trail = trail.filter(p=>p.life>0).slice(-180);

    drawDepthFog();
    buddies.forEach(b=>{ b.update(dt); b.draw(time); });
    anemone.draw(time, 'back');
    // soft contact shadow on the seabed, tracking the fish
    { const shY=H-14, t01=clamp((shY-fish.y)/(H*0.85),0,1);
      ctx.save(); ctx.globalAlpha=0.30*(1-t01)+0.05;
      const sw=40+t01*62, sh=8+t01*7;
      const sg=ctx.createRadialGradient(fish.x,shY,2,fish.x,shY,sw);
      sg.addColorStop(0,'rgba(0,10,16,0.9)'); sg.addColorStop(1,'rgba(0,10,16,0)');
      ctx.fillStyle=sg; ctx.beginPath(); ctx.ellipse(fish.x,shY,sw,sh,0,0,TAU); ctx.fill(); ctx.restore(); }
    drawFoods();
    drawFish(time);
    anemone.draw(time, 'front');
    drawCursor();
    drawVignette();

    requestAnimationFrame(frame);
  }
  // when returning to the tab, resync the clock so the first frame isn't a huge jump
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) lastTime = performance.now(); });

  initFish();
  requestAnimationFrame(frame);

  return {
    startPlaying(){ playing=true; },
    stopPlaying(){ playing=false; trail=[]; },
    isPlaying(){ return playing; },
    setCareState(){ care.happiness = 100; },
    dropFood,
    dropFoodAt,
    setFoodCatchHandler(handler){ onFoodCaught = handler; },
  };
})();

/* ═══════════════════════════════════════════════
   Deep Ocean — App Controller
   Landing screen, auth, play-time tracking
   ═══════════════════════════════════════════════ */

(() => {
  'use strict';

  // ── DOM ───────────────────────────────────────
  const landingScreen = document.getElementById('landing-screen');
  const btnPlay       = document.getElementById('btn-play');
  const btnGoogle     = document.getElementById('btn-google');
  const btnBack       = document.getElementById('btn-back');
  const btnFeed       = document.getElementById('btn-feed');
  const foodMenu      = document.getElementById('food-menu');
  const statsBar      = document.getElementById('stats-bar');
  const userAvatar    = document.getElementById('user-avatar');
  const userName      = document.getElementById('user-name');
  const playTimeEl    = document.getElementById('play-time');
  const authNote      = document.getElementById('auth-note');
  const fishNameInput = document.getElementById('fish-name-input');
  const homePlayTime  = document.getElementById('home-play-time');
  const homeMinutesLabel = document.getElementById('home-minutes-label');
  const homeHappiness = document.getElementById('home-happiness');
  const homeNextFeed  = document.getElementById('home-next-feed');
  const homeStatus    = document.getElementById('home-status');
  const homeHappinessFill = document.getElementById('home-happiness-fill');
  const hudHappinessText  = document.getElementById('hud-happiness-text');
  const hudHappinessFill  = document.getElementById('hud-happiness-fill');

  // ── State ─────────────────────────────────────
  let currentUser = null;         // Firebase user object (or null)
  let sessionStartTime = null;    // When current play session started
  let syncInterval = null;        // Firestore sync interval
  let displayInterval = null;
  let appInterval = null;
  let saveTimer = null;
  let fedMessageUntil = 0;
  let fedMessage = '';

  const FEED_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const localProfileKey = 'deep-ocean:guest-profile';
  const firebaseConfigKey = 'deep-ocean:firebase-config';
  const defaultProfile = () => ({
    fishName:'Goldie',
    totalPlayMs:0,
    lastFedAt:Date.now(),
  });
  let profile = defaultProfile();

  // ── Firebase refs (set up if enabled) ─────────
  let firebaseApp = null;
  let auth = null;
  let db = null;
  let googleProvider = null;

  function hasFirebaseConfig() {
    return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.authDomain);
  }

  /* ═══════════════════════════════════════════════
     FIREBASE INIT (only if config is provided)
     ═══════════════════════════════════════════════ */
  async function initFirebase() {
    if (firebaseApp && window._fb) return true;

    if (!hasFirebaseConfig()) {
      console.log('[DeepOcean] Firebase not configured — running in offline mode.');
      setOfflineAuthUI();
      return false;
    }

    try {
      // Dynamically import Firebase from CDN
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
      const { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } =
        await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      const { getFirestore, doc, getDoc, setDoc, updateDoc } =
        await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

      firebaseApp = initializeApp(FIREBASE_CONFIG);
      auth = getAuth(firebaseApp);
      db = getFirestore(firebaseApp);
      googleProvider = new GoogleAuthProvider();

      // Store Firestore helpers on window for use elsewhere
      window._fb = { signInWithPopup, googleProvider, auth, db, doc, getDoc, setDoc, updateDoc };

      // Listen for auth state
      onAuthStateChanged(auth, async (user) => {
        if (user) {
          currentUser = user;
          await loadProfile();
          showUserUI();
          updateAllDisplays();
        } else {
          currentUser = null;
          loadLocalProfile();
          updateAllDisplays();
        }
      });

      console.log('[DeepOcean] Firebase initialized.');
      btnGoogle.disabled = false;
      btnGoogle.title = 'Sign in with Google';
      authNote.textContent = 'Sign in to save minutes, name, and feeding state in the cloud';
      return true;
    } catch (err) {
      console.warn('[DeepOcean] Firebase init failed:', err);
      setOfflineAuthUI();
      return false;
    }
  }

  function setOfflineAuthUI() {
    btnGoogle.disabled = false;
    btnGoogle.title = 'Add Firebase config to enable Google sign-in';
    authNote.textContent = 'Click Google sign-in and paste Firebase config once to enable cloud sync';
    loadLocalProfile();
    updateAllDisplays();
  }

  /* ═══════════════════════════════════════════════
     AUTH
     ═══════════════════════════════════════════════ */
  async function signInWithGoogle() {
    if (!window._fb) {
      const configured = promptForFirebaseConfig();
      if (!configured) return;
      const ready = await initFirebase();
      if (!ready) return;
    }
    try {
      const { signInWithPopup, googleProvider, auth } = window._fb;
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged loads cloud profile and refreshes the home page.
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Sign-in error:', err);
        alert(`Google sign-in failed: ${err.message || err.code || 'Unknown error'}\n\nMake sure Google sign-in is enabled in Firebase Authentication and this page domain is allowed in Firebase Auth settings.`);
      }
    }
  }

  function promptForFirebaseConfig() {
    const pasted = prompt(
      'Paste your Firebase web app config JSON here.\n\nExample: {"apiKey":"...","authDomain":"your-app.firebaseapp.com","projectId":"...","appId":"..."}'
    );
    if (!pasted) return false;

    try {
      const parsed = JSON.parse(pasted);
      if (!parsed.apiKey || !parsed.authDomain || !parsed.projectId) {
        alert('Firebase config needs at least apiKey, authDomain, and projectId.');
        return false;
      }
      Object.assign(FIREBASE_CONFIG, parsed);
      localStorage.setItem(firebaseConfigKey, JSON.stringify(parsed));
      return true;
    } catch {
      alert('That was not valid JSON. Paste the Firebase config object with double-quoted keys.');
      return false;
    }
  }

  /* ═══════════════════════════════════════════════
     PROFILE, PLAY TIME, AND CARE
     ═══════════════════════════════════════════════ */
  function sanitizeFishName(value) {
    const clean = String(value || '').trim().slice(0, 18);
    return clean || 'Goldie';
  }

  function normalizeProfile(data = {}) {
    const next = defaultProfile();
    next.fishName = sanitizeFishName(data.fishName || next.fishName);
    next.totalPlayMs = Number.isFinite(Number(data.totalPlayMs)) ? Math.max(0, Number(data.totalPlayMs)) : 0;
    next.lastFedAt = Number.isFinite(Number(data.lastFedAt)) ? Number(data.lastFedAt) : Date.now();
    return next;
  }

  function loadLocalProfile() {
    try {
      profile = normalizeProfile(JSON.parse(localStorage.getItem(localProfileKey) || '{}'));
    } catch {
      profile = defaultProfile();
    }
    fishNameInput.value = profile.fishName;
  }

  async function loadProfile() {
    if (!currentUser || !window._fb) return;
    try {
      const { db, doc, getDoc } = window._fb;
      const snap = await getDoc(doc(db, 'users', currentUser.uid));
      if (snap.exists()) {
        profile = normalizeProfile(snap.data());
      } else {
        loadLocalProfile();
        await saveProfile();
      }
      fishNameInput.value = profile.fishName;
    } catch (err) {
      console.warn('Failed to load cloud profile:', err);
      loadLocalProfile();
    }
  }

  function currentTotalPlayMs() {
    return sessionStartTime
      ? profile.totalPlayMs + (Date.now() - sessionStartTime)
      : profile.totalPlayMs;
  }

  function happinessPercent(now = Date.now()) {
    const elapsed = Math.max(0, now - profile.lastFedAt);
    return Math.max(0, Math.min(100, Math.round(100 - (elapsed / FEED_INTERVAL_MS) * 100)));
  }

  function feedTimeLeftText(now = Date.now()) {
    const happiness = happinessPercent(now);
    if (happiness <= 0) return 'Hungry';
    if (happiness >= 100) return 'Full';
    const msLeft = Math.max(0, FEED_INTERVAL_MS - (now - profile.lastFedAt));
    const hours = Math.floor(msLeft / 3600000);
    const mins = Math.ceil((msLeft % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  }

  async function saveProfile() {
    const payload = {
      fishName:profile.fishName,
      totalPlayMs:Math.floor(currentTotalPlayMs()),
      lastFedAt:profile.lastFedAt,
      happiness:happinessPercent(),
      lastPlayed:Date.now(),
    };

    if (!currentUser || !window._fb) {
      localStorage.setItem(localProfileKey, JSON.stringify(payload));
      return;
    }
    try {
      const { db, doc, setDoc } = window._fb;
      await setDoc(doc(db, 'users', currentUser.uid), {
        displayName: currentUser.displayName || '',
        email: currentUser.email || '',
        photoURL: currentUser.photoURL || '',
        ...payload,
      }, { merge: true });
    } catch (err) {
      console.warn('Failed to save profile:', err);
    }
  }

  function queueSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveProfile, 500);
  }

  function foodLabel(foodType = 'flakes') {
    return foodType === 'pellets' ? 'Pellets' : 'Flakes';
  }

  function requestFoodDrop(foodType = 'flakes') {
    const label = foodLabel(foodType);
    fedMessage = `${label} are falling. Guide ${profile.fishName} with the cursor to catch them.`;
    fedMessageUntil = Date.now() + 6500;
    foodMenu.classList.add('hidden');
    Game.dropFood(foodType);
    updateAllDisplays();
  }

  function feedFish(foodType = 'flakes') {
    const label = foodLabel(foodType);
    profile.lastFedAt = Date.now();
    fedMessage = `${profile.fishName} caught ${label}. Happiness is full.`;
    fedMessageUntil = Date.now() + 3500;
    foodMenu.classList.add('hidden');
    updateAllDisplays();
    saveProfile();
  }

  function startTrackingTime() {
    if (sessionStartTime) return;
    sessionStartTime = Date.now();
    // Sync every 30 seconds
    syncInterval = setInterval(() => {
      if (sessionStartTime) {
        const elapsed = Date.now() - sessionStartTime;
        profile.totalPlayMs += elapsed;
        sessionStartTime = Date.now();
        updateAllDisplays();
        saveProfile();
      }
    }, 30000);
  }

  function stopTrackingTime() {
    if (sessionStartTime) {
      profile.totalPlayMs += Date.now() - sessionStartTime;
      sessionStartTime = null;
      updateAllDisplays();
      saveProfile();
    }
    if (syncInterval) {
      clearInterval(syncInterval);
      syncInterval = null;
    }
  }

  function updatePlayTimeDisplay() {
    const totalMs = currentTotalPlayMs();
    const totalMin = Math.floor(totalMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const label = h > 0 ? `${h}h ${m}m` : `${m}m`;
    playTimeEl.textContent = label;
    homePlayTime.textContent = label;
    homeMinutesLabel.textContent = currentUser ? 'Cloud minutes' : 'Local minutes';
  }

  function updateHappinessDisplay() {
    const happiness = happinessPercent();
    const width = `${happiness}%`;
    homeHappiness.textContent = width;
    hudHappinessText.textContent = width;
    homeHappinessFill.style.width = width;
    hudHappinessFill.style.width = width;
    homeNextFeed.textContent = feedTimeLeftText();
    homeStatus.textContent = Date.now() < fedMessageUntil ? fedMessage : happiness <= 0
      ? `${profile.fishName} is hungry and resting in the corner. Feed to play again.`
      : `Feed ${profile.fishName} every 6 hours to keep swimming.`;
    Game.setCareState({ happiness });
  }

  function updateAllDisplays() {
    updatePlayTimeDisplay();
    updateHappinessDisplay();
    showUserUI();
  }

  /* ═══════════════════════════════════════════════
     UI
     ═══════════════════════════════════════════════ */
  function showUserUI() {
    userAvatar.src = currentUser?.photoURL || createGuestAvatar();
    userName.textContent = profile.fishName;
    authNote.textContent = currentUser
      ? `Signed in as ${currentUser.email || currentUser.displayName || 'Google user'} · cloud sync on`
      : (!hasFirebaseConfig()
        ? 'Click Google sign-in and paste Firebase config once to enable cloud sync'
        : 'Sign in to save minutes, name, and feeding state in the cloud');
  }

  function hideUserUI() {
    statsBar.classList.add('hidden');
  }

  function createGuestAvatar() {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <defs>
          <radialGradient id="g" cx="35%" cy="30%" r="70%">
            <stop offset="0" stop-color="#fff0a8"/>
            <stop offset="0.5" stop-color="#f4b935"/>
            <stop offset="1" stop-color="#0b2548"/>
          </radialGradient>
        </defs>
        <rect width="64" height="64" rx="32" fill="#031326"/>
        <circle cx="32" cy="32" r="25" fill="url(#g)" opacity="0.96"/>
        <path d="M18 33c9-12 21-12 30 0-9 12-21 12-30 0Z" fill="#ffe07a"/>
        <circle cx="42" cy="30" r="2.8" fill="#281400"/>
        <path d="M19 33 9 24v18Z" fill="#d99a25"/>
      </svg>
    `);
  }

  /* ═══════════════════════════════════════════════
     SCREEN FLOW
     ═══════════════════════════════════════════════ */
  function startPlay() {
    landingScreen.classList.add('hidden');
    btnBack.classList.remove('hidden');
    document.body.classList.add('playing');
    updateAllDisplays();
    startTrackingTime();

    // Update display ticker
    if (!displayInterval) displayInterval = setInterval(updateAllDisplays, 1000);

    // Tell the game to start
    Game.startPlaying();
  }

  function stopPlay() {
    Game.stopPlaying();
    document.body.classList.remove('playing');
    landingScreen.classList.remove('hidden');
    btnBack.classList.add('hidden');
    btnFeed.classList.add('hidden');
    foodMenu.classList.add('hidden');
    statsBar.classList.add('hidden');

    stopTrackingTime();
    if (displayInterval) {
      clearInterval(displayInterval);
      displayInterval = null;
    }
  }

  /* ═══════════════════════════════════════════════
     EVENT LISTENERS
     ═══════════════════════════════════════════════ */
  btnPlay.addEventListener('click', () => {
    startPlay();
  });

  btnGoogle.addEventListener('click', () => {
    if (btnGoogle.disabled) return;
    signInWithGoogle();
  });

  btnBack.addEventListener('click', () => {
    stopPlay();
  });

  btnFeed.addEventListener('click', () => {
    foodMenu.classList.toggle('hidden');
  });

  foodMenu.addEventListener('click', (event) => {
    const option = event.target.closest('.food-option');
    if (!option) return;
    requestFoodDrop(option.dataset.food || 'flakes');
  });

  window.addEventListener('click', (event) => {
    if (foodMenu.classList.contains('hidden')) return;
    if (foodMenu.contains(event.target) || btnFeed.contains(event.target)) return;
    foodMenu.classList.add('hidden');
  });

  fishNameInput.addEventListener('input', () => {
    profile.fishName = sanitizeFishName(fishNameInput.value);
    updateAllDisplays();
    queueSave();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') foodMenu.classList.add('hidden');
    if (event.key === 'Escape' && Game.isPlaying()) {
      stopPlay();
    }
    if ((event.key === 'Enter' || event.key === ' ') && !Game.isPlaying()) {
      const activeTag = document.activeElement?.tagName;
      if (activeTag !== 'BUTTON') startPlay();
    }
  });

  // Save on page close
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && Game.isPlaying()) {
      stopTrackingTime();
    } else if (document.visibilityState === 'visible' && Game.isPlaying()) {
      startTrackingTime();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (Game.isPlaying()) {
      stopTrackingTime();
    }
  });

  /* ═══════════════════════════════════════════════
     INIT
     ═══════════════════════════════════════════════ */
  loadLocalProfile();
  updateAllDisplays();
  Game.setFoodCatchHandler(feedFish);
  appInterval = setInterval(updateAllDisplays, 1000);
  initFirebase();
})();