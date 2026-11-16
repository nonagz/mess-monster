// Demo backend: same interface as backend-firebase.js, stored in this browser's localStorage.
// Open two tabs and pick a different player in each to simulate two phones (tabs sync through the storage event).
export const kind = 'demo';
const KEY = 'mm-demo-db';
const subs = new Set();
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
let D = load();
const fill = () => { D.users ||= {}; D.households ||= {}; D.marks ||= {}; D.pings ||= {}; D.weeks ||= {}; };
fill();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} notify(); };
const notify = () => setTimeout(() => subs.forEach(f => f()), 0);
addEventListener('storage', e => { if (e.key === KEY) { D = load(); fill(); notify(); } });
const M = { fromCache: false, pending: false };
const watch = fn => { subs.add(fn); setTimeout(fn, 0); return () => subs.delete(fn); };
const copy = o => JSON.parse(JSON.stringify(o));

let authCb = null;
const userFor = id => ({ uid: id, name: id === 'demo-b' ? 'דני' : 'נויה', photo: '' });
export function currentDemoUser() { try { return sessionStorage.getItem('mm-demo-user'); } catch (e) { return null; } }
export function switchDemoUser(id) { try { sessionStorage.setItem('mm-demo-user', id); } catch (e) {} if (authCb) authCb(userFor(id)); }

export async function init() {}
export function onAuth(cb) { authCb = cb; const u = currentDemoUser(); setTimeout(() => cb(u ? userFor(u) : null), 0); return () => {}; }
export async function signIn() { switchDemoUser(currentDemoUser() || 'demo-a'); }
export async function signOut() { try { sessionStorage.removeItem('mm-demo-user'); } catch (e) {} if (authCb) authCb(null); }

export async function getUserHousehold(uid) { return D.users[uid]?.householdId || null; }
export async function createHousehold(uid, game) {
  const hid = 'demo-house';
  D.households[hid] = { ...copy(game), members: [uid], inviteCode: 'DEMO42', createdAt: Date.now() };
  D.users[uid] = { householdId: hid }; persist(); return hid;
}
export async function joinHousehold(uid, code) {
  if (String(code).toUpperCase().trim() !== 'DEMO42' || !D.households['demo-house']) throw new Error('not_found');
  const h = D.households['demo-house'];
  if (!h.members.includes(uid)) { if (h.members.length >= 2) throw new Error('full'); h.members.push(uid); }
  D.users[uid] = { householdId: 'demo-house' }; persist(); return 'demo-house';
}
export async function leaveHousehold(uid, hid, game) {
  const h = D.households[hid]; if (!h) return;
  Object.assign(h, copy(game)); h.members = h.members.filter(m => m !== uid);
  D.users[uid] = { householdId: null }; persist();
}
export function watchHousehold(hid, cb) { return watch(() => { const h = D.households[hid]; cb(h && h.members.length ? copy(h) : (h ? copy(h) : null), M); }); }
export async function saveHousehold(hid, game) { Object.assign(D.households[hid], copy(game)); persist(); }

export function watchMarks(hid, week, cb) { return watch(() => cb(Object.entries(D.marks[hid] || {}).filter(([, m]) => m.week === week).map(([id, m]) => ({ ...m, _id: id })), M)); }
export async function putMark(hid, id, data) { (D.marks[hid] ||= {})[id] = data; persist(); }
export async function delMark(hid, id) { if (D.marks[hid]) delete D.marks[hid][id]; persist(); }

export async function addPing(hid, data) { (D.pings[hid] ||= []).push(data); persist(); }
export function watchPings(hid, to, cb) { return watch(() => cb((D.pings[hid] || []).filter(p => p.to === to), M)); }

export async function saveWeek(hid, n, data) { (D.weeks[hid] ||= {})[n] = copy(data); persist(); }
export function watchWeeks(hid, cb) { return watch(() => cb(Object.values(D.weeks[hid] || {}), M)); }
