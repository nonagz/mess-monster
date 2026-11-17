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
const GAME_KEYS = ['v','phase','players','reward','week','home','chores','draft','weekChores','weekStart','seats','history','prefs','splits'];
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

/* ---- chore groups: related chores are dealt together and listed together ---- */
const GROUPS=[
  {id:'kitchen',name:'מטבח וכלים',re:/כלים|מדיח|מטבח|משטח|כיריים|תנור|מקרר|מיקרוגל/},
  {id:'cooking',name:'בישול',re:/בישול|ארוח/},
  {id:'tidy',name:'סידור',re:/סידור מהיר/},
  {id:'laundry',name:'כביסה',re:/כביס|גיהוץ|מגהץ|מייבש/},
  {id:'floors',name:'רצפות ואבק',re:/אבק|רצפ|ספונג|שואב|טאטוא/},
  {id:'bath',name:'שירותים ומקלחת',re:/שירות|אמבט|מקלחת|כיור/},
  {id:'bedding',name:'מצעים ומגבות',re:/מצע|מגבת|מגבות/},
  {id:'shopping',name:'קניות ותכנון',re:/קני|סופר|מכולת|תכנון/},
  {id:'trash',name:'זבל ומחזור',re:/זבל|מחזור|פחי/},
  {id:'green',name:'צמחים וחיות',re:/עציצ|גינה|השקי|כלב|חתול|חיית|ארגז/}
];
const GROUP_ORDER=GROUPS.map(g=>g.id);
function groupOf(c){ if(c.group) return c.group; const g=GROUPS.find(g=>g.re.test(c.name||'')); return g?g.id:'other'; }
const groupName=id=>(GROUPS.find(g=>g.id===id)||{name:'שונות'}).name;
const byGroup=(a,b)=>{const ga=GROUP_ORDER.indexOf(groupOf(a)), gb=GROUP_ORDER.indexOf(groupOf(b)); return (ga<0?99:ga)-(gb<0?99:gb);};

/* ---- home questions and the researched chore catalog (daily + weekly only; see docs/chore-list.md) ---- */
const HOME_Q=[['dishwasher','יש לנו מדיח'],['dryer','יש מייבש כביסה'],['ironing','מגהצים בגדים'],['plants','יש עציצים'],['dog','יש כלב'],['cat','יש חתול']];
// [id, name, group, timesPerWeek, pointsPerTime, condition, mental]
const CATALOG=[
  ['dishes','שטיפת כלים','kitchen',7,2,'!dishwasher'],
  ['dishwasher','הפעלה ופריקה של המדיח','kitchen',7,2,'dishwasher'],
  ['counters','ניגוב משטחים וכיריים','kitchen',7,1],
  ['fridge','ניקוי מקרר מאוכל שפג','kitchen',1,2],
  ['microwave','ניקוי מיקרוגל','kitchen',1,2],
  ['dinner','הכנת ארוחת ערב','cooking',5,3],
  ['tidy','סידור מהיר של הבית','tidy',7,1],
  ['washer','הפעלת מכונת כביסה','laundry',3,1],
  ['hang','תליית כביסה','laundry',3,2,'!dryer'],
  ['dryer','העברה למייבש','laundry',3,1,'dryer'],
  ['fold','קיפול וסידור כביסה','laundry',3,3],
  ['iron','גיהוץ','laundry',1,3,'ironing'],
  ['vacuum','שאיבת אבק','floors',2,2],
  ['mop','שטיפת רצפה (ספונג׳ה)','floors',1,4],
  ['dust','ניקוי אבק מרהיטים','floors',1,2],
  ['toilet','ניקוי שירותים','bath',1,5],
  ['shower','ניקוי מקלחת וכיורים','bath',1,4],
  ['sheets','החלפת מצעים','bedding',1,2],
  ['towels','החלפת מגבות','bedding',1,1],
  ['bigshop','קניות גדולות בסופר','shopping',1,3],
  ['smallshop','קניות קטנות','shopping',2,2],
  ['mealplan','תכנון ארוחות ורשימת קניות','shopping',1,2,null,true],
  ['trash','הוצאת זבל','trash',4,1],
  ['recycle','הוצאת מחזור','trash',1,1],
  ['water','השקיית עציצים','green',2,1,'plants'],
  ['walkdog','טיול עם הכלב','green',14,2,'dog'],
  ['feeddog','האכלת הכלב','green',7,1,'dog'],
  ['feedcat','האכלת החתול','green',7,1,'cat'],
  ['litter','ניקוי ארגז החול','green',3,3,'cat']
];
const condOk=(cond,home)=>!cond||(cond[0]==='!'?!home[cond.slice(1)]:!!home[cond]);
/* build the house's chore list from the catalog + home answers, keeping the couple's own edits and custom chores */
function buildChores(home,prev){
  const old=new Map((prev||[]).map(c=>[c.id,c]));
  const out=CATALOG.map(([id,name,group,times,pts,cond,mental])=>{
    const o=old.get(id); const avail=condOk(cond,home);
    const userOff=!!(o&&o.userOff);
    return {id,name,group,times:o?o.times:times,pts:o?o.pts:pts,mental:!!mental,cond:cond||null,userOff,on:avail&&!userOff,avail};
  });
  (prev||[]).filter(c=>c.custom).forEach(c=>out.push({...c,avail:true,on:!c.userOff}));
  return out;
}
const DEFAULT_HOME={dishwasher:false,dryer:false,ironing:false,plants:true,dog:false,cat:false};

function freshGame(){
  return {v:3,phase:'setup',players:['',''],reward:'',week:1,home:{...DEFAULT_HOME},chores:buildChores(DEFAULT_HOME,[]),
    draft:null,weekChores:[],weekStart:null,seats:[null,null],history:{},prefs:[null,null]};
}
/* households saved by the older single-mark version are upgraded: same people and history, new setup */
function pickGame(d){
  const g={}; GAME_KEYS.forEach(k=>{ g[k]=d[k]===undefined?null:d[k]; });
  if(!g.history) g.history={}; if(!g.seats) g.seats=[null,null]; if(!g.weekChores) g.weekChores=[]; if(!g.prefs) g.prefs=[null,null]; if(!g.splits) g.splits={};
  if(g.v!==3){ const f=freshGame(); Object.assign(g,{v:3,phase:'setup',home:f.home,chores:f.chores,draft:null,weekChores:[],weekStart:null}); g.upgraded=true; }
  if(!g.home) g.home={...DEFAULT_HOME};
  if(!g.chores) g.chores=buildChores(g.home,[]);
  return g;
}

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
  view:'game', weeks:[], joinCode:(params.get('join')||'').toUpperCase(), busy:false, joinName:'', pane:null, splitA:0, groupAll:false, prof:null };
const app = document.getElementById('app');
app.dir = 'rtl'; app.lang = 'he';
const P = i => ((S && S.players[i] || '').trim() || (i ? 'שחקן/ית ב' : 'שחקן/ית א'));
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
function saveSeen(){ ls.set(seenKey(),JSON.stringify([...seen].slice(-600))); seenInit=true; }
function setStatus(t){ui.status=t; const el=document.getElementById('status'); if(el) el.textContent=t;}

function save(){ if(HID&&S) push(); }
async function push(){
  if(saving){queued=true;return} saving=true;
  const data=clone(S); delete data.upgraded;
  try{ await B.saveHousehold(HID, data); setStatus('מסונכרן'); }catch(e){ setStatus('השמירה נכשלה. בדקו חיבור לאינטרנט'); }
  saving=false; if(queued){queued=false; push();}
}
/* one mark document per time a chore is done: w{week}-{chore}-{owner}-{k}; outsourced checks use "v" instead of the owner */
const markId=(c,p,k)=>`w${S.week}-${c.id}-${c.out?'v':p}-${k}`;
async function putMark(c,p,k){ const id=markId(c,p,k), data={week:S.week,chore:c.id,p,k,by:meIdx(),at:Date.now(),v:!!c.out}; M[id]={...data,_id:id}; seen.add(id); saveSeen(); try{ await B.putMark(HID,id,data); }catch(e){ setStatus('הסימון לא נשמר'); } }
async function delMark(id){ delete M[id]; try{ await B.delMark(HID,id); }catch(e){} }

function cleanupHouse(){
  [houseUnsub,marksUnsub,pingUnsub,weeksUnsub].forEach(f=>f&&f());
  houseUnsub=marksUnsub=pingUnsub=weeksUnsub=null; marksWeek=null; pingFor=null; M={}; S=null; HID=null; ui.view='game'; ui.prev={}; ui.doneWeek=null; ui.edit=null; ui.prof=null;
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
      const me=meIdx(); const partner=fresh.filter(m=>m.by!==me).sort((a,b)=>a.at-b.at);
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
    if(old&&old.phase!=='setup'&&S.phase==='setup'&&!ui.edit) ui.edit=null;
    if(!meta.fromCache) setStatus('מסונכרן');
    let dirty=false;
    if(S.upgraded&&!meta.fromCache){ delete S.upgraded; dirty=true; setTimeout(()=>toast('✨','המשחק התעדכן: מגדירים את הבית מחדש, עם רשימת המטלות החדשה'),300); }
    // take a free seat if this account has none yet
    if(meIdx()===null&&!meta.fromCache){
      const free=S.seats.findIndex(s=>!s||!ui.house.members.includes(s));
      if(free>=0){ S.seats[free]=U.uid; if(!S.players[free]) S.players[free]=ui.joinName||firstName(U.name); dirty=true; setTimeout(()=>{banner('ברוכים הבאים, '+P(free)+'!'); confettiBurstTop('cheer'); sfx.chime();},200); }
    }
    if(dirty) save();
    ui.mode='game'; ensureSubs(); render();
  },()=>{ cleanupHouse(); ui.mode='nohouse'; ui.err='אין גישה לבית הזה. אפשר ליצור בית חדש או להצטרף עם קוד.'; render(); });
}

/* ================= game logic ================= */
function shuffle(a){a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a;}
function groupedShuffle(chores){
  const buckets=new Map();
  chores.forEach(c=>{ const g=groupOf(c); const key=g==='other'?'other-'+c.id:g; if(!buckets.has(key)) buckets.set(key,[]); buckets.get(key).push(c); });
  return shuffle([...buckets.values()]).flatMap(b=>shuffle(b));
}
function groupRun(deck,idx){ const g=groupOf(deck[idx]); if(g==='other') return 1; let n=0; for(let i=idx;i<deck.length&&groupOf(deck[i])===g;i++) n++; return n; }
const activeChores=()=>(S.chores||[]).filter(c=>c.on&&c.avail!==false);
function startDraft(){
  S.draft={deck:groupedShuffle(activeChores()).map(c=>({id:c.id,name:c.name,group:groupOf(c),times:c.times||1,pts:c.pts,mental:!!c.mental})),idx:0,batches:[]};
  S.weekChores=[]; S.phase='draft'; S.weekStart=null; ui.confirm=null; ui.rewardOpen=false; ui.groupAll=false; ui.pane=null;
}
/* points a chore puts on each player this week: owned times × points, or 1 point per time for whoever checks outsourced work */
const ptsEach=c=>c.out?1:c.pts;
const need=(c,p)=>c.skip?0:c.out?(c.out.resp===p?c.times:0):(c.alloc?c.alloc[p]:0);
const load=(c,p)=>need(c,p)*ptsEach(c);
function totals(list){ const t=[0,0]; (list||S.weekChores).forEach(c=>{t[0]+=load(c,0); t[1]+=load(c,1);}); return t; }
const pct=t=>{const s=t[0]+t[1]; if(!s) return [50,50]; const a=Math.round(t[0]/s*100); return [a,100-a];};
function insight(t){
  const [a,b]=pct(t); if(!t[0]&&!t[1]) return '';
  const hiP=a>=b?0:1, hi=Math.max(a,b);
  const prev=S.splits&&S.splits[S.week-1];
  const prevTxt=prev?` בשבוע שעבר: ${prev[0]}/${prev[1]}.`:'';
  if(hi<=55) return `כמעט חצי-חצי (${a}/${b}). מרשים. עכשיו רק לעשות את זה.${prevTxt}`;
  if(hi<=70) return `${P(hiP)} לוקח/ת ${hi}% מהבית השבוע. אם זה מה שסיכמתם — מצוין. אם לא, זה הרגע להזיז מטלה.${prevTxt}`;
  return `${P(hiP)} לוקח/ת ${hi}% מהבית השבוע. זה הרבה על כתף אחת. אם זה מוסכם — סבבה. אם לא, תזיזו משהו.${prevTxt}`;
}
function doneMarks(c,p){ return Object.values(M).filter(m=>m.chore===c.id&&m.week===S.week&&m.p===p&&!!m.v===!!c.out); }
const doneCount=(c,p)=>Math.min(doneMarks(c,p).length,need(c,p));
function weekStats(){
  const list=S.weekChores.filter(c=>!c.skip), tot=[0,0], rem=[0,0];
  list.forEach(c=>{ for(const p of [0,1]){ tot[p]+=load(c,p); rem[p]+=(need(c,p)-doneCount(c,p))*ptsEach(c); } });
  const all=tot[0]+tot[1], left=rem[0]+rem[1];
  return {list,tot,rem,all,left,allDone:all>0&&left===0};
}
function dayIndex(){ if(!S.weekStart) return 0; const s=new Date(S.weekStart); s.setHours(0,0,0,0); return Math.floor((Date.now()-s.getTime())/DAY); }
function pace(ws){
  const di=dayIndex(), expected=clamp((di+1)/7,0,1), done=ws.all?(ws.all-ws.left)/ws.all:0;
  if(di>=7) return {mood:'over',text:'השבוע נגמר'};
  if(done>=expected) return {mood:'scared',text:'המפלצת מתחילה לפחד. ככה.'};
  if(done<expected-.15) return {mood:'angry',text:'המפלצת מתחזקת. אל תתנו לה.'};
  return {mood:'normal',text:'המפלצת מחכה. אתם לא.'};
}
function streak(){ if(!S) return 0; let n=0; for(let w=S.week-(S.history[S.week]?0:1); w>=1; w--){ if(S.history[w]) n++; else break; } return n; }
const hearts=()=>{const h=[0,0]; Object.values(M).forEach(m=>{ if(!m.v&&m.by!=null&&m.by!==m.p) h[m.by]++; }); return h;};

async function plusOne(c,p,btn){
  const me=meIdx(); if(me===null) return;
  const have=new Set(doneMarks(c,p).map(m=>m.k)); let k=-1; for(let i=0;i<need(c,p);i++){ if(!have.has(i)){k=i;break;} }
  if(k<0) return;
  const from=center(btn);
  await putMark(c,p,k);
  render();
  const now=Date.now(); ui.combo.n=(now-ui.combo.t<90000)?ui.combo.n+1:1; ui.combo.t=now;
  const w=document.getElementById('mwrap'); const to=w?center(w):[innerWidth/2,200];
  const color=c.out?PHEX[2]:PHEX[p];
  sfx.whoosh();
  projectile(from,to,color,()=>{
    hitMonster(ptsEach(c),color,false);
    const finished=doneCount(c,p)>=need(c,p);
    if(ui.combo.n>=3) setTimeout(()=>{banner('קומבו ×'+ui.combo.n,'ככה מדברים איתה'); sfx.combo(ui.combo.n);},250);
    else if(finished&&need(c,p)>1) setTimeout(()=>toast('✅',`${c.name}: סגרת את השבוע. יפה.`),300);
    if(!c.out&&p!==me) setTimeout(()=>toast('❤️',`עשית אחת של ${P(p)}. לב עזרה נרשם.`),500);
  });
}
async function minusOne(c,p){
  const ms=doneMarks(c,p).sort((a,b)=>b.k-a.k); if(!ms.length) return;
  await delMark(ms[0]._id); sfx.tap(); render();
}

async function replayPartner(list){
  const me=meIdx();
  if(list.length>3) toast('🧹',`בזמן שלא היית: ${P(list[0].by)} סימן/ה ${list.length} פעמים. תורך להדביק את הקצב.`);
  for(const m of list.slice(-4)){
    const c=S.weekChores.find(x=>x.id===m.chore); if(!c) continue;
    toast(c.out?'🔍':'🧽',c.out?`${P(m.by)} וידא/ה: ${c.name}`:`${P(m.by)} ביצע/ה: ${c.name}`);
    const w=document.getElementById('mwrap');
    const color=c.out?PHEX[2]:PHEX[m.p];
    if(w){ const to=center(w); await new Promise(r=>projectile([to[0]+(m.by===0?140:-140),-20],to,color,()=>{hitMonster(ptsEach(c),color,false); r();})); }
    if(!c.out&&m.p===me&&m.by!==me) setTimeout(()=>toast('❤️',`${P(m.by)} עשה/תה אחת שלך. תגידו תודה.`),400);
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

async function archiveWeek(){
  if(!S||S.phase!=='week'||!S.weekChores.length) return;
  const ws=weekStats();
  const chores=ws.list.map(c=>({name:c.name,group:groupOf(c),pts:c.pts,times:c.times,alloc:c.alloc||[0,0],out:c.out||null,done:[doneCount(c,0),doneCount(c,1)]}));
  try{ await B.saveWeek(HID,S.week,{week:S.week,v:3,monster:monster().name,startedAt:S.weekStart||null,endedAt:Date.now(),players:S.players,won:!!S.history[S.week],tot:ws.tot,left:ws.left,split:pct(ws.tot),hearts:hearts(),chores}); }catch(e){}
}

function victory(){
  ui.victoryPlaying=true; ls.set('mm-won-'+HID+'-'+S.week,'1');
  const w=document.getElementById('mwrap');
  if(w){ w.classList.add('die'); const c=center(w); setTimeout(()=>{ burst(c[0],c[1],[monster().body,monster().dark,'#fff','#FFC93C'],70,{type:'dot',max:620,rmax:14}); bubbles(c[0],c[1],30); shake(); sfx.hit(); buzz([60,40,120]); },650); }
  if(!S.history[S.week]){ S.history[S.week]={at:Date.now()}; save(); }
  archiveWeek();
  setTimeout(()=>{ ui.victoryPlaying=false; ui.wasDone=true; render(); sfx.win(); confettiRain(2600); banner(monster().name+' הובס!','הבית שלכם'); },1500);
}

/* ================= views ================= */
function logo(){const m=monster(); return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><path d="M6 26 C4 12 13 4 20 4 C28 4 37 12 34 26 C33 33 29 35 27 33 C25 37 22 37 20 34 C18 37 14 37 13 33 C10 35 7 33 6 26Z" fill="${m.body}" stroke="#16161F" stroke-width="2.5"/><circle cx="15" cy="17" r="4.5" fill="#fff" stroke="#16161F" stroke-width="2"/><circle cx="26" cy="17" r="3.5" fill="#fff" stroke="#16161F" stroke-width="2"/><circle cx="16" cy="18" r="2" fill="#16161F"/><circle cx="26.5" cy="18" r="1.6" fill="#16161F"/><path d="M14 25 Q20 30 26 25" stroke="#16161F" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;}
const GOOGLE_G=`<svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

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
    <p>משחק שבועי לזוגות: מחלקים את המטלות, כל אחד מסמן מהטלפון שלו, וכל מטלה שבוצעה מורידה למפלצת חיים. בסוף השבוע מחכה לכם פרס משותף.</p>
    ${agreedCallout()}
    ${DEMO?`<button class="btn primary big" data-act="signin">להתחיל הדגמה</button>`
      :`<button class="btn google big" data-act="signin">${GOOGLE_G}התחברות עם Google</button>`}
    ${ui.joinCode?`<p class="hint">יש לך קוד הזמנה: <b dir="ltr">${esc(ui.joinCode)}</b>. אחרי ההתחברות תצטרפו ישר לבית.</p>`:''}
    ${ui.err?`<p class="err">${esc(ui.err)}</p>`:''}
  </section>
  <section class="panel">
    <div class="howto">
      <div><b>1. נרשמים</b><span>כל אחד מהטלפון שלו, עם קוד הזמנה.</span></div>
      <div><b>2. מגדירים</b><span>מה יש בבית, ובמה כל אחד מכם תותח.</span></div>
      <div><b>3. מחלקים ומביסים</b><span>כל שבוע חלוקה, מפלצת חדשה, ותמונה אמיתית של מי עושה מה.</span></div>
    </div>
  </section>`;
}
function agreedCallout(){
  return `<div class="callout ok"><b>חלוקה מוסכמת, לא בהכרח שווה</b>
    <span>המטרה היא לא 50/50 בכל מחיר. 60/40 או 70/30 זה בסדר גמור, כל עוד שניכם מסכימים. המשחק רק מראה לכם את המספרים בפועל, ואתם מחליטים.</span></div>`;
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

/* ---------------- setup: home questions + chore catalog ---------------- */
function viewSetup(){
  const e=ui.edit, isSetup=S.phase==='setup';
  const on=e.chores.filter(c=>c.on&&c.avail!==false);
  const weekly=on.reduce((s,c)=>s+(c.times||1)*c.pts,0);
  const groups=[...new Set(e.chores.map(groupOf))].sort((a,b)=>{const i=g=>{const x=GROUP_ORDER.indexOf(g); return x<0?99:x;}; return i(a)-i(b);});
  const row=c=>{ const avail=c.avail!==false, act=c.on&&avail;
    return `<li class="crow ${act?'':'off'} ${avail?'':'na'}">
      <button class="tog ${act?'on':''}" data-act="ctog" data-id="${c.id}" aria-pressed="${act}" aria-label="${act?'להוציא מהחפיסה':'להכניס לחפיסה'}: ${esc(c.name)}" ${avail?'':'disabled'}><i></i></button>
      <span class="cname">${c.mental?'🧠 ':''}${esc(c.name)}<small>${avail?`${c.times}× בשבוע · ${c.pts} נק׳ לפעם`:'לא אצלכם'}</small></span>
      ${act?`<span class="mini" aria-label="פעמים בשבוע"><button data-act="ctimes" data-id="${c.id}" data-d="-1" aria-label="פחות פעמים">−</button><b>${c.times}×</b><button data-act="ctimes" data-id="${c.id}" data-d="1" aria-label="יותר פעמים">+</button></span>
        <span class="mini" aria-label="נקודות לפעם"><button data-act="cpts" data-id="${c.id}" data-d="-1" aria-label="פחות נקודות">−</button><b>${c.pts}</b><button data-act="cpts" data-id="${c.id}" data-d="1" aria-label="יותר נקודות">+</button></span>`:''}
      ${c.custom?`<button class="del" data-act="cdel" data-id="${c.id}" aria-label="מחיקת ${esc(c.name)}">×</button>`:''}
    </li>`; };
  return `
  ${isSetup?invitePanel():''}
  ${isSetup?`<section class="panel">${agreedCallout()}</section>`:''}
  <section class="panel">
    <h2>מי משחק?</h2>
    <div class="row2">
      <label><span><i class="dot" style="background:var(--pa)"></i>שחקן/ית א</span><input id="p0" data-edit="p0" value="${esc(e.players[0])}" placeholder="שם" maxlength="14" autocomplete="off"></label>
      <label><span><i class="dot" style="background:var(--pb)"></i>שחקן/ית ב</span><input id="p1" data-edit="p1" value="${esc(e.players[1])}" placeholder="שם" maxlength="14" autocomplete="off"></label>
    </div>
  </section>
  <section class="panel">
    <h2>מה יש אצלכם בבית?</h2>
    <p class="hint">ספרו לנו. על מה שאין לכם, לא נציק לכם. על כל השאר — כן.</p>
    <div class="chips">${HOME_Q.map(([k,l])=>`<button class="chip q ${e.home[k]?'on':''}" data-act="hq" data-k="${k}" aria-pressed="${!!e.home[k]}">${e.home[k]?'✓ ':''}${esc(l)}</button>`).join('')}</div>
  </section>
  <section class="panel">
    <h2>החפיסה שלכם</h2>
    <p class="hint">מטלות יומיות ושבועיות, לפי המחקר. מה שכבוי לא ייכנס לחלוקה. אל תכבו את השירותים. אנחנו רואים אתכם.</p>
    <div class="totals"><b>${on.length} מטלות · ${weekly} נק׳ בשבוע</b><span>בערך ${Math.round(weekly*8/60)} שעות לשניכם</span></div>
    ${groups.map(g=>`<h3 class="gh">${esc(groupName(g))}</h3><ul class="clist">${e.chores.filter(c=>groupOf(c)===g).map(row).join('')}</ul>`).join('')}
    <div class="joinrow addrow"><input id="newchore" data-edit="newchore" value="${esc(e.newName||'')}" placeholder="מטלה משלכם, למשל: ניקוי מרפסת" maxlength="40" autocomplete="off"><button class="btn small" data-act="cadd">הוספה</button></div>
  </section>
  <section class="panel">
    <h2>הפרס המשותף</h2>
    <input id="reward" data-edit="reward" value="${esc(e.reward)}" placeholder="למשל: ערב סרט עם פיצה" maxlength="60" autocomplete="off">
    ${ui.err?`<p class="err">${esc(ui.err)}</p>`:''}
    ${!isSetup&&S.phase==='week'?`<p class="hint">שינויים בחפיסה ייכנסו לחלוקה של השבוע הבא.</p>`:''}
    <div class="actions">
      <button class="btn primary big" data-act="esave">${isSetup?'זה הבית. לחלוקה':'שמירה'}</button>
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

/* ---------------- profile: strengths per chore group ---------------- */
function viewProfile(onboard){
  const me=meIdx(), pr=ui.prof;
  const groups=GROUP_ORDER.filter(g=>activeChores().some(c=>groupOf(c)===g));
  const opts=[['avoid','מעדיף/ה לוותר'],['neutral','ניטרלי'],['strong','חזק/ה בזה']];
  return `<section class="panel">
    ${onboard?'<p class="eyebrow">עוד רגע מתחילים</p>':''}
    <h2>${onboard?'ספרו לנו במה אתם תותחים. ובמה אתם מתחמקים.':'הפרופיל שלי'}</h2>
    <p class="hint">${onboard?'המשחק יציע לך מטלות שאת/ה טוב/ה בהן, ויתחשב במה שפחות נעים לך. אפשר לדלג ולשנות בכל זמן מהכפתור עם האות שלך בכותרת.':'השתנה משהו? גיליתם שאתם תותחי כביסה? עדכנו. החלוקה הבאה תתחשב בזה.'}</p>
    <label class="fld"><span>השם שלך במשחק</span><input id="profname" data-edit="profname" value="${esc(pr.name)}" maxlength="14" autocomplete="off"></label>
    <div class="prefs">${groups.map(g=>`<div class="pref"><b>${esc(groupName(g))}</b><div class="seg" role="group" aria-label="${esc(groupName(g))}">${opts.map(([v,l])=>`<button class="${(pr.prefs[g]||'neutral')===v?'sel '+v:''}" data-act="pref" data-g="${g}" data-v="${v}" aria-pressed="${(pr.prefs[g]||'neutral')===v}">${l}</button>`).join('')}</div></div>`).join('')}</div>
    <p class="hint">${esc(P(1-me))} יראה/תראה את הבחירות שלך, ואת/ה את שלו/שלה.</p>
    <div class="actions">
      <button class="btn primary big" data-act="psave">${onboard?'המשך':'שמירה'}</button>
      <button class="btn" data-act="${onboard?'pskip':'pcancel'}">${onboard?'דילוג':'ביטול'}</button>
    </div>
  </section>`;
}

/* ---------------- draft ---------------- */
function splitMeter(t){
  const [a,b]=pct(t);
  return `<div class="split" aria-label="חלוקה בפועל">
    <div class="split-top"><span style="color:var(--pa)">${esc(P(0))} <span class="num ${ui.bump===0?'bump':''}">${a}%</span><small>${t[0]} נק׳</small></span><span style="color:var(--pb)"><small>${t[1]} נק׳</small><span class="num ${ui.bump===1?'bump':''}">${b}%</span> ${esc(P(1))}</span></div>
    <div class="sbar"><i data-anim="sa" data-prop="width" data-to="${a}%" style="background:var(--pa)"></i><i data-anim="sb" data-prop="width" data-to="${b}%" style="background:var(--pb)"></i></div>
    <div class="meter-cap"><span>החלוקה בפועל, לפי נקודות לשבוע</span></div>
  </div>`;
}
function hintsFor(g){
  const pr=S.prefs||[]; const s=[0,1].map(p=>(pr[p]||{})[g]||'neutral');
  if(s[0]==='avoid'&&s[1]==='avoid') return `<span class="hint-pill warn">שניכם מתחמקים מזה. אולי מיקור חוץ?</span>`;
  return [0,1].map(p=>s[p]==='strong'?`<span class="hint-pill ok">${esc(P(p))} חזק/ה בזה. שקלו את זה.</span>`:s[p]==='avoid'?`<span class="hint-pill warn">${esc(P(p))} מעדיף/ה לוותר</span>`:'').join('');
}
function viewDraft(){
  const d=S.draft, N=d.deck.length, t=totals();
  if(d.idx<N){
    const c=d.deck[d.idx], left=N-d.idx, cardKey=S.week+'-'+d.idx, sameCard=ui.lastCard===cardKey; ui.lastCard=cardKey;
    const g=groupOf(c); let gStart=d.idx; while(g!=='other'&&gStart>0&&groupOf(d.deck[gStart-1])===g) gStart--;
    const gTotal=g==='other'?1:groupRun(d.deck,gStart), gPos=d.idx-gStart+1, gLeft=groupRun(d.deck,d.idx);
    const tag=g==='other'?'מטלה':`${groupName(g)}${gTotal>1?` · ${gPos} מתוך ${gTotal}`:''}`;
    const meta=c.times>1?`${c.times}× בשבוע · ${c.pts} נק׳ לפעם · ${c.times*c.pts} נק׳ בשבוע`:`פעם בשבוע · ${c.pts} נק׳`;
    if(ui.pane==='split'&&(ui.splitA<0||ui.splitA>c.times)) ui.splitA=Math.ceil(c.times/2);
    return `
    ${invitePanel()}
    <p class="eyebrow" style="color:#fff">חלוקת שבוע ${S.week} · קלף ${d.idx+1} מתוך ${N}</p>
    <section class="panel" style="animation:none">${splitMeter(t)}</section>
    <div class="table">
      <div class="stack">
        ${left>2?'<div class="ghostcard" style="transform:translate(8px,10px) rotate(4deg)"></div>':''}
        ${left>1?'<div class="ghostcard" style="transform:translate(-6px,5px) rotate(-3deg)"></div>':''}
        <div class="card ${sameCard?'still':''}" id="card">
          <span class="swipe-label sl-0" aria-hidden="true">${esc(P(0))}</span><span class="swipe-label sl-1" aria-hidden="true">${esc(P(1))}</span><span class="swipe-label sl-2" aria-hidden="true">פיצול</span>
          <span class="tag">${esc(tag)}</span>
          <h2>${c.mental?'🧠 ':''}${esc(c.name)}</h2>
          <p class="cmeta">${meta}</p>
          <div class="cardsteps">
            <span class="mini"><button data-act="dtimes" data-d="-1" aria-label="פחות פעמים">−</button><b>${c.times}×</b><button data-act="dtimes" data-d="1" aria-label="יותר פעמים">+</button></span>
            <span class="mini"><button data-act="dpt" data-d="-1" aria-label="פחות נקודות">−</button><b>${c.pts} נק׳</b><button data-act="dpt" data-d="1" aria-label="יותר נקודות">+</button></span>
          </div>
          <div class="hints">${hintsFor(g)}</div>
        </div>
      </div>
      <div class="take two">
        <button class="btn bpa" data-act="take" data-o="0">${esc(P(0))}<small>לוקח/ת${c.times>1?' הכול':''}</small></button>
        <button class="btn bpb" data-act="take" data-o="1">${esc(P(1))}<small>לוקח/ת${c.times>1?' הכול':''}</small></button>
      </div>
      <div class="take two">
        ${c.times>1?`<button class="btn ${ui.pane==='split'?'primary':''}" data-act="pane" data-k="split">לפצל<small>חלק לכל אחד</small></button>`:''}
        <button class="btn ${ui.pane==='out'?'primary':''}" data-act="pane" data-k="out">מיקור חוץ<small>מנקה, משלוח…</small></button>
      </div>
      ${ui.pane==='split'?`<div class="pane">
        <b>כמה פעמים לכל אחד?</b>
        <div class="splitrow"><span style="color:var(--pa)">${esc(P(0))}</span><span class="mini big"><button data-act="splitm" data-d="-1" aria-label="פחות ל${esc(P(0))}">−</button><b>${ui.splitA}</b><button data-act="splitm" data-d="1" aria-label="יותר ל${esc(P(0))}">+</button></span><span>·</span><b style="color:var(--pb)">${c.times-ui.splitA}</b><span style="color:var(--pb)">${esc(P(1))}</span></div>
        <button class="btn primary" data-act="dosplit">לפצל ככה</button>
      </div>`:''}
      ${ui.pane==='out'?`<div class="pane">
        <b>מי מוודא/ת שזה באמת בוצע?</b>
        <span class="hint">מיקור חוץ זה מצוין. אבל מישהו צריך לבדוק. זה נספר לו/לה כנקודה לכל פעם.</span>
        <div class="take two"><button class="btn bpa" data-act="doout" data-o="0">${esc(P(0))}</button><button class="btn bpb" data-act="doout" data-o="1">${esc(P(1))}</button></div>
      </div>`:''}
      ${gLeft>1&&ui.pane!=='split'?`<label class="groupall"><input type="checkbox" id="groupall" data-act="groupall" ${ui.groupAll?'checked':''}> להחיל על כל ${gLeft} מטלות ה${esc(groupName(g))} שנשארו</label>`:''}
      <p class="swipe-hint">אפשר גם להחליק: ימינה ל${esc(P(0))}, שמאלה ל${esc(P(1))}${c.times>1?', למעלה לפיצול שווה':''}</p>
      <div class="minor">
        <button class="btn small" data-act="skip">לא צריך השבוע</button>
        <button class="btn small" data-act="undo" ${d.idx===0?'disabled':''}>ביטול הקלף הקודם</button>
      </div>
    </div>`;
  }
  const list=S.weekChores.filter(c=>!c.skip);
  const chipsFor=p=>list.filter(c=>!c.out&&need(c,p)>0).sort(byGroup).map(c=>`<button class="chip" data-act="move" data-id="${c.id}" data-p="${p}" title="להעביר פעם אחת ל${esc(P(1-p))}">${esc(c.name)}${c.times>1?` ×${need(c,p)}`:''} <b>${load(c,p)}</b></button>`).join('')||'<span class="hint">אין מטלות</span>';
  const outs=list.filter(c=>c.out);
  return `
  <section class="panel">
    <p class="eyebrow">חלוקת שבוע ${S.week} · סיכום</p>
    ${splitMeter(t)}
    <div class="callout insight"><b>מה יצא לכם</b><span>${esc(insight(t))}</span></div>
    <div class="groups">
      <div class="grp"><h3 style="color:var(--pa)">${esc(P(0))} <small>${t[0]} נק׳</small></h3><div class="chips">${chipsFor(0)}</div></div>
      <div class="grp"><h3 style="color:var(--pb)">${esc(P(1))} <small>${t[1]} נק׳</small></h3><div class="chips">${chipsFor(1)}</div></div>
      ${outs.length?`<div class="grp"><h3 style="color:var(--pj)">מיקור חוץ <small>${outs.length}</small></h3><div class="chips">${outs.map(c=>`<button class="chip" data-act="outswap" data-id="${c.id}" title="להחליף מי מוודא/ת">${esc(c.name)} · ${esc(P(c.out.resp))} מוודא/ת</button>`).join('')}</div></div>`:''}
    </div>
    <p class="hint">לחיצה על מטלה מעבירה פעם אחת ממנה לצד השני. לחיצה על מיקור חוץ מחליפה מי מוודא/ת.</p>
    <div class="actions">
      <button class="btn primary big pulse" data-act="startweek" ${list.length?'':'disabled'}>יוצאים לקרב!</button>
      <button class="btn" data-act="undo">חזרה לקלף האחרון</button>
    </div>
  </section>`;
}

/* ---------------- week ---------------- */
function viewWeek(){
  const ws=weekStats(), m=monster(), me=meIdx(), pc=pace(ws), di=dayIndex();
  const frac=ws.all?ws.left/ws.all:0, scale=.45+.55*frac;
  const hp=i=>ws.tot[i]?`<div class="hprow"><span class="nm" style="color:${PCOL[i]}">${esc(P(i))}</span>
    <span class="bar"><span class="ghost" data-anim="g${i}" data-prop="width" data-to="${ws.rem[i]/ws.tot[i]*100}%"></span><span class="fill" style="background:${PCOL[i]}" data-anim="f${i}" data-prop="width" data-to="${ws.rem[i]/ws.tot[i]*100}%"></span></span>
    <span class="num">${ws.rem[i]}/${ws.tot[i]}</span></div>`:'';
  const start=new Date(S.weekStart||Date.now()); start.setHours(0,0,0,0);
  const marksAll=Object.values(M);
  const days=Array.from({length:7},(_,i)=>{const ds=start.getTime()+i*DAY; const dm=marksAll.filter(x=>x.at>=ds&&x.at<ds+DAY); const dt=new Date(ds);
    return `<div class="day ${i<di?'past':''} ${i===di?'today':''}"><span>${DAYL[dt.getDay()]}</span><span class="ds">${dm.slice(0,8).map(x=>`<i style="background:${PCOL[x.by??x.p]}"></i>`).join('')}</span></div>`;}).join('');
  const task=(c,p)=>{const n=need(c,p), d=doneCount(c,p), full=d>=n;
    const segs=Array.from({length:n},(_,k)=>`<i class="${k<d?'on':''}" style="${k<d?`background:${c.out?PCOL[2]:PCOL[p]}`:''}"></i>`).join('');
    return `<div class="task2 ${full?'done':''}">
      <div class="t-top">
        <button class="plus" data-act="plus" data-id="${c.id}" data-p="${p}" ${full?'disabled':''} aria-label="${c.out?'וידאתי':'עשיתי'}: ${esc(c.name)}">${full?'✓':c.out?'וידאתי':'עשיתי'}</button>
        <span class="t-name">${c.mental?'🧠 ':''}${esc(c.name)}<small>${d}/${n} השבוע · −${ptsEach(c)} לפעם${c.out?' · מיקור חוץ':''}</small></span>
        ${d>0?`<button class="minus" data-act="minus" data-id="${c.id}" data-p="${p}" aria-label="ביטול פעם אחת">−</button>`:''}
      </div>
      ${n>1?`<div class="segs">${segs}</div>`:''}
    </div>`;};
  const listFor=(items,p)=>{ let last=null; return items.slice().sort(byGroup).map(c=>{ const g=groupOf(c); const lab=g!==last&&g!=='other'?`<span class="glabel">${esc(groupName(g))}</span>`:''; last=g; return lab+task(c,p); }).join(''); };
  const mine=ws.list.filter(c=>!c.out&&need(c,me)>0), theirs=ws.list.filter(c=>!c.out&&need(c,1-me)>0);
  const myOut=ws.list.filter(c=>c.out&&c.out.resp===me), theirOut=ws.list.filter(c=>c.out&&c.out.resp!==me);
  const myLeft=mine.reduce((s,c)=>s+need(c,me)-doneCount(c,me),0)+myOut.reduce((s,c)=>s+need(c,me)-doneCount(c,me),0);
  const group=(title,items,p,col,extra)=>items.length?`<div class="grp"><h3 style="color:${col}">${title} <small>${items.reduce((s,c)=>s+doneCount(c,p),0)}/${items.reduce((s,c)=>s+need(c,p),0)}</small></h3>${extra||''}<div class="tasks">${listFor(items,p)}</div></div>`:'';
  return `
  ${invitePanel()}
  <div class="arena ${pc.mood}">
    ${ui.combo.n>=2&&Date.now()-ui.combo.t<90000?`<span class="combo">קומבו ×${ui.combo.n}</span>`:''}
    <div class="nameplate"><span class="lvl">רמה ${S.week}</span><h2>${esc(m.name)}</h2><span class="hint">${esc(m.sub)}</span></div>
    <div class="mwrap ${ui.intro?'intro':''}" id="mwrap"><div class="mscale" data-anim="mscale" data-prop="transform" data-to="scale(${scale})"><div class="mhit">${monsterSVG(m,pc.mood)}</div></div></div>
    <span class="mood ${pc.mood}">${esc(pc.text)} · נשארו ${ws.left} נק׳${di<7?` ו־${7-di} ימים`:''}</span>
    <div class="hp">${hp(0)}${hp(1)}</div>
  </div>
  ${di>=7?`<section class="panel"><p class="verdict warn">השבוע נגמר והמפלצת שרדה הפעם. אפשר להמשיך לנקות, או לחלק מחדש.</p><button class="btn primary" data-act="newweek">חלוקה לשבוע ${S.week+1}</button></section>`:''}
  <section class="panel" style="animation-delay:.05s">
    <div class="days">${days}</div>
    ${myLeft?`<p class="nudge">${myLeft===1?'נשארה לך פעם אחת השבוע. סגור/סגרי את זה.':`נשארו לך ${myLeft} פעמים השבוע. הן לא יעשו את עצמן.`}</p>`:mine.length||myOut.length?`<p class="nudge ok">סיימת את שלך. מפואר. אפשר לעזור ל${esc(P(1-me))} ולקבל לב.</p>`:''}
    ${group('המשימות שלי',mine,me,PCOL[me])}
    ${group('לוודא שבוצע (מיקור חוץ)',myOut,me,PCOL[2],'<p class="hint">מישהו אחר עושה את העבודה. את/ה רק מוודא/ת. זה עדיין נחשב.</p>')}
    ${group('של '+esc(P(1-me)),theirs,1-me,PCOL[1-me])}
    ${group(esc(P(1-me))+' מוודא/ת',theirOut,1-me,PCOL[2])}
    <p class="hint">עשית משהו של ${esc(P(1-me))}? סמנו אצלו/אצלה. זה נספר לצד שלו/שלה, ואת/ה מקבל/ת לב עזרה.</p>
  </section>
  <div class="cheer">
    <button class="btn" data-act="ping" data-k="cheer">🙌 כיף ל${esc(P(1-me))}</button>
    <button class="btn" data-act="ping" data-k="thanks">❤️ תודה ל${esc(P(1-me))}</button>
  </div>
  <div class="minor"><button class="btn small" data-act="reset">${ui.confirm==='reset'?'בטוח? לחיצה נוספת פותחת חלוקה חדשה':'לסיים את השבוע ולחלק מחדש'}</button></div>`;
}

function viewWon(){
  const ws=weekStats(), m=monster(), h=hearts(), [a,b]=pct(ws.tot);
  return `
  <section class="panel win">
    <p class="eyebrow">שבוע ${S.week} · רמה ${S.week}</p>
    <div class="stamp">הובס!</div>
    <h2 style="font-size:32px">${esc(m.name)} ברח בבושת פנים</h2>
    <div class="reward ${ui.rewardOpen?'open':''}" data-act="reward" role="button" tabindex="0" aria-label="חשיפת הפרס">
      <div class="reward-in"><div class="face front">לחצו לגלות את הפרס</div><div class="face back">${esc(S.reward||'תבחרו יחד משהו כיף')}</div></div>
    </div>
    <div class="statrow">
      <div class="stat"><b>${ws.all}</b><span>נזק כולל</span></div>
      <div class="stat"><b>${a}/${b}</b><span>החלוקה בפועל</span></div>
      <div class="stat"><b>${h[0]+h[1]}</b><span>לבבות עזרה</span></div>
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
    const pl=w.players||S.players, name=i=>esc(pl[i]||(i?'שחקן/ית ב':'שחקן/ית א'));
    const v3=w.v===3, ch=w.chores||[];
    const done=[0,0], all=[0,0]; let helps=0;
    if(v3){ ch.forEach(c=>{ for(const p of [0,1]){ const n=c.out?(c.out.resp===p?c.times:0):(c.alloc||[0,0])[p], e=c.out?1:c.pts; all[p]+=n*e; done[p]+=Math.min((c.done||[0,0])[p],n)*e; } }); helps=(w.hearts||[0,0]).reduce((s,x)=>s+x,0); }
    else { ch.forEach(c=>{ if(c.owner<2){ all[c.owner]+=c.pts; if(c.done) done[c.owner]+=c.pts; } }); helps=ch.filter(c=>c.done&&c.owner<2&&c.by!=null&&c.by!==c.owner).length; }
    const split=w.split||pct(all);
    const line=c=>{ if(!v3) return `<li><span>${c.done?'✓':'✗'} ${esc(c.name)}</span></li>`;
      if(c.out) return `<li><span>${(c.done||[0,0])[c.out.resp]>=c.times?'✓':'✗'} ${esc(c.name)}</span><span class="who" style="color:var(--pj)">מיקור חוץ · ${name(c.out.resp)} מוודא/ת</span></li>`;
      return `<li><span>${esc(c.name)}</span><span class="who">${[0,1].filter(p=>(c.alloc||[0,0])[p]).map(p=>`<span style="color:${PCOL[p]}">${name(p)} ${(c.done||[0,0])[p]}/${c.alloc[p]}</span>`).join(' · ')}</span></li>`; };
    return `<article class="wk">
      <div class="wk-top"><b>שבוע ${w.week} · ${esc(w.monster||'')}</b><span class="badge ${w.won?'won':'lost'}">${w.won?'הובס ✓':'שרד'}</span></div>
      <span class="hint">${fmt(w.startedAt)}${w.endedAt?' – '+fmt(w.endedAt):''} · חלוקה ${split[0]}/${split[1]} · ${helps} לבבות עזרה</span>
      <div class="wk-bars">${[0,1].map(i=>`<span style="color:${PCOL[i]}">${name(i)}</span><span class="bar"><span class="fill" style="width:${all[i]?Math.min(100,done[i]/all[i]*100):0}%;background:${PCOL[i]}"></span></span><span>${done[i]}/${all[i]}</span>`).join('')}</div>
      <details><summary>כל המטלות</summary><ul>${ch.map(line).join('')}</ul></details>
    </article>`;
  };
  return `<section class="panel">
    <div class="wk-top"><h2>היסטוריית השבועות</h2><button class="btn small" data-act="back">חזרה למשחק</button></div>
    <p class="hint">כל שבוע שהסתיים נשמר כאן: איך התחלקתם, מי עשה מה, וכמה עזרה הייתה.</p>
    <div class="weeks">${weeks.map(card).join('')||'<p class="hint">עוד לא ניצחתם אף מפלצת. זה הולך להשתנות.</p>'}</div>
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
    if(S.phase==='setup'&&!ui.edit) openEdit(true);
    if(S.phase!=='setup'&&ui.edit&&ui.edit.auto) ui.edit=null;
    const needProfile=me!==null&&S.phase!=='setup'&&S.prefs&&S.prefs[me]==null;
    if(needProfile&&!ui.prof) openProfile(true);
    if(ui.edit){ body=viewSetup(); screen='setup'; }
    else if(me===null){ body=`<section class="panel"><h2>הבית הזה מלא</h2><p class="hint">בבית כבר יש שני שחקנים. אפשר לצאת ולפתוח בית חדש.</p><button class="btn" data-act="leave">${ui.confirm==='leave'?'בטוח? לחיצה נוספת':'יציאה מהבית'}</button></section>`; screen='full'; }
    else if(ui.prof){ body=viewProfile(ui.prof.onboard); screen='profile'; }
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
      ${me!==null&&S.phase!=='setup'?`<button class="me" data-act="profile" title="הפרופיל שלי" aria-label="הפרופיל שלי: ${esc(P(me))}" style="background:${me?'var(--pb-soft)':'var(--pa-soft)'};color:${PCOL[me]}"><i class="dot" style="background:${PCOL[me]}"></i><span class="me-name" style="color:var(--ink)">${esc(P(me))}</span><i class="me-ini" aria-hidden="true">${esc(P(me).slice(0,1).toUpperCase())}</i></button>`:''}
      <button class="btn icon" data-act="mute" aria-label="${ui.muted?'הפעלת צלילים':'השתקת צלילים'}">${ui.muted?'🔇':'🔊'}</button>
      ${inGame&&me!==null&&S.phase!=='setup'&&!ui.edit?`<button class="btn icon" data-act="history" aria-label="היסטוריה">📜</button><button class="btn icon" data-act="settings" aria-label="הגדרות">⚙️</button>`:''}
    </div>
  </header>
  ${demoBar}
  ${body}
  <footer><span>${inGame?`${Object.keys(S.history).length} מפלצות הובסו · רצף ${streak()}`:''}</span><span id="status">${esc(ui.status)}</span></footer>`;
  app.querySelectorAll('[data-anim]').forEach(el=>{const k=el.dataset.anim, p=el.dataset.prop, to=el.dataset.to; const from=ui.prev[k]??to; el.style[p]=from; ui.prev[k]=to; if(from!==to){ void el.offsetWidth; requestAnimationFrame(()=>{el.style[p]=to;}); }});
  if(screen!=='week') ['mscale','f0','f1','g0','g1'].forEach(k=>delete ui.prev[k]);
  if(screen==='week'&&ui.intro){ ui.intro=false; setTimeout(()=>{sfx.roar(); shake(); banner(monster().name+' הופיע/ה!','רמה '+S.week); buzz([80,40,80]);},450); }
  ui.bump=null;
  const post=ui.post; ui.post=[]; post.forEach(f=>f());
}
function openEdit(auto){ ui.edit=clone({players:S.players,reward:S.reward,home:S.home,chores:S.chores}); ui.edit.chores=buildChores(ui.edit.home,ui.edit.chores); ui.edit.newName=''; ui.edit.auto=!!auto; ui.err=''; }
function openProfile(onboard){ const me=meIdx(); ui.prof={onboard:!!onboard,name:P(me),prefs:{...((S.prefs||[])[me]||{})}}; }

/* ================= events ================= */
app.addEventListener('input',ev=>{const el=ev.target, k=el.dataset.edit; if(!k) return;
  if(k==='myname'){ ui.joinName=el.value; return; }
  if(k==='joincode'){ ui.joinCode=el.value.toUpperCase(); return; }
  if(k==='profname'&&ui.prof){ ui.prof.name=el.value; return; }
  if(!ui.edit) return;
  if(k==='p0') ui.edit.players[0]=el.value; else if(k==='p1') ui.edit.players[1]=el.value; else if(k==='reward') ui.edit.reward=el.value;
  else if(k==='newchore') ui.edit.newName=el.value;});

function flyCard(owner){
  const card=document.getElementById('card'); if(!card) return;
  const r=card.getBoundingClientRect(); const f=document.createElement('div'); f.className='flycard'; f.textContent=card.querySelector('h2').textContent;
  Object.assign(f.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px'}); document.body.appendChild(f);
  const target=document.querySelector(`[data-act="take"][data-o="${owner}"]`); const tr=target?target.getBoundingClientRect():{left:r.left,top:innerHeight,width:0,height:0};
  const dx=tr.left+tr.width/2-(r.left+r.width/2), dy=tr.top+tr.height/2-(r.top+r.height/2);
  const anim=f.animate([{transform:'none',opacity:1},{transform:`translate(${dx}px,${dy}px) scale(.15) rotate(${owner===0?40:owner===1?-40:0}deg)`,opacity:.6}],{duration:reduced?1:420,easing:'cubic-bezier(.5,-0.3,.7,1)'});
  anim.onfinish=()=>{f.remove(); const c=target?center(target):[innerWidth/2,innerHeight/2]; burst(c[0],c[1],[PHEX[owner]||'#fff','#fff','#FFC93C'],14,{rmax:7,up:200});};
}

/* deal the current card (or its whole group): {kind:'p',o} one player takes every time, {kind:'split',a} split by times,
   {kind:'out',resp} outsourced with a responsible checker, {kind:'skip'} not needed this week */
function takeCard(act,fly){
  const d=S.draft, c=d&&d.deck[d.idx]; if(!c) return false;
  if(fly&&act.kind==='p') flyCard(act.o);
  sfx.whoosh(); buzz(15);
  const n=(ui.groupAll&&act.kind!=='split')?groupRun(d.deck,d.idx):1;
  for(let k=0;k<n;k++){
    const x=d.deck[d.idx];
    const item={id:x.id,name:x.name,group:groupOf(x),times:x.times,pts:x.pts,mental:!!x.mental,alloc:[0,0],out:null,skip:false};
    if(act.kind==='p') item.alloc[act.o]=x.times;
    else if(act.kind==='split') item.alloc=[clamp(act.a,0,x.times),x.times-clamp(act.a,0,x.times)];
    else if(act.kind==='out') item.out={resp:act.resp};
    else item.skip=true;
    S.weekChores.push(item); d.idx++;
  }
  (d.batches||(d.batches=[])).push(n);
  if(n>1){ ui.groupAll=false; toast('📦',`${n} מטלות ${groupName(groupOf(c))} חולקו יחד`); }
  ui.bump=act.kind==='p'?act.o:null; ui.pane=null; ui.splitA=-1;
  if(act.kind==='split') setTimeout(()=>{ const m=document.querySelector('.split'); if(m){const p=center(m); burst(p[0],p[1],[PHEX[0],PHEX[1],'#fff'],16,{rmax:7});} },120);
  if(act.kind==='out') toast('🔍',`מיקור חוץ. ${P(act.resp)} מוודא/ת שזה קורה.`);
  setTimeout(sfx.flip,180);
  if(d.idx===d.deck.length) setTimeout(()=>{ sfx.chime(); confettiBurstTop('cheer'); },400);
  return true;
}

/* Tinder-style swipe: right = player A, left = player B, up = even split (chores done more than once a week) */
let swipe=null;
app.addEventListener('pointerdown',ev=>{
  const card=ev.target.closest('#card'); if(!card||ev.target.closest('button,input')||ev.button>0) return;
  swipe={card,x:ev.clientX,y:ev.clientY,dx:0,dy:0,id:ev.pointerId};
  card.classList.add('dragging'); try{card.setPointerCapture(ev.pointerId)}catch(e){}
});
app.addEventListener('pointermove',ev=>{
  if(!swipe||ev.pointerId!==swipe.id) return;
  swipe.dx=ev.clientX-swipe.x; swipe.dy=ev.clientY-swipe.y;
  const dir=swipeDir(swipe.dx,swipe.dy,40);
  swipe.card.style.transform=`translate(${swipe.dx}px,${Math.min(swipe.dy,40)}px) rotate(${swipe.dx/18}deg)`;
  swipe.card.querySelectorAll('.swipe-label').forEach(l=>l.style.opacity=l.classList.contains('sl-'+dir)?String(Math.min(1,(Math.max(Math.abs(swipe.dx),-swipe.dy)-30)/70)):'0');
});
function canSplitNow(){ const d=S&&S.draft; const c=d&&d.deck[d.idx]; return !!(c&&c.times>1); }
function swipeDir(dx,dy,min){ if(-dy>Math.abs(dx)&&-dy>min) return canSplitNow()?2:null; if(dx>min) return 0; if(dx<-min) return 1; return null; }
function endSwipe(ev){
  if(!swipe||ev.pointerId!==swipe.id) return;
  const s=swipe; swipe=null; s.card.classList.remove('dragging');
  const dir=swipeDir(s.dx,s.dy,100);
  if(dir===null){ s.card.style.transform=''; s.card.querySelectorAll('.swipe-label').forEach(l=>l.style.opacity='0'); return; }
  const outX=dir===0?innerWidth:dir===1?-innerWidth:s.dx, outY=dir===2?-innerHeight:s.dy;
  s.card.style.transition='transform .28s ease-in'; s.card.style.transform=`translate(${outX}px,${outY}px) rotate(${dir===2?0:outX/25}deg)`;
  const target=dir<2?document.querySelector(`[data-act="take"][data-o="${dir}"]`):null;
  setTimeout(()=>{
    if(target){const c=center(target); burst(c[0],c[1],[PHEX[dir],'#fff','#FFC93C'],14,{rmax:7,up:200});}
    const c=S.draft.deck[S.draft.idx];
    const ok=dir===2?takeCard({kind:'split',a:Math.ceil(c.times/2)},false):takeCard({kind:'p',o:dir},false);
    if(ok){ save(); ensureSubs(); render(); }
  },220);
}
app.addEventListener('pointerup',endSwipe);
app.addEventListener('pointercancel',ev=>{ if(swipe&&ev.pointerId===swipe.id){ swipe.card.classList.remove('dragging'); swipe.card.style.transform=''; swipe=null; } });

const inviteLink=()=>location.origin+location.pathname+'?'+(DEMO?'demo=1&':'')+'join='+encodeURIComponent(ui.house.inviteCode);

app.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-act]'); if(!b||b.disabled) return;
  const a=b.dataset.act, id=b.dataset.id, o=Number(b.dataset.o), dd=Number(b.dataset.d), pp=Number(b.dataset.p);
  audio();
  let persist=true;
  if(!(a==='reset'||a==='leave')) ui.confirm=null;
  const ec=()=>ui.edit.chores.find(x=>x.id===id);
  switch(a){
    /* account & households */
    case 'signin': ui.err=''; try{ await B.signIn(); }catch(e){ ui.err='ההתחברות נכשלה. נסו שוב.'; render(); } return;
    case 'signout': cleanupHouse(); await B.signOut(); return;
    case 'demoswitch': { cleanupHouse(); ui.mode='loading'; render(); B.switchDemoUser(U.uid==='demo-b'?'demo-a':'demo-b'); return; }
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
      const g=clone(S); delete g.upgraded; const me=meIdx(); if(me!==null){ g.seats[me]=null; g.prefs[me]=null; }
      try{ await B.leaveHousehold(U.uid,HID,g); }catch(e){}
      cleanupHouse(); ui.confirm=null; ui.mode='nohouse'; render(); return;
    }
    case 'copyinvite': { const link=inviteLink(); try{ await navigator.clipboard.writeText(link); toast('📋','הקישור הועתק. שלחו אותו לבן/בת הזוג'); }catch(e){ toast('📋','קוד ההזמנה: '+ui.house.inviteCode); } sfx.pop(); return; }
    case 'shareinvite': { try{ await navigator.share({title:'מפלצת הבלגן',text:'בוא/י נביס יחד את מפלצת הבלגן! קוד ההזמנה: '+ui.house.inviteCode,url:inviteLink()}); }catch(e){} return; }
    case 'history': ui.view='history'; ui.prof=null; persist=false; if(!weeksUnsub) weeksUnsub=B.watchWeeks(HID,list=>{ ui.weeks=list; if(ui.view==='history') render(); },()=>{}); sfx.tap(); break;
    case 'back': ui.view='game'; persist=false; break;
    case 'mute': ui.muted=!ui.muted; ls.set('mm-muted',ui.muted?'1':'0'); if(!ui.muted) sfx.pop(); persist=false; break;
    /* setup */
    case 'settings': openEdit(false); ui.prof=null; persist=false; sfx.tap(); break;
    case 'ecancel': ui.edit=null; ui.err=''; persist=false; break;
    case 'hq': { const k=b.dataset.k; ui.edit.home[k]=!ui.edit.home[k]; ui.edit.chores=buildChores(ui.edit.home,ui.edit.chores); persist=false; sfx.pop(); break; }
    case 'ctog': { const c=ec(); if(c){ c.userOff=c.on; c.on=!c.on; } persist=false; sfx.tap(); break; }
    case 'ctimes': { const c=ec(); if(c) c.times=clamp(c.times+dd,1,14); persist=false; sfx.tap(); break; }
    case 'cpts': { const c=ec(); if(c) c.pts=clamp(c.pts+dd,1,5); persist=false; sfx.tap(); break; }
    case 'cdel': ui.edit.chores=ui.edit.chores.filter(x=>x.id!==id); persist=false; sfx.pop(); break;
    case 'cadd': { const name=(ui.edit.newName||'').trim(); if(!name){ persist=false; break; } ui.edit.chores.push({id:'u'+uid(),name,group:groupOf({name}),times:1,pts:2,custom:true,on:true,avail:true,userOff:false}); ui.edit.newName=''; persist=false; sfx.pop(); break; }
    case 'esave': {
      const chores=ui.edit.chores.map(c=>({...c,name:c.name.trim()})).filter(c=>c.name);
      if(chores.filter(c=>c.on&&c.avail!==false).length<2){ui.err='צריך לפחות שתי מטלות פעילות. אנחנו יודעים שאתם מסוגלים ליותר.'; persist=false; break;}
      S.players=ui.edit.players.map(p=>p.trim()); S.reward=ui.edit.reward.trim(); S.home=ui.edit.home; S.chores=chores;
      if(S.phase==='setup'){ startDraft(); sfx.chime(); confettiBurstTop('cheer'); }
      ui.edit=null; ui.err=''; break;
    }
    /* profile */
    case 'profile': openProfile(false); ui.view='game'; persist=false; sfx.tap(); break;
    case 'pref': ui.prof.prefs[b.dataset.g]=b.dataset.v; persist=false; sfx.tap(); break;
    case 'psave': { const me=meIdx(); const prefs={}; Object.entries(ui.prof.prefs).forEach(([g,v])=>{ if(v&&v!=='neutral') prefs[g]=v; }); S.prefs[me]=prefs; if(ui.prof.name.trim()) S.players[me]=ui.prof.name.trim(); const onb=ui.prof.onboard; ui.prof=null; if(onb){ banner('נרשם','עכשיו לחלוקה'); sfx.chime(); } break; }
    case 'pskip': { const me=meIdx(); S.prefs[me]={}; ui.prof=null; break; }
    case 'pcancel': ui.prof=null; persist=false; break;
    /* draft */
    case 'dpt': {const c=S.draft.deck[S.draft.idx]; if(c) c.pts=clamp(c.pts+dd,1,5); sfx.tap(); break;}
    case 'dtimes': {const c=S.draft.deck[S.draft.idx]; if(c){ c.times=clamp(c.times+dd,1,14); if(c.times<2&&ui.pane==='split') ui.pane=null; ui.splitA=-1; } sfx.tap(); break;}
    case 'take': if(!takeCard({kind:'p',o},true)) return; break;
    case 'skip': if(!takeCard({kind:'skip'},false)) return; break;
    case 'pane': { const k=b.dataset.k; ui.pane=ui.pane===k?null:k; ui.splitA=-1; persist=false; sfx.tap(); break; }
    case 'splitm': { const c=S.draft.deck[S.draft.idx]; ui.splitA=clamp(ui.splitA+dd,0,c.times); persist=false; sfx.tap(); break; }
    case 'dosplit': { const c=S.draft.deck[S.draft.idx]; const sa=ui.splitA<0?Math.ceil(c.times/2):ui.splitA; if(!takeCard({kind:'split',a:sa},false)) return; break; }
    case 'doout': if(!takeCard({kind:'out',resp:o},false)) return; break;
    case 'groupall': ui.groupAll=b.checked; persist=false; sfx.tap(); break;
    case 'undo': { const d=S.draft; if(!d||d.idx===0) return; const n=Math.min(d.idx,(d.batches&&d.batches.length)?d.batches.pop():1); for(let k=0;k<n;k++){ d.idx--; const cid=d.deck[d.idx].id; S.weekChores=S.weekChores.filter(c=>c.id!==cid); } ui.pane=null; sfx.tap(); break; }
    case 'move': { const c=S.weekChores.find(x=>x.id===id); if(c&&c.alloc&&c.alloc[pp]>0){ c.alloc[pp]--; c.alloc[1-pp]++; ui.bump=1-pp; sfx.pop(); const r=center(b); burst(r[0],r[1],[PHEX[1-pp],'#fff'],10,{rmax:6}); } break; }
    case 'outswap': { const c=S.weekChores.find(x=>x.id===id); if(c&&c.out){ c.out.resp=1-c.out.resp; sfx.pop(); } break; }
    case 'startweek': S.splits=S.splits||{}; S.splits[S.week]=pct(totals()); S.weekChores=S.weekChores.filter(c=>!c.skip); S.draft=null; S.phase='week'; S.weekStart=Date.now(); ui.intro=true; ui.prev={}; ui.doneWeek=null; break;
    /* week */
    case 'plus': { const c=S.weekChores.find(x=>x.id===id); if(c) await plusOne(c,pp,b); return; }
    case 'minus': { const c=S.weekChores.find(x=>x.id===id); if(c) await minusOne(c,pp); return; }
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
