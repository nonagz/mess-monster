import { CONFIG } from './firebase-config.js';

/* ================= backend choice ================= */
const params = new URLSearchParams(location.search);
const configured = !!(CONFIG && CONFIG.apiKey && !String(CONFIG.apiKey).startsWith('YOUR'));
const DEMO = params.has('demo');
let B = null;
if (DEMO) B = await import('./backend-demo.js');
else if (configured) B = await import('./backend-firebase.js');

/* ================= constants & helpers ================= */
const DAY = 86400000;
const GAME_KEYS = ['v', 'phase', 'players', 'reward', 'week', 'chores', 'draft', 'weekChores', 'weekStart', 'seats', 'history'];
const TEMPLATE = [["שטיפת כלים",3],["הפעלת כביסה",2],["תלייה וקיפול כביסה",3],["שאיבת אבק",3],["שטיפת רצפה",4],["ניקוי שירותים ואמבטיה",4],["הוצאת זבל ומחזור",1],["קניות בסופר",3],["בישול ארוחת ערב",4],["החלפת מצעים",2],["ניקוי משטחי מטבח",2],["השקיית עציצים",1]];
const MONSTERS = [
  { name:'גרביליון', sub:'אוכל גרביים בודדות', body:'#8E5BD9', dark:'#5D3A9E', eyes:2, top:'sock' },
  { name:'אבקון', sub:'מתחבא מתחת לספה', body:'#8592A8', dark:'#566179', eyes:1, top:'fuzz' },
  { name:'כלימוש', sub:'גר בכיור כבר שלושה ימים', body:'#3FAE5A', dark:'#24763B', eyes:3, top:'spoon' },
  { name:'ערמונת', sub:'ערמת כביסה שקמה לחיים', body:'#E0506A', dark:'#A1293F', eyes:2, top:'horns' }
];
const PCOL = ['var(--pa)','var(--pb)','var(--pj)'], PHEX = ['#3157FF','#FF8A1F','#D63C8E'];
const DAYL = ['א׳','ב׳','ג׳','ד׳','ה׳','ו׳','ש׳'];
const uid = () => Math.random().toString(36).slice(2,10);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const clamp = (n,a,b) => Math.max(a, Math.min(b, n));
const ls = { get(k){try{return localStorage.getItem(k)}catch(e){return null}}, set(k,v){try{localStorage.setItem(k,v)}catch(e){}} };
const wait = ms => new Promise(r => setTimeout(r, ms));
const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

function freshGame() {
  return { v:2, phase:'setup', players:['',''], reward:'', week:1, chores:TEMPLATE.map(([name,pts]) => ({ id:uid(), name, pts })),
    draft:null, weekChores:[], weekStart:null, seats:[null,null], history:{} };
}
const pickGame = d => { const g = {}; GAME_KEYS.forEach(k => { g[k] = d[k] === undefined ? null : d[k]; }); if (!g.history) g.history = {}; if (!g.weekChores) g.weekChores = []; if (!g.seats) g.seats = [null,null]; return g; };

/* ================= sound vs. the phone's silent mode =================
   Web pages can't read Android's ringer/silent mode. Safari (iOS/macOS) exposes navigator.audioSession:
   the "ambient" type makes our sounds obey the iPhone's silent switch, so sound can default to on there.
   Everywhere else sound starts off until the player turns it on, and that choice is remembered. */
const followsSilentSwitch = (() => { try { if (navigator.audioSession) { navigator.audioSession.type = 'ambient'; return true; } } catch (e) {} return false; })();
function initialMuted(){ const saved = ls.get('mm-muted'); if (saved === '1') return true; if (saved === '0') return false; return !followsSilentSwitch; }

/* ================= app state ================= */
let S = null;          // the couple's shared game state
let U = null;          // signed-in user {uid, name, photo}
let HID = null;        // household id
const ui = { mode:'boot', house:{ inviteCode:'', members:[] }, edit:null, err:'', status:'', confirm:null, combo:{n:0,t:0}, post:[],
  wasDone:null, doneWeek:null, victoryPlaying:false, intro:false, rewardOpen:false, prev:{}, muted:initialMuted(),
  view:'game', weeks:[], joinCode:(params.get('join')||'').toUpperCase(), busy:false, joinName:'' };
const app = document.getElementById('app');
app.dir = 'rtl'; app.lang = 'he';
const P = i => i === 2 ? 'ביחד' : ((S && S.players[i] || '').trim() || (i ? 'שחקן/ית ב' : 'שחקן/ית א'));
const meIdx = () => { if (!S || !U) return null; const i = S.seats.indexOf(U.uid); return i >= 0 ? i : null; };
const monster = () => MONSTERS[((S ? S.week : 1) - 1) % MONSTERS.length];

/* ================= sound ================= */
let ac = null;
function audio(){ if(ui.muted) return null; if(!ac){try{ac=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return null}} if(ac.state==='suspended') ac.resume(); return ac; }
function tone(f,dur,type,vol,slide,delay){const a=audio(); if(!a) return; const t=a.currentTime+(delay||0); const o=a.createOscillator(), g=a.createGain(); o.type=type||'square'; o.frequency.setValueAtTime(f,t); if(slide) o.frequency.exponentialRampToValueAtTime(slide,t+dur); g.gain.setValueAtTime(vol||.08,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t+dur+.02);}
function noise(dur,vol,freq,sweep,delay){const a=audio(); if(!a) return; const t=a.currentTime+(delay||0); const b=a.createBuffer(1,Math.floor(a.sampleRate*dur),a.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; const s=a.createBufferSource(); s.buffer=b; const fl=a.createBiquadFilter(); fl.type='bandpass'; fl.frequency.setValueAtTime(freq,t); if(sweep) fl.frequency.exponentialRampToValueAtTime(sweep,t+dur); const g=a.createGain(); g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+dur); s.connect(fl).connect(g).connect(a.destination); s.start(t);}
const sfx = {
  tap(){tone(700,.05,'sine',.05,900)}, flip(){noise(.07,.18,2500,5000)}, whoosh(){noise(.25,.16,400,3500)},
  hit(){tone(160,.22,'square',.12,55); noise(.12,.2,900,300)}, pop(){tone(500,.09,'sine',.1,1300)},
  combo(n){[0,4,7,12].forEach((s,i)=>tone(440*Math.pow(2,(s+Math.min(n,8))/12),.13,'triangle',.08,null,i*.06))},
  chime(){[12,16,19,24].forEach((s,i)=>tone(523*Math.pow(2,s/12),.35,'sine',.06,null,i*.07))},
  roar(){tone(110,.7,'sawtooth',.1,45); noise(.6,.12,500,120)},
  win(){[0,4,7,12,7,12,16,19].forEach((s,i)=>tone(523*Math.pow(2,s/12),.2,'square',.05,null,i*.11)); [0,4,7].forEach(s=>tone(523*Math.pow(2,(s+12)/12),.9,'triangle',.05,null,.95))},
  ping(){tone(880,.12,'sine',.08,1320); tone(1320,.15,'sine',.06,null,.1)}, sad(){tone(300,.3,'triangle',.07,150)}
};
function buzz(ms){try{navigator.vibrate&&navigator.vibrate(ms)}catch(e){}}

/* ================= particles ================= */
const cv=document.getElementById('fx'), cx=cv.getContext('2d'); let parts=[], running=false, last=0;
function size(){const dpr=Math.min(2,window.devicePixelRatio||1); cv.width=innerWidth*dpr; cv.height=innerHeight*dpr; cx.setTransform(dpr,0,0,dpr,0,0);} size(); addEventListener('resize',size);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
function spawn(p){ if(reduced&&p.type!=='proj') return; parts.push(p); if(!running){running=true; last=performance.now(); requestAnimationFrame(tick);} }
function tick(now){
  const dt=Math.min(.05,(now-last)/1000); last=now; cx.clearRect(0,0,innerWidth,innerHeight);
  parts=parts.filter(p=>{
    p.age+=dt; if(p.age>=p.life){ if(p.onEnd) p.onEnd(); return false; }
    const k=p.age/p.life;
    if(p.type==='proj'){
      const e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2; const x=p.x0+(p.x1-p.x0)*e, y=p.y0+(p.y1-p.y0)*e-Math.sin(Math.PI*e)*p.arc;
      p.trail.push([x,y]); if(p.trail.length>12) p.trail.shift();
      p.trail.forEach((t,i)=>{cx.globalAlpha=i/p.trail.length*.6; cx.fillStyle=p.color; cx.beginPath(); cx.arc(t[0],t[1],p.r*(i/p.trail.length),0,7); cx.fill();});
      cx.globalAlpha=1; cx.fillStyle='#fff'; cx.strokeStyle='#16161F'; cx.lineWidth=3; cx.beginPath(); cx.arc(x,y,p.r,0,7); cx.fill(); cx.stroke();
      cx.fillStyle=p.color; cx.beginPath(); cx.arc(x,y,p.r*.55,0,7); cx.fill(); return true;
    }
    p.vy+=p.g*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vx*=p.drag; p.rot+=p.vr*dt;
    cx.globalAlpha=k>.7?(1-k)/.3:1;
    if(p.type==='conf'){cx.save(); cx.translate(p.x,p.y); cx.rotate(p.rot); cx.scale(1,Math.cos(p.age*8)); cx.fillStyle=p.color; cx.fillRect(-p.r,-p.r/2,p.r*2,p.r); cx.restore();}
    else if(p.type==='bubble'){cx.strokeStyle='rgba(255,255,255,.95)'; cx.lineWidth=2; cx.fillStyle='rgba(255,255,255,.25)'; cx.beginPath(); cx.arc(p.x+Math.sin(p.age*6+p.rot)*4,p.y,p.r,0,7); cx.fill(); cx.stroke(); cx.fillStyle='#fff'; cx.beginPath(); cx.arc(p.x-p.r*.35,p.y-p.r*.35,p.r*.22,0,7); cx.fill();}
    else if(p.type==='star'){cx.save(); cx.translate(p.x,p.y); cx.rotate(p.rot); cx.fillStyle=p.color; cx.strokeStyle='#16161F'; cx.lineWidth=2; cx.beginPath(); for(let i=0;i<10;i++){const r=i%2?p.r*.45:p.r; const a=i*Math.PI/5; cx.lineTo(Math.cos(a)*r,Math.sin(a)*r);} cx.closePath(); cx.fill(); cx.stroke(); cx.restore();}
    else {cx.fillStyle=p.color; cx.strokeStyle='#16161F'; cx.lineWidth=2; cx.beginPath(); cx.arc(p.x,p.y,p.r*(1-k*.5),0,7); cx.fill(); cx.stroke();}
    cx.globalAlpha=1; return true;
  });
  if(parts.length) requestAnimationFrame(tick); else {running=false; cx.clearRect(0,0,innerWidth,innerHeight);}
}
const rnd=(a,b)=>a+Math.random()*(b-a);
function burst(x,y,colors,n,opt){opt=opt||{}; for(let i=0;i<n;i++){const a=rnd(0,Math.PI*2), sp=rnd(opt.min||120,opt.max||420); spawn({type:opt.type||'dot',x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-(opt.up||120),g:opt.g??700,drag:.985,r:rnd(opt.rmin||4,opt.rmax||9),color:colors[i%colors.length],age:0,life:rnd(.6,opt.life||1.2),rot:rnd(0,6),vr:rnd(-8,8)});}}
function bubbles(x,y,n){for(let i=0;i<n;i++) spawn({type:'bubble',x:x+rnd(-60,60),y:y+rnd(-20,30),vx:rnd(-30,30),vy:rnd(-160,-60),g:-20,drag:.99,r:rnd(5,14),age:0,life:rnd(1,2),rot:rnd(0,6),vr:0});}
function confettiRain(ms){const cols=['#3157FF','#FF8A1F','#D63C8E','#FFC93C','#139E66','#fff']; const end=performance.now()+ms; (function drop(){ for(let i=0;i<6;i++) spawn({type:'conf',x:rnd(0,innerWidth),y:-20,vx:rnd(-60,60),vy:rnd(80,240),g:180,drag:.995,r:rnd(5,9),color:cols[Math.floor(rnd(0,cols.length))],age:0,life:rnd(2.4,3.6),rot:rnd(0,6),vr:rnd(-6,6)}); if(performance.now()<end) setTimeout(drop,60); })();}
function projectile(from,to,color,onArrive){spawn({type:'proj',x0:from[0],y0:from[1],x1:to[0],y1:to[1],arc:rnd(60,140),r:11,color,trail:[],age:0,life:.45,onEnd:onArrive});}
function center(el){const r=el.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2];}

/* ================= juice helpers ================= */
function banner(text,small){const b=document.createElement('div'); b.className='banner'; b.innerHTML=esc(text)+(small?`<small>${esc(small)}</small>`:''); document.body.appendChild(b); setTimeout(()=>b.remove(),1600);}
function toast(em,text){const box=document.getElementById('toasts'); const t=document.createElement('div'); t.className='toast'; t.innerHTML=`<span class="em" aria-hidden="true">${em}</span><span></span>`; t.lastChild.textContent=text; box.appendChild(t); while(box.children.length>3) box.firstChild.remove(); setTimeout(()=>{t.classList.add('out'); setTimeout(()=>t.remove(),400)},3800);}
function shake(){app.classList.remove('shake'); void app.offsetWidth; app.classList.add('shake');}
function confettiBurstTop(kind){ const cols=kind==='thanks'?['#E5383B','#FBDDEE','#fff','#D63C8E']:['#FFC93C','#3157FF','#FF8A1F','#fff']; burst(innerWidth/2,90,cols,40,{type:kind==='thanks'?'dot':'star',up:50,g:500}); }
function hitMonster(pts,color,big){
  const w=document.getElementById('mwrap'); if(!w) return;
  w.classList.remove('hit'); void w.offsetWidth; w.classList.add('hit');
  const d=document.createElement('span'); d.className='dmg'; d.textContent='−'+pts; if(big){d.style.fontSize='64px'; d.style.color='var(--pj)';} w.appendChild(d); setTimeout(()=>d.remove(),1200);
  const c=center(w); burst(c[0],c[1]-10,[monster().body,color,'#FFC93C','#fff'],big?44:24,{type:big?'star':'dot',rmax:big?14:9}); bubbles(c[0],c[1],big?14:7);
  shake(); sfx.hit(); buzz(big?[40,40,60]:35);
}

/* ================= persistence ================= */
let houseUnsub=null, marksUnsub=null, marksWeek=null, pingUnsub=null, pingFor=null, weeksUnsub=null, M={}, saving=false, queued=false;
let seen=new Set(), seenInit=false;
const seenKey = () => 'mm-seen-'+HID;
function loadSeen(){ const raw=ls.get(seenKey()); seen=new Set(JSON.parse(raw||'[]')); seenInit=raw!==null; }
function saveSeen(){ ls.set(seenKey(),JSON.stringify([...seen].slice(-400))); seenInit=true; }
function setStatus(t){ui.status=t; const el=document.getElementById('status'); if(el) el.textContent=t;}

function save(){ if(HID&&S) push(); }
async function push(){
  if(saving){queued=true;return} saving=true;
  try{ await B.saveHousehold(HID, clone(S)); setStatus('מסונכרן'); }catch(e){ setStatus('השמירה נכשלה. בדקו חיבור לאינטרנט'); }
  saving=false; if(queued){queued=false; push();}
}
const markId=(cid,p)=>`w${S.week}-${cid}-${p}`;
async function putMark(cid,p){ const id=markId(cid,p), data={week:S.week,chore:cid,p,at:Date.now()}; M[id]={...data,_id:id}; seen.add(id); saveSeen(); try{ await B.putMark(HID,id,data); }catch(e){ setStatus('הסימון לא נשמר'); } }
async function delMark(id){ delete M[id]; try{ await B.delMark(HID,id); }catch(e){} }

function cleanupHouse(){
  [houseUnsub,marksUnsub,pingUnsub,weeksUnsub].forEach(f=>f&&f());
  houseUnsub=marksUnsub=pingUnsub=weeksUnsub=null; marksWeek=null; pingFor=null; M={}; S=null; HID=null; ui.view='game'; ui.prev={}; ui.doneWeek=null;
}

function ensureSubs(){
  if(!HID||!S) return;
  if(marksWeek!==S.week){
    if(marksUnsub) marksUnsub(); marksWeek=S.week; const wk=S.week;
    marksUnsub=B.watchMarks(HID,wk,(list,meta)=>{
      if(wk!==S.week) return;
      const next={}; list.forEach(m=>{next[m._id]=m});
      let fresh=[];
      if(!meta.fromCache){
        if(seenInit) fresh=list.filter(m=>!seen.has(m._id));
        list.forEach(m=>seen.add(m._id)); saveSeen();
      }
      M=next; render();
      const me=meIdx(); const partner=fresh.filter(m=>m.p!==me).sort((a,b)=>a.at-b.at);
      if(partner.length) replayPartner(partner);
    },()=>{});
  }
  const me=meIdx();
  if(me!==null && pingFor!==me){
    if(pingUnsub) pingUnsub(); pingFor=me;
    const k='mm-pings-'+HID;
    pingUnsub=B.watchPings(HID,me,(list,meta)=>{
      if(meta.fromCache) return;
      const since=Number(ls.get(k)||0);
      if(!since){ const mx=list.reduce((a,x)=>Math.max(a,x.at||0),0); ls.set(k,String(mx||Date.now())); return; }
      const fresh=list.filter(x=>x.at>since).sort((a,b)=>a.at-b.at);
      if(fresh.length){ ls.set(k,String(fresh[fresh.length-1].at)); fresh.slice(-3).forEach((x,i)=>setTimeout(()=>receivePing(x),i*900)); }
    },()=>{});
  }
}

function openHouse(hid){
  cleanupHouse(); HID=hid; loadSeen(); ui.mode='loading'; render();
  houseUnsub=B.watchHousehold(hid,(data,meta)=>{
    if(!data){ if(!meta.fromCache){ cleanupHouse(); ui.mode='nohouse'; render(); } return; }
    if(meta.pending && S) return;
    if(!data.members||!data.members.includes(U.uid)){ if(!meta.fromCache){ cleanupHouse(); ui.mode='nohouse'; render(); } return; }
    ui.house={inviteCode:data.inviteCode||'',members:data.members||[]};
    const g=pickGame(data); const old=S;
    S=g;
    if(old&&ui.mode==='game'&&S.phase==='week'&&(old.phase!=='week'||old.week!==S.week)) ui.intro=true;
    if(!meta.fromCache) setStatus('מסונכרן');
    // take a free seat if this account has none yet
    if(meIdx()===null&&!meta.fromCache){
      const free=S.seats.findIndex(s=>!s||!ui.house.members.includes(s));
      if(free>=0){ S.seats[free]=U.uid; if(!S.players[free]) S.players[free]=ui.joinName||firstName(U.name); save(); setTimeout(()=>{banner('ברוכים הבאים, '+P(free)+'!'); confettiBurstTop('cheer'); sfx.chime();},200); }
    }
    ui.mode='game'; ensureSubs(); render();
  },()=>{ cleanupHouse(); ui.mode='nohouse'; ui.err='אין גישה לבית הזה. אפשר ליצור בית חדש או להצטרף עם קוד.'; render(); });
}

async function archiveWeek(){
  if(!S||S.phase!=='week'||!S.weekChores.length) return;
  const ws=weekStats();
  const chores=ws.list.map(c=>{const s=st(c); return {name:c.name,pts:c.pts,owner:c.owner,done:!!s.done,by:c.owner===2?null:(s.by??null)};});
  try{ await B.saveWeek(HID,S.week,{week:S.week,monster:monster().name,startedAt:S.weekStart||null,endedAt:Date.now(),players:S.players,won:!!S.history[S.week],tot:ws.tot,left:ws.left,chores}); }catch(e){}
}

/* ================= game logic ================= */
function shuffle(a){a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a;}
/* related chores travel together: same group = adjacent in the deck and listed together during the week */
const GROUPS=[
  {id:'kitchen',name:'מטבח וכלים',re:/כלים|מדיח|מטבח|משטח|כיריים|תנור|מקרר|מיקרוגל/},
  {id:'cooking',name:'בישול',re:/בישול|ארוח|ארוחה/},
  {id:'laundry',name:'כביסה',re:/כביס|גיהוץ|מגהץ/},
  {id:'floors',name:'רצפות ואבק',re:/אבק|רצפ|ספונג|שואב|טאטוא/},
  {id:'bath',name:'שירותים ומקלחת',re:/שירות|אמבט|מקלחת|כיור/},
  {id:'shopping',name:'קניות',re:/קני|סופר|מכולת/},
  {id:'trash',name:'זבל ומחזור',re:/זבל|מחזור|פחי/},
  {id:'bedding',name:'מצעים ומגבות',re:/מצע|מגבת|מגבות/},
  {id:'green',name:'צמחים וחיות',re:/עציצ|גינה|השקי|כלב|חתול|חיית/}
];
const GROUP_ORDER=GROUPS.map(g=>g.id);
function groupOf(c){ if(c.group) return c.group; const g=GROUPS.find(g=>g.re.test(c.name||'')); return g?g.id:'other'; }
const groupName=id=>(GROUPS.find(g=>g.id===id)||{name:'שונות'}).name;
const byGroup=(a,b)=>{const ga=GROUP_ORDER.indexOf(groupOf(a)), gb=GROUP_ORDER.indexOf(groupOf(b)); return (ga<0?99:ga)-(gb<0?99:gb);};
function groupedShuffle(chores){
  const buckets=new Map();
  chores.forEach(c=>{ const g=groupOf(c); const key=g==='other'?'other-'+c.id:g; if(!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(c); });
  return shuffle([...buckets.values()]).flatMap(b=>shuffle(b));
}
function groupRun(deck,idx){ const g=groupOf(deck[idx]); if(g==='other') return 1; let n=0; for(let i=idx;i<deck.length&&groupOf(deck[i])===g;i++) n++; return n; }
function startDraft(){ S.draft={deck:groupedShuffle(S.chores).map(c=>({id:c.id,name:c.name,pts:c.pts,group:groupOf(c)})),idx:0}; S.weekChores=[]; S.phase='draft'; S.weekStart=null; ui.confirm=null; ui.rewardOpen=false; ui.groupAll=false; }
function totals(list){const t=[0,0,0]; list.forEach(c=>{if(c.owner>=0) t[c.owner]+=c.pts}); return t;}
function soloTotal(){ const d=S.draft; if(!d) return 0; const taken=new Map(S.weekChores.map(c=>[c.id,c.owner])); return d.deck.reduce((s,c)=>{const o=taken.get(c.id); return s+((o===-1||o===2)?0:c.pts)},0); }
const zoneFor=t=>Math.max(2,Math.round(t*.12));
function st(c){
  const ms=Object.values(M).filter(m=>m.chore===c.id&&m.week===S.week);
  if(c.owner===2){const conf=[ms.some(m=>m.p===0),ms.some(m=>m.p===1)]; return {done:conf[0]&&conf[1],conf,ms};}
  const first=ms.slice().sort((a,b)=>a.at-b.at)[0]; return {done:!!first,by:first?first.p:null,ms};
}
function weekStats(){
  const list=S.weekChores.filter(c=>c.owner>=0), tot=[0,0,0], rem=[0,0,0];
  list.forEach(c=>{tot[c.owner]+=c.pts; if(!st(c).done) rem[c.owner]+=c.pts;});
  const all=tot[0]+tot[1]+tot[2], left=rem[0]+rem[1]+rem[2];
  return {list,tot,rem,all,left,allDone:list.length>0&&left===0};
}
function dayIndex(){ if(!S.weekStart) return 0; const s=new Date(S.weekStart); s.setHours(0,0,0,0); return Math.floor((Date.now()-s.getTime())/DAY); }
function pace(ws){
  const di=dayIndex(), expected=clamp((di+1)/7,0,1), done=ws.all?(ws.all-ws.left)/ws.all:0;
  if(di>=7) return {mood:'over',text:'השבוע נגמר'};
  if(done>=expected) return {mood:'scared',text:'המפלצת מתחילה לפחד'};
  if(done<expected-.15) return {mood:'angry',text:'המפלצת מתחזקת!'};
  return {mood:'normal',text:'המפלצת מחכה לכם'};
}
function streak(){ if(!S) return 0; let n=0; for(let w=S.week-(S.history[S.week]?0:1); w>=1; w--){ if(S.history[w]) n++; else break; } return n; }

async function mark(c,btn){
  const me=meIdx(); if(me===null) return;
  const before=st(c);
  if(c.owner===2){ const id=markId(c.id,me); if(M[id]){ await delMark(id); sfx.tap(); } else await putMark(c.id,me); }
  else if(before.done){ for(const m of before.ms) await delMark(m._id); sfx.tap(); }
  else await putMark(c.id,me);
  const after=st(c), from=center(btn);
  render();
  if(!before.done&&after.done){
    const now=Date.now(); ui.combo.n=(now-ui.combo.t<90000)?ui.combo.n+1:1; ui.combo.t=now;
    const w=document.getElementById('mwrap'); const to=w?center(w):[innerWidth/2,200];
    const joint=c.owner===2;
    sfx.whoosh();
    projectile(from,to,PHEX[joint?2:c.owner],()=>{
      hitMonster(c.pts,PHEX[joint?2:c.owner],joint);
      if(joint) setTimeout(()=>{banner('התקפה משותפת!','שניכם ביחד'); sfx.combo(5);},250);
      else if(ui.combo.n>=2) setTimeout(()=>{banner('קומבו ×'+ui.combo.n); sfx.combo(ui.combo.n);},250);
      if(!joint&&c.owner!==me) setTimeout(()=>toast('❤️',`עזרת ל${P(c.owner)}! לב עזרה נוסף`),500);
    });
  } else if(c.owner===2&&after.conf[me]&&!after.done){
    sfx.pop(); bubbles(from[0],from[1],10); toast('⏳',`סימנת. מחכים ש${P(1-me)} יאשר/תאשר כדי לשחרר התקפה משותפת`);
  }
}

async function replayPartner(list){
  const me=meIdx();
  if(list.length>3) toast('🧹',`בזמן שלא היית: ${P(list[0].p)} סימן/ה ${list.length} מטלות`);
  for(const m of list.slice(-4)){
    const c=S.weekChores.find(x=>x.id===m.chore); if(!c) continue;
    const s=st(c), joint=c.owner===2;
    if(joint&&!s.done){ toast('🤝',`${P(m.p)} סימן/ה "${c.name}". חסר רק האישור שלך!`); sfx.ping(); await wait(900); continue; }
    if(!s.done) continue;
    toast(joint?'💥':'🧽',`${P(m.p)} ${joint?'השלים/ה איתך':'ביצע/ה'}: ${c.name}`);
    const w=document.getElementById('mwrap');
    if(w){ const to=center(w); await new Promise(r=>projectile([to[0]+(m.p===0?140:-140),-20],to,PHEX[joint?2:c.owner],()=>{hitMonster(c.pts,PHEX[joint?2:c.owner],joint); if(joint) banner('התקפה משותפת!'); r();})); }
    if(!joint&&c.owner===me) setTimeout(()=>toast('❤️',`${P(m.p)} עשה/תה מטלה שלך. תגידו תודה!`),400);
    await wait(900);
  }
}

async function sendPing(kind){
  const me=meIdx(); if(me===null) return;
  if(ui.house.members.length<2){ toast('💌','בן/בת הזוג עוד לא הצטרפו. שלחו להם את קוד ההזמנה'); return; }
  const btn=document.querySelector(`[data-act="ping"][data-k="${kind}"]`); if(btn){const c=center(btn); burst(c[0],c[1],kind==='thanks'?['#E5383B','#FBDDEE','#fff']:['#FFC93C','#3157FF','#FF8A1F'],18,{type:kind==='thanks'?'dot':'star'});}
  sfx.ping(); buzz(20);
  try{ await B.addPing(HID,{to:1-me,from:me,kind,at:Date.now()}); toast(kind==='thanks'?'❤️':'🙌',`נשלח ל${P(1-me)}`);}catch(e){ toast('⚠️','לא הצלחנו לשלוח. נסו שוב בעוד רגע'); }
}
function receivePing(x){
  toast(x.kind==='thanks'?'❤️':'🙌', x.kind==='thanks'?`${P(x.from)} אומר/ת לך תודה!`:`${P(x.from)} שולח/ת לך כיף!`);
  sfx.chime(); buzz([30,60,30]); confettiBurstTop(x.kind);
}

function victory(){
  ui.victoryPlaying=true; ls.set('mm-won-'+HID+'-'+S.week,'1');
  const w=document.getElementById('mwrap');
  if(w){ w.classList.add('die'); const c=center(w); setTimeout(()=>{ burst(c[0],c[1],[monster().body,monster().dark,'#fff','#FFC93C'],70,{type:'dot',max:620,rmax:14}); bubbles(c[0],c[1],30); shake(); sfx.hit(); buzz([60,40,120]); },650); }
  if(!S.history[S.week]){ S.history[S.week]={at:Date.now()}; save(); }
  archiveWeek();
  setTimeout(()=>{ ui.victoryPlaying=false; ui.wasDone=true; render(); sfx.win(); confettiRain(2600); banner(monster().name+' הובס!'); },1500);
}

/* ================= views ================= */
function pips(n){let h=''; for(let i=1;i<=5;i++) h+=`<span class="pip ${i<=n?'on':''}"></span>`; return `<span class="pips" aria-label="${n} נקודות מתוך 5">${h}</span>`;}
function logo(){const m=monster(); return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><path d="M6 26 C4 12 13 4 20 4 C28 4 37 12 34 26 C33 33 29 35 27 33 C25 37 22 37 20 34 C18 37 14 37 13 33 C10 35 7 33 6 26Z" fill="${m.body}" stroke="#16161F" stroke-width="2.5"/><circle cx="15" cy="17" r="4.5" fill="#fff" stroke="#16161F" stroke-width="2"/><circle cx="26" cy="17" r="3.5" fill="#fff" stroke="#16161F" stroke-width="2"/><circle cx="16" cy="18" r="2" fill="#16161F"/><circle cx="26.5" cy="18" r="1.6" fill="#16161F"/><path d="M14 25 Q20 30 26 25" stroke="#16161F" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;}
const GOOGLE_G=`<svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

function meter(t,total,bumpIdx){
  const diff=t[0]-t[1], zone=zoneFor(total), R=Math.max(total/2,zone*2,1);
  const pos=clamp(50+(diff/R)*50,4,96), zw=clamp((zone/R)*100,6,100), inz=Math.abs(diff)<=zone;
  return `<div class="meter ${inz?'inzone':''}" aria-label="מאזן העומס">
    <div class="meter-top"><span style="color:var(--pa)">${esc(P(0))} <span class="num ${bumpIdx===0?'bump':''}">${t[0]}</span></span><span style="color:var(--pj);font-size:14px">ביחד ${t[2]}</span><span style="color:var(--pb)"><span class="num ${bumpIdx===1?'bump':''}">${t[1]}</span> ${esc(P(1))}</span></div>
    <div class="track"><div class="zone" style="left:${50-zw/2}%;width:${zw}%"></div><div class="mark" data-anim="meter" data-prop="left" data-to="${pos}%"></div></div>
    <div class="meter-cap"><span>עמוס על ${esc(P(0))}</span><span class="mid">אזור האיזון ±${zone}</span><span>עמוס על ${esc(P(1))}</span></div>
  </div>`;
}

function monsterSVG(m,mood){
  const E=m.eyes===1?[[100,70,21]]:m.eyes===3?[[68,78,12],[100,60,14],[132,78,12]]:[[78,72,16],[123,72,13]];
  const ink='#16161F'; let top='';
  if(m.top==='sock') top=`<g transform="rotate(-18 120 22)"><path d="M108 -8 h22 v34 q0 12 -12 12 h-16 q-8 0 -8 -8 q0 -8 8 -8 h6 Z" fill="#fff" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/><path d="M108 0 h22 M108 8 h22" stroke="#E5383B" stroke-width="4"/></g>`;
  if(m.top==='fuzz') top=[[70,22,10],[88,12,12],[108,10,11],[126,16,10],[140,26,8]].map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#C4CBD6" stroke="${ink}" stroke-width="3.5"/>`).join('');
  if(m.top==='spoon') top=`<g transform="rotate(24 120 20)"><rect x="116" y="-18" width="8" height="40" rx="4" fill="#D9DEE5" stroke="${ink}" stroke-width="3.5"/><ellipse cx="120" cy="-22" rx="11" ry="15" fill="#D9DEE5" stroke="${ink}" stroke-width="3.5"/></g><circle cx="74" cy="20" r="7" fill="#fff" stroke="${ink}" stroke-width="3"/>`;
  if(m.top==='horns') top=`<path d="M62 34 L52 0 L84 22 Z" fill="#FFE8D2" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/><path d="M138 34 L148 0 L116 22 Z" fill="#FFE8D2" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>`;
  const eyes=E.map(([x,y,r])=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" stroke="${ink}" stroke-width="3.5"/>
    <g class="pupil" data-x="${x}" data-y="${y}" data-r="${r}"><circle cx="${x}" cy="${y+(mood==='scared'?0:2)}" r="${mood==='scared'?r*.32:r*.5}" fill="${ink}"/><circle cx="${x-r*.2}" cy="${y-r*.15}" r="${r*.16}" fill="#fff"/></g>
    <ellipse class="lid" cx="${x}" cy="${y}" rx="${r+2.5}" ry="${r+2.5}" fill="${m.body}" stroke="${ink}" stroke-width="3"/>`).join('');
  const brows=mood==='angry'?E.map(([x,y,r])=>{const dir=E.length===1?0:(x<100?1:x>100?-1:0); return `<path d="M${x-r-2} ${y-r-10+dir*-5} L${x+r+2} ${y-r-10+dir*5}" stroke="${ink}" stroke-width="6" stroke-linecap="round"/>`;}).join('')
    :mood==='scared'?E.map(([x,y,r])=>{const dir=x<100?-1:x>100?1:0; return `<path d="M${x-r} ${y-r-8+dir*-4} Q${x} ${y-r-16} ${x+r} ${y-r-8+dir*4}" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round"/>`}).join(''):'';
  const mouth=mood==='scared'?`<path d="M84 118 q8 -8 16 0 q8 8 16 0" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M150 52 q8 12 0 18 q-8 -6 0 -18Z" fill="#7FD3FF" stroke="${ink}" stroke-width="2.5"/>`
    :mood==='angry'?`<path d="M70 108 L130 108 Q126 134 100 134 Q74 134 70 108Z" fill="${ink}"/><path d="M76 108 l6 9 l6 -9 l6 9 l6 -9 l6 9 l6 -9 l6 9 l6 -9" fill="#fff" stroke="${ink}" stroke-width="1.5"/>`
    :`<path d="M74 106 Q100 132 126 106 Q100 118 74 106Z" fill="${ink}"/><path d="M90 110 l5 8 l5 -6 M104 111 l5 7 l5 -8" fill="#fff"/>`;
  return `<svg viewBox="0 -30 200 200" role="img" aria-label="${esc(m.name)}">
    <ellipse cx="100" cy="163" rx="70" ry="9" fill="rgba(22,22,31,.18)"/>
    <g class="breathe">${top}
      <path d="M30 112 C18 50 64 12 100 12 C140 12 184 50 170 112 C168 144 151 154 140 143 C130 160 113 160 104 146 C94 161 76 160 69 146 C57 156 34 148 30 112Z" fill="${m.body}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
      <path d="M44 100 C40 66 62 40 84 32" stroke="rgba(255,255,255,.35)" stroke-width="8" fill="none" stroke-linecap="round"/>
      <circle cx="56" cy="122" r="7" fill="${m.dark}"/><circle cx="150" cy="96" r="5" fill="${m.dark}"/><circle cx="140" cy="128" r="6" fill="${m.dark}"/><circle cx="60" cy="54" r="4" fill="${m.dark}"/>
      ${eyes}${brows}${mouth}
    </g></svg>`;
}

const viewLoading=()=>`<section class="panel loading"><div class="spinner"></div><p>מתחברים…</p></section>`;

function viewUnconfigured(){
  return `<section class="panel hero">
    <div class="mwrap" id="mwrap"><div class="mscale"><div class="mhit">${monsterSVG(MONSTERS[0],'normal')}</div></div></div>
    <h2>כמעט מוכן!</h2>
    <p>כדי שזוגות יוכלו להירשם צריך לחבר פרויקט Firebase: למלא את הקובץ <code>js/firebase-config.js</code> לפי ההוראות ב־README.</p>
    <a class="btn primary big" href="?demo=1">לנסות במצב הדגמה</a>
  </section>`;
}

function viewLanding(){
  return `<section class="panel hero">
    <div class="mwrap intro" id="mwrap"><div class="mscale"><div class="mhit">${monsterSVG(MONSTERS[(new Date().getDay())%4],'normal')}</div></div></div>
    <h2>מטלות הבית הן בוס.<br>תביסו אותו ביחד.</h2>
    <p>משחק שבועי לזוגות: מחלקים את המטלות בצורה מאוזנת, כל אחד מסמן מהטלפון שלו, וכל מטלה שבוצעה מורידה למפלצת חיים. בסוף השבוע מחכה לכם פרס משותף.</p>
    ${DEMO?`<button class="btn primary big" data-act="signin">להתחיל הדגמה</button>`
      :`<button class="btn google big" data-act="signin">${GOOGLE_G}התחברות עם Google</button>`}
    ${ui.joinCode?`<p class="hint">יש לך קוד הזמנה: <b dir="ltr">${esc(ui.joinCode)}</b>. אחרי ההתחברות תצטרפו ישר לבית.</p>`:''}
    ${ui.err?`<p class="err">${esc(ui.err)}</p>`:''}
  </section>
  <section class="panel">
    <div class="howto">
      <div><b>1. נרשמים</b><span>אחד פותח בית ושולח קוד הזמנה. השני מצטרף מהטלפון שלו.</span></div>
      <div><b>2. מחלקים</b><span>קלפי מטלות מתהפכים. לוקחים, או עושים ביחד, עד שהחלוקה מאוזנת.</span></div>
      <div><b>3. מביסים</b><span>כל השבוע כל אחד מסמן מה עשה. השבוע נשמר בהיסטוריה שלכם.</span></div>
    </div>
  </section>`;
}

function viewNoHouse(){
  const name=ui.joinName||firstName(U.name);
  return `<section class="panel">
    <p class="eyebrow">שלום${name?' '+esc(name):''}!</p>
    <h2>איך קוראים לך במשחק?</h2>
    <input id="myname" data-edit="myname" value="${esc(name)}" maxlength="14" placeholder="השם שלך" autocomplete="off">
  </section>
  <section class="panel ${ui.joinCode?'invite':''}">
    <h2>יש לך קוד הזמנה?</h2>
    <p class="hint">בן/בת הזוג פתחו בית ושלחו לך קוד בן 6 תווים.${DEMO?' בהדגמה הקוד הוא DEMO42.':''}</p>
    <div class="joinrow"><input id="joincode" data-edit="joincode" value="${esc(ui.joinCode)}" maxlength="6" placeholder="ABC123" autocomplete="off" dir="ltr"><button class="btn primary" data-act="join" ${ui.busy?'disabled':''}>הצטרפות</button></div>
  </section>
  <div class="or">או</div>
  <section class="panel">
    <h2>פותחים בית חדש</h2>
    <p class="hint">תקבלו קוד הזמנה לשלוח לבן/בת הזוג.</p>
    <button class="btn primary big" data-act="create" ${ui.busy?'disabled':''}>פתיחת בית חדש</button>
  </section>
  ${ui.err?`<p class="err" style="background:var(--paper);padding:10px;border-radius:12px">${esc(ui.err)}</p>`:''}
  <div class="minor"><button class="btn small" data-act="signout">התנתקות</button></div>`;
}

function invitePanel(){
  if(ui.house.members.length>=2||!ui.house.inviteCode) return '';
  return `<section class="panel invite">
    <h2>מזמינים את בן/בת הזוג</h2>
    <p class="hint">שלחו את הקישור או את הקוד. הם מתחברים עם Google מהטלפון שלהם ומצטרפים לבית.</p>
    <div class="codebox"><span class="code">${esc(ui.house.inviteCode)}</span>
      <span class="actions"><button class="btn small" data-act="copyinvite">העתקת קישור</button>${navigator.share?`<button class="btn small primary" data-act="shareinvite">שליחה</button>`:''}</span></div>
  </section>`;
}

function viewSetup(){
  const e=ui.edit, isSetup=S.phase==='setup';
  return `
  ${isSetup?invitePanel():''}
  <section class="panel">
    <h2>מי משחק?</h2>
    <div class="row2">
      <label><span><i class="dot" style="background:var(--pa)"></i>שחקן/ית א</span><input id="p0" data-edit="p0" value="${esc(e.players[0])}" placeholder="שם" maxlength="14" autocomplete="off"></label>
      <label><span><i class="dot" style="background:var(--pb)"></i>שחקן/ית ב</span><input id="p1" data-edit="p1" value="${esc(e.players[1])}" placeholder="שם" maxlength="14" autocomplete="off"></label>
    </div>
    <h2>הפרס המשותף</h2>
    <input id="reward" data-edit="reward" value="${esc(e.reward)}" placeholder="למשל: ערב סרט עם פיצה" maxlength="60" autocomplete="off">
    <h2>חפיסת המטלות</h2>
    <p class="hint">נקודות (1–5) = כמה המטלה מעייפת או לא נעימה. בזמן החלוקה מחליטים מי לוקח כל מטלה, או שעושים אותה ביחד.</p>
    <ul class="deck-edit">
      ${e.chores.map(c=>`<li>
        <input id="c-${c.id}" data-edit="name" data-id="${c.id}" value="${esc(c.name)}" placeholder="שם המטלה" maxlength="40" autocomplete="off">
        <span class="step"><button data-act="ept" data-id="${c.id}" data-d="-1" aria-label="פחות נקודות">−</button><output>${c.pts}</output><button data-act="ept" data-id="${c.id}" data-d="1" aria-label="יותר נקודות">+</button></span>
        <button class="del" data-act="edel" data-id="${c.id}" aria-label="מחיקת ${esc(c.name)}">×</button></li>`).join('')}
    </ul>
    <button class="btn small" data-act="eadd">+ מטלה חדשה</button>
    ${ui.err?`<p class="err">${esc(ui.err)}</p>`:''}
    ${!isSetup&&S.phase==='week'?`<p class="hint">שינויים בחפיסה ייכנסו לחלוקה של השבוע הבא.</p>`:''}
    <div class="actions">
      <button class="btn primary big" data-act="esave">${isSetup?'יאללה, לחלוקה':'שמירה'}</button>
      ${!isSetup?`<button class="btn" data-act="ecancel">ביטול</button>`:''}
    </div>
  </section>
  ${!isSetup?`${invitePanel()}<section class="panel">
    <h2>החשבון</h2>
    <p class="hint">מחובר/ת בתור ${esc(U.name||'משתמש/ת')}${DEMO?' (הדגמה)':''}.</p>
    <div class="actions">
      <button class="btn small" data-act="signout">התנתקות</button>
      <button class="btn small" data-act="leave">${ui.confirm==='leave'?'בטוח? לחיצה נוספת מוציאה אותך מהבית':'יציאה מהבית'}</button>
    </div>
  </section>`:''}`;
}

function viewDraft(){
  const d=S.draft, N=d.deck.length, t=totals(S.weekChores), total=soloTotal();
  if(d.idx<N){
    const c=d.deck[d.idx], left=N-d.idx, cardKey=S.week+'-'+d.idx, sameCard=ui.lastCard===cardKey; ui.lastCard=cardKey;
    const g=groupOf(c); let gStart=d.idx; while(g!=='other'&&gStart>0&&groupOf(d.deck[gStart-1])===g) gStart--;
    const gTotal=g==='other'?1:groupRun(d.deck,gStart), gPos=d.idx-gStart+1, gLeft=groupRun(d.deck,d.idx);
    const tag=g==='other'?(c.pts>=4?'מטלה כבדה':c.pts<=1?'מטלה קלה':'מטלה'):`${groupName(g)}${gTotal>1?` · ${gPos} מתוך ${gTotal}`:''}`;
    return `
    ${invitePanel()}
    <p class="eyebrow" style="color:#fff">חלוקת שבוע ${S.week} · קלף ${d.idx+1} מתוך ${N}</p>
    <section class="panel" style="animation:none">${meter(t,total,ui.bump)}</section>
    <div class="table">
      <div class="stack">
        ${left>2?'<div class="ghostcard" style="transform:translate(8px,10px) rotate(4deg)"></div>':''}
        ${left>1?'<div class="ghostcard" style="transform:translate(-6px,5px) rotate(-3deg)"></div>':''}
        <div class="card ${sameCard?'still':''}" id="card">
          <span class="swipe-label sl-0" aria-hidden="true">${esc(P(0))}</span><span class="swipe-label sl-1" aria-hidden="true">${esc(P(1))}</span><span class="swipe-label sl-2" aria-hidden="true">ביחד</span>
          <span class="tag">${esc(tag)}</span>
          <h2>${esc(c.name)}</h2>
          ${pips(c.pts)}
          <span class="step"><button data-act="dpt" data-d="-1" aria-label="פחות נקודות">−</button><output>${c.pts}</output><button data-act="dpt" data-d="1" aria-label="יותר נקודות">+</button></span>
          <p class="hint">כמה זה כבד השבוע?</p>
        </div>
      </div>
      <div class="take">
        <button class="btn bpa" data-act="take" data-o="0">${esc(P(0))}<small>לוקח/ת</small></button>
        <button class="btn bpj" data-act="take" data-o="2">ביחד<small>שנינו</small></button>
        <button class="btn bpb" data-act="take" data-o="1">${esc(P(1))}<small>לוקח/ת</small></button>
      </div>
      ${gLeft>1?`<label class="groupall"><input type="checkbox" id="groupall" data-act="groupall" ${ui.groupAll?'checked':''}> לחלק יחד את כל ${gLeft} מטלות ה${esc(groupName(g))} שנשארו</label>`:''}
      <p class="swipe-hint">אפשר גם להחליק: ימינה ל${esc(P(0))}, שמאלה ל${esc(P(1))}, למעלה לשניכם ביחד</p>
      <div class="minor">
        <button class="btn small" data-act="take" data-o="-1">לא צריך השבוע</button>
        <button class="btn small" data-act="undo" ${d.idx===0?'disabled':''}>ביטול הקלף הקודם</button>
      </div>
    </div>`;
  }
  const bal=Math.abs(t[0]-t[1])<=zoneFor(total), assigned=S.weekChores.filter(c=>c.owner>=0);
  const grp=i=>{const items=assigned.filter(c=>c.owner===i).sort(byGroup); return `<div class="grp"><h3 style="color:${PCOL[i]}">${i===2?'ביחד':esc(P(i))} <small>${t[i]} נק׳</small></h3><div class="chips">
    ${items.map(c=>`<button class="chip" data-act="move" data-id="${c.id}">${esc(c.name)} <b>${c.pts}</b></button>`).join('')||'<span class="hint">אין מטלות</span>'}</div></div>`;};
  return `
  <section class="panel">
    <p class="eyebrow">חלוקת שבוע ${S.week} · סיכום</p>
    ${meter(t,total)}
    <p class="verdict ${bal?'ok':'warn'}">${bal?'החלוקה מאוזנת. אפשר לצאת לקרב!':`הפרש של ${Math.abs(t[0]-t[1])} נקודות. העבירו מטלה כדי להיכנס לאזור האיזון.`}</p>
    <div class="groups">${grp(0)}${grp(2)}${grp(1)}</div>
    <p class="hint">לחיצה על מטלה מעבירה אותה: ${esc(P(0))} ← ${esc(P(1))} ← ביחד ← ${esc(P(0))}.</p>
    <div class="actions">
      <button class="btn primary big ${bal?'pulse':''}" data-act="startweek" ${bal&&assigned.length?'':'disabled'}>יוצאים לקרב!</button>
      ${!bal&&assigned.length?`<button class="btn" data-act="startweek">להתחיל בכל זאת</button>`:''}
      <button class="btn" data-act="undo">חזרה לקלף האחרון</button>
    </div>
  </section>`;
}

function viewWeek(){
  const ws=weekStats(), m=monster(), me=meIdx(), pc=pace(ws), di=dayIndex();
  const frac=ws.all?ws.left/ws.all:0, scale=.45+.55*frac;
  const hp=i=>ws.tot[i]?`<div class="hprow"><span class="nm" style="color:${PCOL[i]}">${i===2?'ביחד':esc(P(i))}</span>
    <span class="bar"><span class="ghost" data-anim="g${i}" data-prop="width" data-to="${ws.rem[i]/ws.tot[i]*100}%"></span><span class="fill" style="background:${PCOL[i]}" data-anim="f${i}" data-prop="width" data-to="${ws.rem[i]/ws.tot[i]*100}%"></span></span>
    <span class="num">${ws.rem[i]}/${ws.tot[i]}</span></div>`:'';
  const start=new Date(S.weekStart||Date.now()); start.setHours(0,0,0,0);
  const marksAll=Object.values(M);
  const days=Array.from({length:7},(_,i)=>{const ds=start.getTime()+i*DAY; const dm=marksAll.filter(x=>x.at>=ds&&x.at<ds+DAY); const dt=new Date(ds);
    return `<div class="day ${i<di?'past':''} ${i===di?'today':''}"><span>${DAYL[dt.getDay()]}</span><span class="ds">${dm.slice(0,6).map(x=>`<i style="background:${PCOL[x.p]}"></i>`).join('')}</span></div>`;}).join('');
  const task=c=>{const s=st(c), joint=c.owner===2; let box, note='', cls='';
    if(joint){ box=`<span class="halves"><i style="${s.conf[0]?'background:var(--pa)':''}"></i><i style="${s.conf[1]?'background:var(--pb)':''}"></i></span>`;
      if(!s.done&&(s.conf[0]||s.conf[1])){ cls='half'; note=`<span class="note" style="color:var(--pj)">${s.conf[me]?`מחכים לאישור של ${esc(P(1-me))}`:`${esc(P(s.conf[0]?0:1))} כבר סימן/ה. נשאר האישור שלך!`}</span>`; }
    } else { box=`<span class="box" style="${s.done?`background:${PCOL[s.by]}`:''}">${s.done?'✓':''}</span>`;
      if(s.done&&s.by!==c.owner) note=`<span class="note" style="color:var(--warn)">❤️ ${esc(P(s.by))} עזר/ה</span>`; }
    return `<button class="task ${joint?'joint':''} ${s.done?'done':''} ${cls}" data-act="mark" data-id="${c.id}" aria-pressed="${s.done}">${box}<span class="n">${esc(c.name)}</span><span class="p">−${c.pts}</span>${note}</button>`;};
  const withLabels=items=>{ let last=null; return items.slice().sort(byGroup).map(c=>{ const g=groupOf(c); const lab=g!==last&&g!=='other'&&items.filter(x=>groupOf(x)===g).length>1?`<span class="glabel">${esc(groupName(g))}</span>`:''; last=g; return lab+task(c); }).join(''); };
  const group=(title,items,col)=>items.length?`<div class="grp"><h3 style="color:${col}">${title} <small>${items.filter(c=>st(c).done).length}/${items.length}</small></h3><div class="tasks">${withLabels(items)}</div></div>`:'';
  const mine=ws.list.filter(c=>c.owner===me), joint=ws.list.filter(c=>c.owner===2), theirs=ws.list.filter(c=>c.owner===1-me);
  return `
  ${invitePanel()}
  <div class="arena ${pc.mood}">
    ${ui.combo.n>=2&&Date.now()-ui.combo.t<90000?`<span class="combo">קומבו ×${ui.combo.n}</span>`:''}
    <div class="nameplate"><span class="lvl">רמה ${S.week}</span><h2>${esc(m.name)}</h2><span class="hint">${esc(m.sub)}</span></div>
    <div class="mwrap ${ui.intro?'intro':''}" id="mwrap"><div class="mscale" data-anim="mscale" data-prop="transform" data-to="scale(${scale})"><div class="mhit">${monsterSVG(m,pc.mood)}</div></div></div>
    <span class="mood ${pc.mood}">${esc(pc.text)} · נשארו ${ws.left} נק׳${di<7?` ו־${7-di} ימים`:''}</span>
    <div class="hp">${hp(0)}${hp(2)}${hp(1)}</div>
  </div>
  ${di>=7?`<section class="panel"><p class="verdict warn">השבוע נגמר והמפלצת שרדה הפעם. אפשר להמשיך לנקות, או לחלק מחדש.</p><button class="btn primary" data-act="newweek">חלוקה לשבוע ${S.week+1}</button></section>`:''}
  <section class="panel" style="animation-delay:.05s">
    <div class="days">${days}</div>
    ${group('המשימות שלי',mine,PCOL[me])}
    ${group('ביחד',joint,PCOL[2])}
    ${group('של '+esc(P(1-me)),theirs,PCOL[1-me])}
    <p class="hint">עשית מטלה של ${esc(P(1-me))}? סמנו אותה, והיא תיחשב לצד שלהם עם לב עזרה ממך. מטלה משותפת יוצאת לדרך רק כששניכם מאשרים.</p>
  </section>
  <div class="cheer">
    <button class="btn" data-act="ping" data-k="cheer">🙌 כיף ל${esc(P(1-me))}</button>
    <button class="btn" data-act="ping" data-k="thanks">❤️ תודה ל${esc(P(1-me))}</button>
  </div>
  <div class="minor"><button class="btn small" data-act="reset">${ui.confirm==='reset'?'בטוח? לחיצה נוספת פותחת חלוקה חדשה':'לסיים את השבוע ולחלק מחדש'}</button></div>`;
}

function viewWon(){
  const ws=weekStats(), m=monster();
  const helps=ws.list.filter(c=>{const s=st(c); return c.owner<2&&s.done&&s.by!==c.owner;}).length;
  return `
  <section class="panel win">
    <p class="eyebrow">שבוע ${S.week} · רמה ${S.week}</p>
    <div class="stamp">הובס!</div>
    <h2 style="font-size:32px">${esc(m.name)} ברח מהבית</h2>
    <div class="reward ${ui.rewardOpen?'open':''}" data-act="reward" role="button" tabindex="0" aria-label="חשיפת הפרס">
      <div class="reward-in"><div class="face front">לחצו לגלות את הפרס</div><div class="face back">${esc(S.reward||'תבחרו יחד משהו כיף')}</div></div>
    </div>
    <div class="statrow">
      <div class="stat"><b>${ws.list.length}</b><span>מטלות</span></div>
      <div class="stat"><b>${ws.all}</b><span>נזק כולל</span></div>
      <div class="stat"><b>${helps}</b><span>לבבות עזרה</span></div>
      <div class="stat"><b>${streak()}</b><span>שבועות ברצף</span></div>
    </div>
    <button class="btn primary big pulse" data-act="newweek">לשבוע ${S.week+1}: מפלצת חדשה</button>
    <button class="btn small" data-act="history">היסטוריית השבועות</button>
  </section>`;
}

function viewHistory(){
  const weeks=ui.weeks.slice().sort((a,b)=>b.week-a.week);
  const fmt=t=>t?new Date(t).toLocaleDateString('he-IL',{day:'numeric',month:'numeric'}):'';
  const card=w=>{
    const pl=w.players||S.players, done=[0,0,0], all=[0,0,0];
    (w.chores||[]).forEach(c=>{ all[c.owner]+=c.pts; if(c.done){ if(c.owner===2) done[2]+=c.pts; else done[c.by??c.owner]+=c.pts; } });
    const helps=(w.chores||[]).filter(c=>c.done&&c.owner<2&&c.by!==null&&c.by!==c.owner).length;
    const name=i=>i===2?'ביחד':esc(pl[i]||(i?'שחקן/ית ב':'שחקן/ית א'));
    return `<article class="wk">
      <div class="wk-top"><b>שבוע ${w.week} · ${esc(w.monster||'')}</b><span class="badge ${w.won?'won':'lost'}">${w.won?'הובס ✓':'שרד'}</span></div>
      <span class="hint">${fmt(w.startedAt)}${w.endedAt?' – '+fmt(w.endedAt):''} · ${(w.chores||[]).filter(c=>c.done).length}/${(w.chores||[]).length} מטלות · ${helps} לבבות עזרה</span>
      <div class="wk-bars">${[0,2,1].map(i=>all[i]||done[i]?`<span style="color:${PCOL[i]}">${name(i)}</span><span class="bar"><span class="fill" style="width:${all[i]?Math.min(100,done[i]/all[i]*100):100}%;background:${PCOL[i]}"></span></span><span>${done[i]} נק׳</span>`:'').join('')}</div>
      <details><summary>כל המטלות</summary><ul>${(w.chores||[]).map(c=>`<li><span>${c.done?'✓':'✗'} ${esc(c.name)}</span><span class="who" style="color:${PCOL[c.owner]}">${c.owner===2?'ביחד':name(c.owner)}${c.done&&c.owner<2&&c.by!==c.owner?' · עזרה של '+name(c.by):''}</span></li>`).join('')}</ul></details>
    </article>`;
  };
  const live=S.phase==='week'&&!weeks.some(w=>w.week===S.week)?(()=>{const ws=weekStats(); return `<article class="wk"><div class="wk-top"><b>שבוע ${S.week} · ${esc(monster().name)}</b><span class="badge live">עכשיו</span></div><span class="hint">${ws.list.length-ws.list.filter(c=>!st(c).done).length}/${ws.list.length} מטלות · נשארו ${ws.left} נק׳</span></article>`;})():'';
  return `<section class="panel">
    <div class="wk-top"><h2>היסטוריית השבועות</h2><button class="btn small" data-act="back">חזרה למשחק</button></div>
    <p class="hint">כל שבוע שהסתיים נשמר כאן: מי עשה מה, כמה עזרה הייתה, והאם המפלצת הובסה.</p>
    <div class="weeks">${live}${weeks.map(card).join('')||(!live?'<p class="hint">עוד אין שבועות שהסתיימו. השבוע הראשון יישמר כשתסיימו אותו.</p>':'')}</div>
  </section>`;
}

function render(){
  let body, screen;
  if(ui.mode==='unconfigured'){ body=viewUnconfigured(); screen='unconf'; }
  else if(ui.mode==='boot'||ui.mode==='loading'){ body=viewLoading(); screen='loading'; }
  else if(ui.mode==='landing'){ body=viewLanding(); screen='landing'; }
  else if(ui.mode==='nohouse'){ body=viewNoHouse(); screen='nohouse'; }
  else {
    const me=meIdx();
    if(S.phase==='setup'&&!ui.edit){ ui.edit=clone({players:S.players,reward:S.reward,chores:S.chores}); ui.edit.auto=true; }
    if(S.phase!=='setup'&&ui.edit&&ui.edit.auto) ui.edit=null;
    if(ui.edit){ body=viewSetup(); screen='setup'; }
    else if(me===null){ body=`<section class="panel"><h2>הבית הזה מלא</h2><p class="hint">בבית כבר יש שני שחקנים. אפשר לצאת ולפתוח בית חדש.</p><button class="btn" data-act="leave">${ui.confirm==='leave'?'בטוח? לחיצה נוספת':'יציאה מהבית'}</button></section>`; screen='full'; }
    else if(ui.view==='history'){ body=viewHistory(); screen='history'; }
    else if(S.phase==='draft'){ body=viewDraft(); screen='draft'; }
    else {
      const ws=weekStats();
      if(ui.doneWeek!==S.week){ ui.doneWeek=S.week; ui.wasDone=ws.allDone&&ls.get('mm-won-'+HID+'-'+S.week)==='1'; }
      if(ws.allDone&&!ui.wasDone&&!ui.victoryPlaying) ui.post.push(victory);
      if(!ws.allDone) ui.wasDone=false;
      if(ws.allDone&&ui.wasDone&&!ui.victoryPlaying){ body=viewWon(); screen='won'; }
      else { body=viewWeek(); screen='week'; }
    }
  }
  app.classList.toggle('still',ui.lastScreen===screen); ui.lastScreen=screen;
  const inGame=ui.mode==='game'&&S;
  const me=inGame?meIdx():null;
  const sub=!inGame?'משחק מטלות בית לזוגות':S.phase==='setup'?'הגדרת הבית':`שבוע ${S.week} · ${{draft:'חלוקה',week:'קרב'}[S.phase]||''}`;
  const demoBar=DEMO&&U?`<div class="demo-bar"><span>מצב הדגמה · משחק/ת בתור ${U.uid==='demo-b'?'שחקן/ית ב':'שחקן/ית א'}</span><button data-act="demoswitch">לעבור לשחקן/ית ${U.uid==='demo-b'?'א':'ב'}</button></div>`:'';
  app.innerHTML=`
  <header>
    <div class="logo">${logo()}<div><h1>מפלצת הבלגן</h1><p class="sub">${esc(sub)}</p></div></div>
    <div class="hbtns">
      ${me!==null&&S.phase!=='setup'?`<span class="me" title="${esc(P(me))}" aria-label="משחק/ת בתור ${esc(P(me))}" style="background:${me?'var(--pb-soft)':'var(--pa-soft)'};color:${PCOL[me]}"><i class="dot" style="background:${PCOL[me]}"></i><span class="me-name" style="color:var(--ink)">${esc(P(me))}</span><i class="me-ini" aria-hidden="true">${esc(P(me).slice(0,1).toUpperCase())}</i></span>`:''}
      <button class="btn icon" data-act="mute" aria-label="${ui.muted?'הפעלת צלילים':'השתקת צלילים'}">${ui.muted?'🔇':'🔊'}</button>
      ${inGame&&me!==null&&S.phase!=='setup'&&!ui.edit?`<button class="btn icon" data-act="history" aria-label="היסטוריה">📜</button><button class="btn icon" data-act="settings" aria-label="הגדרות">⚙️</button>`:''}
    </div>
  </header>
  ${demoBar}
  ${body}
  <footer><span>${inGame?`${Object.keys(S.history).length} מפלצות הובסו · רצף ${streak()}`:''}</span><span id="status">${esc(ui.status)}</span></footer>`;
  app.querySelectorAll('[data-anim]').forEach(el=>{const k=el.dataset.anim, p=el.dataset.prop, to=el.dataset.to; const from=ui.prev[k]??to; el.style[p]=from; ui.prev[k]=to; if(from!==to){ void el.offsetWidth; requestAnimationFrame(()=>{el.style[p]=to;}); }});
  if(screen!=='week') ['mscale','f0','f1','f2','g0','g1','g2'].forEach(k=>delete ui.prev[k]);
  if(screen==='week'&&ui.intro){ ui.intro=false; setTimeout(()=>{sfx.roar(); shake(); banner(monster().name+' הופיע/ה!','רמה '+S.week); buzz([80,40,80]);},450); }
  ui.bump=null;
  const post=ui.post; ui.post=[]; post.forEach(f=>f());
}

/* ================= events ================= */
app.addEventListener('input',ev=>{const el=ev.target, k=el.dataset.edit; if(!k) return;
  if(k==='myname'){ ui.joinName=el.value; return; }
  if(k==='joincode'){ ui.joinCode=el.value.toUpperCase(); return; }
  if(!ui.edit) return;
  if(k==='p0') ui.edit.players[0]=el.value; else if(k==='p1') ui.edit.players[1]=el.value; else if(k==='reward') ui.edit.reward=el.value;
  else if(k==='name'){const c=ui.edit.chores.find(x=>x.id===el.dataset.id); if(c) c.name=el.value;}});

function flyCard(owner){
  const card=document.getElementById('card'); if(!card) return;
  const r=card.getBoundingClientRect(); const f=document.createElement('div'); f.className='flycard'; f.textContent=card.querySelector('h2').textContent;
  Object.assign(f.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'}); document.body.appendChild(f);
  const target=document.querySelector(`[data-act="take"][data-o="${owner}"]`); const tr=target?target.getBoundingClientRect():{left:r.left,top:innerHeight,width:0,height:0};
  const dx=tr.left+tr.width/2-(r.left+r.width/2), dy=tr.top+tr.height/2-(r.top+r.height/2);
  const anim=f.animate([{transform:'none',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.15) rotate(${owner===0?40:owner===1?-40:0}deg)`,opacity:.6}],{duration:reduced?1:420,easing:'cubic-bezier(.5,-0.3,.7,1)'});
  anim.onfinish=()=>{f.remove(); const c=target?center(target):[innerWidth/2,innerHeight/2]; burst(c[0],c[1],[PHEX[owner]||'#fff','#fff','#FFC93C'],14,{rmax:7,up:200});};
}
/* deal the current card (or its whole group) to an owner: 0/1 = a player, 2 = together, -1 = not this week */
function takeCard(o,fly){
  const d=S.draft, c=d&&d.deck[d.idx]; if(!c) return false;
  if(fly&&o>=0) flyCard(o);
  sfx.whoosh(); buzz(15);
  const tBefore=totals(S.weekChores);
  const n=ui.groupAll?groupRun(d.deck,d.idx):1;
  for(let k=0;k<n;k++){ const x=d.deck[d.idx]; S.weekChores.push({id:x.id,name:x.name,pts:x.pts,owner:o,group:groupOf(x)}); d.idx++; }
  (d.batches||(d.batches=[])).push(n);
  if(n>1){ ui.groupAll=false; toast('📦',`${n} מטלות ${groupName(groupOf(c))} חולקו יחד`); }
  ui.bump=o>=0&&o<2?o:null;
  const t=totals(S.weekChores);
  setTimeout(sfx.flip,180);
  if(o>=0&&o<2&&t[0]===t[1]&&t[0]>0&&tBefore[0]!==tBefore[1]) setTimeout(()=>{banner('מאוזן בדיוק!'); sfx.chime();},350);
  if(d.idx===d.deck.length) setTimeout(()=>{ if(Math.abs(t[0]-t[1])<=zoneFor(soloTotal())){ sfx.chime(); confettiBurstTop('cheer'); } else sfx.sad(); },400);
  return true;
}

/* Tinder-style swipe on the dealt card: right = player A, left = player B, up = together.
   Directions are physical (screen) directions, matching where each player's button sits in the RTL layout. */
let swipe=null;
app.addEventListener('pointerdown',ev=>{
  const card=ev.target.closest('#card'); if(!card||ev.target.closest('button,input')||ev.button>0) return;
  swipe={card,x:ev.clientX,y:ev.clientY,dx:0,dy:0,id:ev.pointerId,moved:false};
  card.classList.add('dragging'); try{card.setPointerCapture(ev.pointerId)}catch(e){}
});
app.addEventListener('pointermove',ev=>{
  if(!swipe||ev.pointerId!==swipe.id) return;
  swipe.dx=ev.clientX-swipe.x; swipe.dy=ev.clientY-swipe.y;
  if(Math.abs(swipe.dx)+Math.abs(swipe.dy)>6) swipe.moved=true;
  const dir=swipeDir(swipe.dx,swipe.dy,40);
  swipe.card.style.transform=`translate(${swipe.dx}px,${Math.min(swipe.dy,40)}px) rotate(${swipe.dx/18}deg)`;
  swipe.card.querySelectorAll('.swipe-label').forEach(l=>l.style.opacity=l.classList.contains('sl-'+dir)?String(Math.min(1,(Math.max(Math.abs(swipe.dx),-swipe.dy)-30)/70)):'0');
});
function swipeDir(dx,dy,min){ if(-dy>Math.abs(dx)&&-dy>min) return 2; if(dx>min) return 0; if(dx<-min) return 1; return null; }
function endSwipe(ev){
  if(!swipe||ev.pointerId!==swipe.id) return;
  const s=swipe; swipe=null; s.card.classList.remove('dragging');
  const dir=swipeDir(s.dx,s.dy,100);
  if(dir===null){ s.card.style.transform=''; s.card.querySelectorAll('.swipe-label').forEach(l=>l.style.opacity='0'); return; }
  const outX=dir===0?innerWidth:dir===1?-innerWidth:s.dx, outY=dir===2?-innerHeight:s.dy;
  s.card.style.transition='transform .28s ease-in'; s.card.style.transform=`translate(${outX}px,${outY}px) rotate(${dir===2?0:outX/25}deg)`;
  const target=document.querySelector(`[data-act="take"][data-o="${dir}"]`);
  setTimeout(()=>{ if(target){const c=center(target); burst(c[0],c[1],[PHEX[dir],'#fff','#FFC93C'],14,{rmax:7,up:200});} if(takeCard(dir,false)){ save(); ensureSubs(); render(); } },220);
}
app.addEventListener('pointerup',endSwipe);
app.addEventListener('pointercancel',ev=>{ if(swipe&&ev.pointerId===swipe.id){ swipe.card.classList.remove('dragging'); swipe.card.style.transform=''; swipe=null; } });

const inviteLink=()=>location.origin+location.pathname+'?'+(DEMO?'demo=1&':'')+'join='+encodeURIComponent(ui.house.inviteCode);

app.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-act]'); if(!b||b.disabled) return;
  const a=b.dataset.act, id=b.dataset.id, o=Number(b.dataset.o), dd=Number(b.dataset.d);
  audio();
  let persist=true;
  if(!(a==='reset'||a==='leave')) ui.confirm=null;
  switch(a){
    /* account & households */
    case 'signin': ui.err=''; try{ await B.signIn(); }catch(e){ ui.err='ההתחברות נכשלה. נסו שוב.'; render(); } return;
    case 'signout': cleanupHouse(); await B.signOut(); return;
    case 'demoswitch': { cleanupHouse(); ui.mode='loading'; render(); const next=U.uid==='demo-b'?'demo-a':'demo-b'; B.switchDemoUser(next); return; }
    case 'create': {
      ui.busy=true; ui.err=''; render();
      try{ const g=freshGame(); g.players[0]=(ui.joinName||firstName(U.name)).trim(); g.seats=[U.uid,null]; const hid=await B.createHousehold(U.uid,g); ui.busy=false; sfx.chime(); confettiBurstTop('cheer'); openHouse(hid); }
      catch(e){ ui.busy=false; ui.err='לא הצלחנו לפתוח בית. בדקו חיבור ונסו שוב.'; render(); }
      return;
    }
    case 'join': {
      const code=(ui.joinCode||'').trim(); if(code.length<4){ ui.err='הקלידו את הקוד שקיבלתם.'; render(); return; }
      ui.busy=true; ui.err=''; render();
      try{ const hid=await B.joinHousehold(U.uid,code); ui.busy=false; ui.joinCode=''; history.replaceState(null,'',location.pathname+(DEMO?'?demo=1':'')); openHouse(hid); }
      catch(e){ ui.busy=false; ui.err=e.message==='not_found'?'לא מצאנו בית עם הקוד הזה. בדקו שהוא הוקלד נכון.':e.message==='full'?'בבית הזה כבר יש שני שחקנים.':'ההצטרפות נכשלה. נסו שוב.'; render(); }
      return;
    }
    case 'leave': {
      if(ui.confirm!=='leave'){ ui.confirm='leave'; persist=false; break; }
      const g=clone(S); const me=meIdx(); if(me!==null) g.seats[me]=null;
      try{ await B.leaveHousehold(U.uid,HID,g); }catch(e){}
      cleanupHouse(); ui.edit=null; ui.confirm=null; ui.mode='nohouse'; render(); return;
    }
    case 'copyinvite': { const link=inviteLink(); try{ await navigator.clipboard.writeText(link); toast('📋','הקישור הועתק. שלחו אותו לבן/בת הזוג'); }catch(e){ toast('📋','קוד ההזמנה: '+ui.house.inviteCode); } sfx.pop(); return; }
    case 'shareinvite': { try{ await navigator.share({title:'מפלצת הבלגן',text:'בוא/י נביס יחד את מפלצת הבלגן! קוד ההזמנה: '+ui.house.inviteCode,url:inviteLink()}); }catch(e){} return; }
    case 'history': ui.view='history'; persist=false; if(!weeksUnsub) weeksUnsub=B.watchWeeks(HID,list=>{ ui.weeks=list; if(ui.view==='history') render(); },()=>{}); sfx.tap(); break;
    case 'back': ui.view='game'; persist=false; break;
    /* game */
    case 'mute': ui.muted=!ui.muted; ls.set('mm-muted',ui.muted?'1':'0'); if(!ui.muted) sfx.pop(); persist=false; break;
    case 'settings': ui.edit=clone({players:S.players,reward:S.reward,chores:S.chores}); ui.err=''; persist=false; sfx.tap(); break;
    case 'ecancel': ui.edit=null; ui.err=''; persist=false; break;
    case 'ept': {const c=ui.edit.chores.find(x=>x.id===id); if(c) c.pts=clamp(c.pts+dd,1,5); persist=false; sfx.tap(); break;}
    case 'edel': ui.edit.chores=ui.edit.chores.filter(x=>x.id!==id); persist=false; sfx.pop(); break;
    case 'eadd': ui.edit.chores.push({id:uid(),name:'',pts:2}); render(); {const inp=app.querySelector('.deck-edit li:last-child input'); if(inp) inp.focus();} sfx.pop(); return;
    case 'esave': {
      const chores=ui.edit.chores.map(c=>({...c,name:c.name.trim()})).filter(c=>c.name);
      if(chores.length<2){ui.err='צריך לפחות שתי מטלות בחפיסה.'; persist=false; break;}
      S.players=ui.edit.players.map(p=>p.trim()); S.reward=ui.edit.reward.trim(); S.chores=chores;
      if(S.phase==='setup'){ startDraft(); sfx.chime(); confettiBurstTop('cheer'); }
      ui.edit=null; ui.err=''; break;
    }
    case 'dpt': {const c=S.draft.deck[S.draft.idx]; if(c) c.pts=clamp(c.pts+dd,1,5); sfx.tap(); break;}
    case 'take': if(!takeCard(o,true)) return; break;
    case 'groupall': ui.groupAll=b.checked; persist=false; sfx.tap(); break;
    case 'undo': { const d=S.draft; if(!d||d.idx===0) return; const n=Math.min(d.idx,(d.batches&&d.batches.length)?d.batches.pop():1); for(let k=0;k<n;k++){ d.idx--; const cid=d.deck[d.idx].id; S.weekChores=S.weekChores.filter(c=>c.id!==cid); } sfx.tap(); break; }
    case 'move': { const c=S.weekChores.find(x=>x.id===id); if(c&&c.owner>=0) c.owner=c.owner===0?1:c.owner===1?2:0; sfx.pop(); const r=center(b); burst(r[0],r[1],[PHEX[c.owner],'#fff'],10,{rmax:6}); break; }
    case 'startweek': S.weekChores=S.weekChores.filter(c=>c.owner>=0); S.draft=null; S.phase='week'; S.weekStart=Date.now(); ui.intro=true; ui.prev={}; ui.doneWeek=null; break;
    case 'mark': { const c=S.weekChores.find(x=>x.id===id); if(c) await mark(c,b); return; }
    case 'ping': sendPing(b.dataset.k); return;
    case 'reward': if(!ui.rewardOpen){ ui.rewardOpen=true; b.classList.add('open'); sfx.chime(); const c=center(b); setTimeout(()=>burst(c[0],c[1],['#FFC93C','#D63C8E','#3157FF','#fff'],50,{type:'star',max:520}),400); } return;
    case 'reset': if(ui.confirm!=='reset'){ui.confirm='reset'; persist=false; break;} await archiveWeek(); S.week++; startDraft(); ui.confirm=null; break;
    case 'newweek': await archiveWeek(); S.week++; startDraft(); ui.doneWeek=null; ui.wasDone=null; ui.view='game'; sfx.flip(); break;
    default: return;
  }
  if(persist&&ui.mode==='game'){ save(); ensureSubs(); }
  render();
});
app.addEventListener('keydown',ev=>{ if((ev.key==='Enter'||ev.key===' ')&&ev.target.dataset&&ev.target.dataset.act==='reward'){ev.preventDefault(); ev.target.click();} });

/* monster eyes follow your finger */
addEventListener('pointermove',ev=>{
  const svg=document.querySelector('#mwrap svg'); if(!svg) return; const r=svg.getBoundingClientRect();
  svg.querySelectorAll('.pupil').forEach(p=>{const x=r.left+(+p.dataset.x)/200*r.width, y=r.top+((+p.dataset.y)+30)/200*r.height; const dx=ev.clientX-x, dy=ev.clientY-y, d=Math.hypot(dx,dy)||1, m=(+p.dataset.r)*.35; p.style.transform=`translate(${dx/d*m}px,${dy/d*m}px)`;});
},{passive:true});

/* the week is long: refresh clock-based parts and when the phone wakes */
setInterval(()=>{ if(ui.mode==='game'&&S&&S.phase==='week'&&!ui.edit&&!document.querySelector('input:focus')) render(); },300000);
document.addEventListener('visibilitychange',()=>{ if(!document.hidden&&ui.mode==='game'&&!ui.edit) render(); });

/* ================= boot ================= */
async function boot(){
  if(!B){ ui.mode='unconfigured'; render(); return; }
  render();
  try{ await B.init(CONFIG); }catch(e){ ui.mode='unconfigured'; render(); return; }
  B.onAuth(async user=>{
    U=user;
    if(!user){ cleanupHouse(); ui.mode='landing'; render(); return; }
    ui.mode='loading'; ui.err=''; render();
    let hid=null;
    try{ hid=await B.getUserHousehold(user.uid); }catch(e){ hid=null; }
    if(hid){ if(ui.joinCode){ toast('🏠','כבר יש לך בית במשחק, אז הקוד לא נדרש'); ui.joinCode=''; } openHouse(hid); }
    else { ui.mode='nohouse'; render(); }
  });
}
boot();
