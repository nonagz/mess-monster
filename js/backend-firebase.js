// Firebase backend: Google sign-in + Firestore. Every couple ("household") gets its own document tree.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut as fbSignOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, getDoc, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where, arrayUnion, arrayRemove, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export const kind = 'firebase';
let auth, fs;

export async function init(config) {
  const app = initializeApp(config);
  auth = getAuth(app);
  try { fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
  catch (e) { fs = initializeFirestore(app, {}); }
  getRedirectResult(auth).catch(() => {});
}

export function onAuth(cb) {
  return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, name: u.displayName || '', photo: u.photoURL || '' } : null));
}

export async function signIn() {
  const p = new GoogleAuthProvider();
  try { await signInWithPopup(auth, p); }
  catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, p);
    else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') throw e;
  }
}
export const signOut = () => fbSignOut(auth);

const meta = s => ({ fromCache: s.metadata.fromCache, pending: s.metadata.hasPendingWrites });
const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const makeCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => ALPH[b % ALPH.length]).join('');
const house = hid => doc(fs, 'households', hid);
const sub = (hid, name) => collection(fs, 'households', hid, name);

export async function getUserHousehold(uid) {
  const s = await getDoc(doc(fs, 'users', uid));
  return s.exists() ? (s.data().householdId || null) : null;
}

export async function createHousehold(uid, game) {
  const ref = doc(collection(fs, 'households'));
  const inviteCode = makeCode();
  await setDoc(ref, { ...game, members: [uid], inviteCode, createdAt: serverTimestamp() });
  await setDoc(doc(fs, 'invites', inviteCode), { householdId: ref.id });
  await setDoc(doc(fs, 'users', uid), { householdId: ref.id });
  return ref.id;
}

export async function joinHousehold(uid, code) {
  const inv = await getDoc(doc(fs, 'invites', String(code).toUpperCase().trim()));
  if (!inv.exists()) throw new Error('not_found');
  const hid = inv.data().householdId;
  try { await updateDoc(house(hid), { members: arrayUnion(uid) }); }
  catch (e) { throw new Error('full'); }
  await setDoc(doc(fs, 'users', uid), { householdId: hid });
  return hid;
}

export async function leaveHousehold(uid, hid, game) {
  await updateDoc(house(hid), game);                    // clears this player's seat while still a member
  await updateDoc(house(hid), { members: arrayRemove(uid) });
  await setDoc(doc(fs, 'users', uid), { householdId: null });
}

export function watchHousehold(hid, cb, err) {
  return onSnapshot(house(hid), { includeMetadataChanges: true }, s => cb(s.exists() ? s.data() : null, meta(s)), err);
}
export const saveHousehold = (hid, game) => updateDoc(house(hid), game);

export function watchMarks(hid, week, cb, err) {
  return onSnapshot(query(sub(hid, 'marks'), where('week', '==', week)), { includeMetadataChanges: true },
    s => cb(s.docs.map(d => ({ ...d.data(), _id: d.id })), meta(s)), err);
}
export const putMark = (hid, id, data) => setDoc(doc(sub(hid, 'marks'), id), data);
export const delMark = (hid, id) => deleteDoc(doc(sub(hid, 'marks'), id));

export const addPing = (hid, data) => addDoc(sub(hid, 'pings'), data);
export function watchPings(hid, to, cb, err) {
  return onSnapshot(query(sub(hid, 'pings'), where('to', '==', to)), s => cb(s.docs.map(d => d.data()), meta(s)), err);
}

export const saveWeek = (hid, n, data) => setDoc(doc(sub(hid, 'weeks'), String(n)), data);
export function watchWeeks(hid, cb, err) {
  return onSnapshot(sub(hid, 'weeks'), s => cb(s.docs.map(d => d.data()), meta(s)), err);
}
