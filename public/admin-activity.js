// Admin activity (owner sees it in «المشرفين»): when each admin opened the panel, from which device,
// when they were last around, and what they did. Every Firestore write the panel makes goes through
// withActivity(fs), which turns it into one plain line («عدّل الفعالية: يوم البرمجة»); the social
// studio reports its own actions (publish, schedule…) through logAction().
//
//   adminLog/{auto}   { uid, email, type: login | action, text, tab?, device?, at }   — the history
//   adminSeen/{uid}   { email, loginAt, seenAt, lastText?, lastAt?, tab?, device? } — one row per admin
//
// Admins can only add their own lines (rules), and only the owner reads them.

const LOG = 'adminLog';
const SEEN = 'adminSeen';
const BEAT = 2 * 60e3; // «آخر ظهور» while the panel is open and visible

let ctx = null; // { db, fs (the plain SDK), user, tab() }
let lastBeat = 0;

// collection → what one document is, in a sentence («حذف <noun>»)
const NOUN = {
  members: 'تسجيل بالمجتمع', team: 'عضو بالفريق', events: 'فعالية', gallery: 'صورة بالمعرض', galleryFull: 'صورة بالمعرض',
  workshops: 'ورشة', workshopRegs: 'تسجيل بورشة', trainers: 'طلب مدرّب', topicSurveys: 'رد على الاستبيان',
  certificates: 'شهادة', memberNotes: 'ملاحظة عن عضو', admins: 'مشرف', adminInvites: 'دعوة مشرف', socialTemplates: 'قالب سوشيال',
  blog: 'مقال بالمدونة', blogBody: 'نص مقال', blogMedia: 'صورة بمقال',
};
const SITE = { content: 'محتوى الموقع', settings: 'الإعدادات', forms: 'إعدادات الفورمات' };
const VERB = { add: 'أضاف', set: 'حفظ', update: 'عدّل', delete: 'حذف' };

export function deviceName(ua = navigator.userAgent) {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung'
    : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'متصفح';
  const os = /Android/.test(ua) ? 'أندرويد' : /iPhone|iPad|iPod/.test(ua) ? 'آيفون' : /Windows/.test(ua) ? 'ويندوز'
    : /Mac OS X/.test(ua) ? 'ماك' : /Linux/.test(ua) ? 'لينكس' : '';
  return os ? `${browser} · ${os}` : browser;
}

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const labelOf = (data) => clip(data && typeof data === 'object' ? data.name || data.title || data.caption || '' : '', 50);

function describe(kind, ref, data) {
  const col = ref?.parent?.id || ref?.id || '';
  const noun = col === 'site' ? SITE[ref.id] || 'إعدادات الموقع' : NOUN[col] || col;
  const keys = data && typeof data === 'object' ? Object.keys(data) : [];
  if (kind === 'update' && keys.length && keys.every((k) => ['order', 'updatedAt'].includes(k))) return `رتّب ${noun}`;
  if (kind === 'update' && keys.length && keys.every((k) => /MailedAt$/.test(k))) return ''; // bookkeeping after an e-mail
  if (kind === 'update' && keys.includes('attended')) return data.attended ? 'سجّل حضور مشارك بورشة' : 'لغى حضور مشارك بورشة';
  if (kind === 'update' && keys.includes('deletedAt')) return data.deletedAt ? `نقل ${noun} لسلة المحذوفات` : `رجّع ${noun} من سلة المحذوفات`;
  const label = labelOf(data);
  return `${VERB[kind]} ${noun}${label ? `: ${label}` : ''}`;
}
function describeMany(ops) {
  if (ops.length === 1) return describe(...ops[0]);
  const [kind, ref] = ops[0];
  const same = ops.every(([k, r]) => k === kind && r?.parent?.id === ref?.parent?.id);
  if (same && ref?.parent?.id !== 'site') {
    const noun = NOUN[ref?.parent?.id] || ref?.parent?.id;
    if (kind === 'update' && ops.every(([, , d]) => d && Object.keys(d).every((k) => ['order', 'updatedAt'].includes(k)))) return `رتّب ${noun}`;
    return `${VERB[kind]} ${ops.length} × ${noun}`;
  }
  return `${describe(...ops[0])} (+${ops.length - 1})`;
}

/** The Firestore SDK with every write reported to the activity log (reads untouched). */
// The public site reads its data through the Worker's edge cache (social-worker/src/site.js, up to a minute old).
// A change to anything the site shows clears that cache, so it shows up on the next visit.
const SITE_COLS = new Set(['site', 'events', 'gallery', 'blog', 'team', 'workshops']);
const WORKER = (() => { try { return localStorage.getItem('blt-social-worker') || ''; } catch { return ''; } })() || 'https://social.beitlahia.tech';
let purgeTimer = 0;
function purgeSite(paths) {
  if (!paths.some((p) => SITE_COLS.has(String(p || '').split('/')[0]))) return;
  clearTimeout(purgeTimer);
  purgeTimer = setTimeout(async () => {
    try {
      const token = await ctx?.user?.getIdToken?.();
      if (token) await fetch(`${WORKER}/site/purge`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    } catch (e) { console.warn('[site-cache]', e); } // the cache refreshes itself within a minute anyway
  }, 1200);
}

export function withActivity(fs) {
  const out = { ...fs };
  const after = (p, text, paths) => p.then((r) => { logAction(text); purgeSite(paths); return r; });
  out.setDoc = (ref, data, ...o) => after(fs.setDoc(ref, data, ...o), describe('set', ref, data), [ref.path]);
  out.updateDoc = (ref, data, ...o) => after(fs.updateDoc(ref, data, ...o), describe('update', ref, data), [ref.path]);
  out.deleteDoc = (ref) => after(fs.deleteDoc(ref), describe('delete', ref), [ref.path]);
  out.addDoc = (col, data) => after(fs.addDoc(col, data), describe('add', { parent: col }, data), [col.path]);
  out.writeBatch = (db) => {
    const b = fs.writeBatch(db);
    const ops = [];
    return {
      set(ref, data, o) { ops.push(['set', ref, data]); b.set(ref, data, o); return this; },
      update(ref, data) { ops.push(['update', ref, data]); b.update(ref, data); return this; },
      delete(ref) { ops.push(['delete', ref]); b.delete(ref); return this; },
      commit() { return ops.length ? after(b.commit(), describeMany(ops), ops.map((o) => o[1].path)) : b.commit(); },
    };
  };
  return out;
}

async function write(fn) {
  try { await fn(); } catch (e) { console.warn('[activity]', e?.code || e); } // never in the admin's way
}
function seenData(extra = {}) {
  const { fs, user } = ctx;
  const tab = ctx.tab?.() || '';
  return { email: user.email || '', seenAt: fs.serverTimestamp(), ...(tab ? { tab } : {}), ...extra };
}

/** After a successful admin sign-in: a «دخل» line once per browser session, then «آخر ظهور» while open. */
export function startActivity({ db, fs, user, tab }) {
  ctx = { db, fs, user, tab };
  const device = deviceName();
  const key = `blt-admin-in-${user.uid}`;
  let fresh = true;
  try { fresh = !sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch { /* private mode: count it */ }
  if (fresh) {
    write(() => fs.addDoc(fs.collection(db, LOG), { uid: user.uid, email: user.email || '', type: 'login', text: 'دخل على لوحة الإدارة', device, at: fs.serverTimestamp() }));
    write(() => fs.setDoc(fs.doc(db, SEEN, user.uid), seenData({ loginAt: fs.serverTimestamp(), device }), { merge: true }));
  } else beat(true);
  lastBeat = Date.now();
  setInterval(() => beat(), 30e3);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') beat(); });
}
function beat(force = false) {
  if (!ctx || (!force && (document.visibilityState !== 'visible' || Date.now() - lastBeat < BEAT))) return;
  lastBeat = Date.now();
  write(() => ctx.fs.setDoc(ctx.fs.doc(ctx.db, SEEN, ctx.user.uid), seenData(), { merge: true }));
}

/** One line in the history + «آخر شي عمله». */
export function logAction(text) {
  if (!ctx || !text) return;
  const { db, fs, user } = ctx;
  const tab = ctx.tab?.() || '';
  text = clip(text, 200);
  lastBeat = Date.now();
  write(() => fs.addDoc(fs.collection(db, LOG), { uid: user.uid, email: user.email || '', type: 'action', text, ...(tab ? { tab } : {}), at: fs.serverTimestamp() }));
  write(() => fs.setDoc(fs.doc(db, SEEN, user.uid), seenData({ lastText: text, lastAt: fs.serverTimestamp() }), { merge: true }));
}
