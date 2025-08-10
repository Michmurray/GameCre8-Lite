// api/create.js  — Vercel Edge Function: Prompt -> Build -> Save -> Publish -> URL
export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET       = "game-builds";

// lightweight import of supabase-js for Edge
import supabasePkg from "https://esm.sh/@supabase/supabase-js@2";
const { createClient } = supabasePkg;

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), { status: 405 });
  }

  try {
    const { prompt = "", genre = "runner", ageBand = "teens", difficulty = "medium" } = await req.json();
    // Basic input guardrails
    const idea = String(prompt).slice(0, 220).trim();
    if (!idea) return json({ error: "Missing prompt" }, 400);

    // safety rewrite (cartoonize)
    const cleaned = cartoonize(idea);

    // slug (pretty, unique)
    const base = slugify(cleaned || "my-game");
    const slug = `${base}-${Math.floor(Math.random()*8999)+1000}`; // e.g., cloud-dash-4821

    // Build single-file HTML (server-side)
    const html = buildSingleFileHTML({ title: cleaned, genre, ageBand, difficulty });

    // Save to Supabase Storage
    const supa = createClient(SUPABASE_URL, SERVICE_KEY);
    const version = Date.now();
    const path = `${BUCKET}/${slug}/v${version}.html`;

    // Upload the HTML
    const { error: upErr } = await supa.storage.from(BUCKET).upload(
      `${slug}/v${version}.html`,
      new Blob([html], { type: "text/html" }),
      { contentType: "text/html", upsert: false }
    );
    if (upErr) return json({ error: `Upload failed: ${upErr.message}` }, 500);

    // Update latest pointer
    const { error: latestErr } = await supa.storage.from(BUCKET).upload(
      `${slug}/latest.txt`,
      new Blob([`${slug}/v${version}.html`], { type: "text/plain" }),
      { contentType: "text/plain", upsert: true }
    );
    if (latestErr) return json({ error: `Publish failed: ${latestErr.message}` }, 500);

    // Pretty play URL thanks to vercel.json rewrite
    const playUrl = `/play/${slug}`;

    return json({ ok: true, slug, url: playUrl });
  } catch (e) {
    return json({ error: e?.message || "Server error" }, 500);
  }
}

/* ---------- helpers ---------- */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "game";
}

function cartoonize(text) {
  // super simple soft filter; production uses a richer map
  return text
    .replace(/\bgun(s)?\b/gi, "foam blaster")
    .replace(/\bblood(y)?\b/gi, "paint")
    .replace(/\bknife(s)?\b/gi, "boomerang")
    .replace(/\bgrenade(s)?\b/gi, "glitter bomb");
}

function buildSingleFileHTML({ title, genre, ageBand, difficulty }) {
  // Tiny, juicy, single-file runner with embedded vector art.
  // Music OFF by default; SFX hooks in place.
  // NOTE: keep this lightweight for 3–5s create→play.
  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(title)} · GameCre8</title>
<style>
  html,body{height:100%;margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:linear-gradient(#bfeaff,#ffffff);overflow:hidden}
  canvas{display:block;width:100vw;height:100vh}
  .hud{position:fixed;left:12px;top:12px;background:rgba(0,0,0,.45);color:#fff;border-radius:10px;padding:8px 12px;font-size:14px;z-index:10}
  .share{position:fixed;right:12px;top:12px;background:rgba(0,0,0,.45);color:#fff;border-radius:10px;padding:8px 12px;font-size:13px;z-index:10;cursor:pointer}
</style></head>
<body>
<canvas id="cv"></canvas>
<div class="hud">Score: <span id="sc">0</span></div>
<button class="share" id="shareBtn" title="Copy link">Share</button>
<script>
const cv=document.getElementById('cv'), ctx=cv.getContext('2d');
function R(){cv.width=innerWidth;cv.height=innerHeight} addEventListener('resize',R); R();
let sc=0, over=false, last=performance.now(); const scEl=document.getElementById('sc');
const player={x:80,y:cv.height-160,w:96,h:72,vy:0,g:0.9,jump:-22,ground:false,double:true,coyote:0,buffer:0};
let hold=false; addEventListener('keydown',e=>{if(e.code==='Space'){hold=true;queue()}}); addEventListener('keyup',e=>{if(e.code==='Space')hold=false});
addEventListener('touchstart',e=>{e.preventDefault(); if(over){location.reload()} else {hold=true;queue()}},{passive:false});
addEventListener('touchend',e=>{e.preventDefault(); hold=false},{passive:false});
function queue(){ player.buffer=140 }
const rings=[], fire=[]; const clouds=[];
for(let i=0;i<8;i++) clouds.push({x:Math.random()*cv.width,y:Math.random()*cv.height*0.45+cv.height*0.1,s:0.3+Math.random()*0.6});
function rc(rx,ry,rw,rh,cx,cy,cr){const tx=Math.max(rx,Math.min(cx,rx+rw)),ty=Math.max(ry,Math.min(cy,ry+rh));const dx=cx-tx,dy=cy-ty;return dx*dx+dy*dy<=cr*cr}
function cloud(x,y){ctx.fillStyle='rgba(255,255,255,.95)';ctx.beginPath();ctx.arc(x,y,28,0,7);ctx.arc(x+22,y+6,22,0,7);ctx.arc(x-22,y+8,24,0,7);ctx.fill()}
function ring(x,y){ctx.lineWidth=8;const g=ctx.createLinearGradient(x-16,y-16,x+16,y+16);g.addColorStop(0,'#ffe680');g.addColorStop(1,'#ffbf00');ctx.strokeStyle=g;ctx.beginPath();ctx.arc(x,y,16,0,7);ctx.stroke();ctx.lineWidth=3;ctx.strokeStyle='rgba(255,255,255,.6)';ctx.beginPath();ctx.arc(x-6,y-6,10,-.3,1);ctx.stroke()}
function fireball(f,t){const r=18,s=.9+.2*Math.sin((t+f.t)/120);ctx.save();ctx.translate(f.x,f.y);ctx.scale(s,s);const grd=ctx.createRadialGradient(0,0,0,0,0,24);grd.addColorStop(0,'#ffbc7a');grd.addColorStop(1,'rgba(255,122,89,0)');ctx.fillStyle=grd;ctx.beginPath();ctx.arc(0,0,24,0,7);ctx.fill();ctx.fillStyle='#ff7a59';ctx.beginPath();ctx.moveTo(-40,0);ctx.quadraticCurveTo(-26,-20,-4,-6);ctx.lineTo(-4,6);ctx.quadraticCurveTo(-28,20,-40,0);ctx.fill();ctx.fillStyle='#ff4b4b';ctx.beginPath();ctx.arc(0,0,12,0,7);ctx.fill();ctx.restore()}
function unicorn(u){const bob=u.ground?0:Math.sin(performance.now()/120)*1.5;ctx.save();ctx.translate(u.x,u.y+bob);ctx.fillStyle='rgba(0,0,0,.12)';ctx.beginPath();ctx.ellipse(u.w*.45,u.h+12,u.w*.4,10,0,0,7);ctx.fill(); // tail
['#ff7ad9','#ffcc00','#7afcff','#9dff7a'].forEach((c,i)=>{ctx.strokeStyle=c;ctx.lineWidth=6-i;ctx.beginPath();ctx.moveTo(u.w*.1,u.h*.65+i*3);ctx.quadraticCurveTo(u.w*.0,u.h*.75+i*3,u.w*-.2,u.h*.65+i*3);ctx.stroke()}); // body
round(u.w*.12,u.h*.25,u.w*.72,u.h*.55,14); // legs
ctx.fillStyle='#f2f2f2';[['.22'],['.36'],['.56'],['.70']].forEach((_,i)=>round(u.w*(.22+i*.14),u.h*.65,u.w*.12,u.h*.35,6)); // head
round(u.w*.66,u.h*.1,u.w*.28,u.h*.34,12); // ear
ctx.fillStyle='#ffe3f4';ctx.beginPath();ctx.moveTo(u.w*.84,u.h*.1);ctx.lineTo(u.w*.9,u.h*.0);ctx.lineTo(u.w*.86,u.h*.2);ctx.closePath();ctx.fill(); // horn
ctx.fillStyle='#ffd166';ctx.beginPath();ctx.moveTo(u.w*.92,u.h*.08);ctx.lineTo(u.w*1.08,u.h*0.0);ctx.lineTo(u.w*1.0,u.h*.16);ctx.closePath();ctx.fill(); // mane
['#7a4bff','#ff7ad9','#7afcff'].forEach((c,i)=>{ctx.strokeStyle=c;ctx.lineWidth=5;ctx.beginPath();const mx=u.w*.58;ctx.moveTo(mx,u.h*.18+i*6);ctx.quadraticCurveTo(mx-22,u.h*.28+i*6,mx-10,u.h*.40+i*6);ctx.stroke()}); // eye
ctx.fillStyle='#0b1020';ctx.beginPath();ctx.arc(u.w*.84,u.h*.23,3.6,0,7);ctx.fill();ctx.restore()}
function round(x,y,w,h,r){ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.fill()}

let rt=0, ft=0, diff=1, dtimer=0;
function loop(now){
  const dt=Math.min(50, now-last); last=now;
  ctx.clearRect(0,0,cv.width,cv.height);
  clouds.forEach(c=>{c.x-=c.s; if(c.x<-120){c.x=cv.width+120;c.y=Math.random()*cv.height*.45+cv.height*.1;c.s=.3+Math.random()*.6} cloud(c.x,c.y)});
  // physics with variable jump + coyote/buffer
  player.buffer=Math.max(0,player.buffer-dt); player.coyote=Math.max(0,player.coyote-dt);
  const floor=cv.height-70;
  let g=player.g; if(player.vy<0 && hold) g*=.35;
  player.vy+=g; player.y+=player.vy;
  if(player.y+player.h>=floor){player.y=floor-player.h;player.vy=0;player.ground=true;player.double=true;player.coyote=120}else{player.ground=false}
  if(player.buffer>0 && (player.ground||player.coyote>0)){player.vy=player.jump;player.buffer=0;player.coyote=0}
  else if(player.buffer>0 && player.double && !player.ground){player.vy=player.jump*.9;player.double=false;player.buffer=0}
  // spawns
  rt+=dt; ft+=dt; dtimer+=dt;
  if(rt>1200){rings.push({x:cv.width+60,y:Math.random()*(cv.height*.4)+cv.height*.3,r:20,s:3.6*diff}); rt=0}
  if(ft>1700){fire.push({x:cv.width+60,y:Math.random()*(cv.height*.5)+cv.height*.25,r:18,s:5.0*diff,t:Math.random()*1000}); ft=0}
  if(dtimer>20000){diff=Math.min(2.2,diff+.15); dtimer=0}
  // rings
  for(let i=rings.length-1;i>=0;i--){const r=rings[i]; r.x-=r.s; ring(r.x,r.y); if(rc(player.x,player.y,player.w,player.h,r.x,r.y,r.r)){rings.splice(i,1); sc+=10; scEl.textContent=sc}else if(r.x+r.r<-10){rings.splice(i,1)}}
  // fireballs
  for(let i=fire.length-1;i>=0;i--){const f=fire[i]; f.x-=f.s; fireball(f,now); if(rc(player.x,player.y,player.w,player.h,f.x,f.y,f.r)){over=true}else if(f.x+f.r<-10){fire.splice(i,1)}}
  unicorn(player);
  ctx.fillStyle='#e9f7ff'; ctx.fillRect(0,floor,cv.width,cv.height-floor);
  if(!over){requestAnimationFrame(loop)}else{ctx.fillStyle='rgba(0,0,0,.55)';ctx.fillRect(0,0,cv.width,cv.height);ctx.fillStyle='#fff';ctx.font='bold 44px system-ui';ctx.fillText('Game Over',cv.width/2-120,cv.height/2-10);ctx.font='20px system-ui';ctx.fillText('Tap or press R to Restart',cv.width/2-120,cv.height/2+26)}
}
requestAnimationFrame(loop);
addEventListener('keydown',e=>{ if(over && (e.code==='KeyR'||e.code==='Space')) location.reload()});
document.getElementById('shareBtn').onclick=async()=>{ try{ await navigator.clipboard.writeText(location.href); alert('Link copied!'); }catch{ alert('Copy failed'); } };
function escapeHtml(s){return s.replace(/[&<>\"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;' }[m]))}
</script></body></html>`;
}
