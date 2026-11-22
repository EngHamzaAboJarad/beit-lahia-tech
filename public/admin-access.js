// Admin › «المشرفين» (owner only): add admins, choose what each one may open, change it, or remove access.
// A new admin gets a Firebase account created here (on a separate app instance, so the owner stays
// signed in) plus an email to set their own password. An email that already has an account gets an
// invite (adminInvites/{email}) that turns into access the first time they sign in with a verified email.
import { getApp, SDK, IS_LOCAL } from './firebase-init.js';
import { ask, askText } from './admin-dialog.js?v=1';

export const OWNER_EMAIL = 'habojarad305@gmail.com';
// permission key → its name and the admin tabs it opens
export const PERMS = [
  ['members', 'التسجيلات', ['members']],
  ['team', 'أعضاء المجتمع', ['team']],
  ['forms', 'الفورمات والاستبيان والمدربين', ['trainers', 'survey', 'forms']],
  ['workshops', 'الورشات والشهادات', ['workshop', 'cert']],
  ['content', 'محتوى الصفحة', ['content']],
  ['events', 'الفعاليات', ['events']],
  ['gallery', 'المعرض واستوديو المعرض', ['gallery', 'gstudio']],
  ['contact', 'التواصل', ['social']],
  ['blog', 'المدونة', ['blog']],
  ['studio', 'استوديو السوشيال والنشر', ['studio']],
  ['stats', 'الزيارات', ['stats']],
  ['settings', 'الإعدادات', ['settings']],
];
const PERM_NAME = Object.fromEntries(PERMS.map(([k, n]) => [k, n]));
// «محتوى الموقع» was one permission ('site'); it is now four. An old 'site' still opens all four.
export const SITE_PERMS = ['content', 'events', 'gallery', 'contact'];
export const expandPerms = (perms) => (Array.isArray(perms) && perms.includes('site')
  ? [...new Set([...perms.filter((p) => p !== 'site'), ...SITE_PERMS])] : perms);

const $ = (id) => document.getElementById(id);
let deps; // { h, toast, setBusy, db, fs, au, auth }
let rows = []; // { kind: 'admin' | 'invite', id, email, name, perms (array | null = everything) }

const dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 120;

// each permission wears the icon of its first section in the sidebar, and says which sections it opens
const permIcon = (tabs) => document.querySelector(`#tab-btn-${tabs[0]} svg`)?.outerHTML || '';
const permOpens = (tabs) => tabs.map((t) => document.querySelector(`#tab-btn-${t} span`)?.textContent.trim()).filter(Boolean).join('، ');
function permBoxes(selected, name) {
  const cur = new Set(selected || PERMS.map(([k]) => k));
  const h = deps.h;
  return h('div', { class: 'perm-list', role: 'group', 'aria-label': 'الصلاحيات' }, PERMS.map(([k, label, tabs]) => {
    const ico = h('span', { class: 'perm-ico', 'aria-hidden': 'true' }); ico.innerHTML = permIcon(tabs);
    return h('label', { class: 'perm-row' },
      ico,
      h('span', { class: 'perm-text' }, h('strong', {}, label), h('small', {}, 'بيفتح: ' + permOpens(tabs))),
      h('input', { type: 'checkbox', role: 'switch', name, value: k, checked: cur.has(k) }),
      h('span', { class: 'perm-switch', 'aria-hidden': 'true' }));
  }));
}
// the granted permissions as a row of small icons (the card shows this until «إدارة الصلاحيات» is opened)
function permSummary(perms) {
  const h = deps.h;
  const on = PERMS.filter(([k]) => !perms || perms.includes(k));
  return h('div', { class: 'perm-sum' }, on.map(([, label, tabs]) => {
    const t = h('span', { class: 'perm-tile', title: label }); t.innerHTML = permIcon(tabs);
    t.append(h('span', { class: 'visually-hidden' }, label));
    return t;
  }));
}
const readBoxes = (root) => [...root.querySelectorAll('input[type="checkbox"]:checked')].map((b) => b.value);

/* ---------- list ---------- */
export async function loadAccess() {
  const { db, fs } = deps;
  try {
    const [a, i] = await Promise.all([
      fs.getDocs(fs.collection(db, 'admins')),
      fs.getDocs(fs.collection(db, 'adminInvites')),
    ]);
    rows = [
      ...a.docs.map((d) => ({ kind: 'admin', id: d.id, ...d.data() })),
      ...i.docs.map((d) => ({ kind: 'invite', id: d.id, ...d.data() })),
    ].map((r) => ({ ...r, email: r.email || ownEmail(r), perms: Array.isArray(r.perms) ? expandPerms(r.perms) : null, at: r.createdAt?.toMillis?.() || 0 }))
      .sort((x, y) => (isOwnerRow(y) - isOwnerRow(x)) || (y.at - x.at));
    render();
    loadActivity();
  } catch (e) {
    console.error(e);
    deps.toast('ما قدرنا نجيب قائمة المشرفين', true);
  }
}
const isOwnerRow = (r) => (r.email || '').toLowerCase() === OWNER_EMAIL;
// an admin document made by hand in the console may have no e-mail: for your own account it's known
const ownEmail = (r) => (r.kind === 'admin' && r.id === deps.auth.currentUser?.uid ? (deps.auth.currentUser.email || '').toLowerCase() : '');

const seenOf = (uid) => (typeof act !== 'undefined' ? act.seen.find((x) => x.uid === uid) : null);
function render() {
  const h = deps.h;
  $('acc-empty').hidden = rows.length > 0;
  $('acc-count').textContent = rows.length ? `${rows.length}` : '';
  $('acc-list').replaceChildren(...rows.map((r, i) => {
    const owner = isOwnerRow(r);
    const invite = r.kind === 'invite';
    const seen = invite ? null : seenOf(r.id);
    const seenAt = seen?.seenAt?.toMillis?.() || 0;
    const online = seenAt && Date.now() - seenAt < 3 * 60e3;
    const role = owner ? ['صاحب المنصة', 'is-owner'] : invite ? ['بانتظار أول دخول', 'is-wait'] : r.perms ? ['مشرف', ''] : ['كل الصلاحيات', 'is-full'];
    const count = owner || !r.perms ? PERMS.length : r.perms.length;
    const sub = invite ? 'الدعوة بتتفعّل أول ما يسجّل دخول ويأكّد إيميله'
      : online ? 'موجود هلّق' : seenAt ? `آخر ظهور ${ago(seenAt)}` : r.at ? `انضاف ${dateFmt.format(new Date(r.at))}` : '';

    const head = h('header', { class: 'acc-card-head' },
      h('span', { class: `acc-card-av${online ? ' is-online' : ''}`, 'aria-hidden': 'true' }, initial(r.name || r.email)),
      h('div', { class: 'acc-card-id' },
        h('strong', {}, r.name || r.email || '(بدون إيميل)'),
        r.name && r.email ? h('bdi', { dir: 'ltr' }, r.email) : r.email ? '' : h('bdi', { dir: 'ltr' }, `uid: ${r.id}`)),
      h('span', { class: `acc-role ${role[1]}` }, role[0]));
    const meta = h('div', { class: 'acc-card-meta' },
      sub ? h('span', { class: online ? 'is-online' : '' }, sub) : '',
      h('span', {}, `${count} من ${PERMS.length} صلاحيات`));

    if (owner) {
      return h('li', { class: 'acc-card is-owner', style: `--i:${i}` }, head, meta, permSummary(null),
        h('p', { class: 'acc-card-note' }, 'إلك كل الصلاحيات، وإنت بس بتضيف المشرفين وبتعدّل صلاحياتهم.'));
    }
    const boxes = permBoxes(r.perms, `perm-${r.id}`);
    const label = h('span', { class: 'btn-label' }, 'احفظ');
    const save = h('button', { type: 'button', class: 'btn btn-primary btn-sm', disabled: true, onclick: (e) => savePerms(r, boxes, e.currentTarget) }, label, h('span', { class: 'spinner', 'aria-hidden': 'true' }));
    const dirty = h('span', { class: 'acc-dirty', hidden: true }, 'في تغييرات مش محفوظة');
    const original = (r.perms || PERMS.map(([k]) => k)).slice().sort().join(',');
    boxes.addEventListener('change', () => {
      const changed = readBoxes(boxes).sort().join(',') !== original;
      save.disabled = !changed; dirty.hidden = !changed;
      card.classList.toggle('is-dirty', changed);
    });
    const reset = r.email ? h('button', { type: 'button', class: 'acc-text-btn', onclick: () => sendReset(r.email) }, 'رابط كلمة سر') : '';
    const remove = h('button', { type: 'button', class: 'acc-text-btn is-danger', onclick: () => removeRow(r) }, invite ? 'إلغاء الدعوة' : 'شيل الصلاحية');
    const summary = permSummary(r.perms);
    const panelId = `perm-panel-${r.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    const panel = h('div', { class: 'acc-perm-panel', id: panelId, hidden: true }, boxes);
    const toggle = h('button', { type: 'button', class: 'acc-perm-toggle', 'aria-expanded': 'false', 'aria-controls': panelId, onclick: () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      panel.hidden = !open;
      card.classList.toggle('is-open', open);
    } }, h('span', {}, 'إدارة الصلاحيات'), h('span', { class: 'acc-perm-chev', 'aria-hidden': 'true' }));
    let sum = summary;
    boxes.addEventListener('change', () => { const next = permSummary(readBoxes(boxes)); sum.replaceWith(next); sum = next; });
    const card = h('li', { class: `acc-card${invite ? ' is-invite' : ''}`, style: `--i:${i}` }, head, meta,
      r.perms ? '' : h('p', { class: 'acc-card-note is-warn' }, 'هاد الحساب انضاف قبل الصلاحيات، فمعه كل شي. حدّد إله الصلاحيات واحفظ.'),
      h('div', { class: 'acc-card-perms' }, h('div', { class: 'acc-perm-bar' }, summary, toggle), panel),
      h('footer', { class: 'acc-card-foot' }, h('div', { class: 'acc-card-more' }, reset, remove), h('div', { class: 'acc-card-save' }, dirty, save)));
    return card;
  }));
}

async function savePerms(r, boxes, btn) {
  const perms = readBoxes(boxes);
  if (!perms.length) { deps.toast('اختار صلاحية وحدة على الأقل، أو اضغط «شيل الصلاحية»', true); return; }
  const { db, fs } = deps;
  deps.setBusy(btn, true);
  try {
    const col = r.kind === 'invite' ? 'adminInvites' : 'admins';
    // the whole document (an old console-made admin may carry other fields the rules don't accept)
    await fs.setDoc(fs.doc(db, col, r.id), {
      email: r.email || '', name: r.name || '', perms,
      ...(r.addedBy ? { addedBy: r.addedBy } : {}), ...(r.createdAt ? { createdAt: r.createdAt } : {}),
      updatedAt: fs.serverTimestamp(),
    });
    r.perms = perms; render(); deps.toast('انحفظت الصلاحيات ✓');
  } catch (e) { console.error(e); deps.toast('ما زبط الحفظ', true); } finally { deps.setBusy(btn, false); }
}

async function removeRow(r) {
  const what = r.kind === 'invite' ? `نلغي دعوة ${r.email}؟` : `نشيل صلاحية ${r.name || r.email} من لوحة الإدارة؟ (حسابه بيضل، بس ما بيقدر يفوت على اللوحة)`;
  if (!(await ask(what, { tone: 'danger', ok: r.kind === 'invite' ? 'ألغِ الدعوة' : 'شيل الصلاحية' }))) return;
  try {
    await deps.fs.deleteDoc(deps.fs.doc(deps.db, r.kind === 'invite' ? 'adminInvites' : 'admins', r.id));
    rows = rows.filter((x) => x !== r); render(); deps.toast('تم');
  } catch (e) { console.error(e); deps.toast('ما زبط', true); }
}

async function sendReset(email) {
  try { await deps.au.sendPasswordResetEmail(deps.auth, email); deps.toast(`انبعت رابط كلمة السر لـ ${email}`); } catch { deps.toast('ما قدرنا نبعت الإيميل', true); }
}

/* ---------- add ---------- */
let provision; // a second Firebase app: creating a user there doesn't sign the owner out
async function provisionAuth() {
  if (!provision) {
    const [{ initializeApp, getApps }, app] = await Promise.all([import(`${SDK}/firebase-app.js`), getApp()]);
    const sec = getApps().find((a) => a.name === 'provision') || initializeApp(app.options, 'provision');
    const a = deps.au.getAuth(sec);
    if (IS_LOCAL) deps.au.connectAuthEmulator(a, 'http://127.0.0.1:9099', { disableWarnings: true });
    provision = a;
  }
  return provision;
}
const randomPassword = () => `${crypto.randomUUID()}Aa1!`;

async function addAdmin(e) {
  e.preventDefault();
  const email = $('acc-email').value.trim().toLowerCase();
  const name = $('acc-name').value.trim().slice(0, 80);
  const perms = readBoxes($('acc-perms'));
  if (!isEmail(email)) { deps.toast('اكتب إيميل صحيح', true); $('acc-email').focus(); return; }
  if (!perms.length) { deps.toast('اختار صلاحية وحدة على الأقل', true); return; }
  if (rows.some((r) => (r.email || '').toLowerCase() === email)) { deps.toast('هاد الإيميل موجود بالقائمة. عدّل صلاحياته من تحت.', true); return; }
  const { db, fs, au, auth } = deps;
  const me = auth.currentUser?.email || '';
  const btn = $('acc-add');
  deps.setBusy(btn, true);
  try {
    const sec = await provisionAuth();
    let uid = '';
    try {
      const cred = await au.createUserWithEmailAndPassword(sec, email, randomPassword());
      uid = cred.user.uid;
      await au.signOut(sec);
    } catch (err) {
      if (err?.code !== 'auth/email-already-in-use') throw err;
    }
    const data = { email, name, perms, addedBy: me, createdAt: fs.serverTimestamp() };
    if (uid) {
      await fs.setDoc(fs.doc(db, 'admins', uid), data);
      await au.sendPasswordResetEmail(auth, email);
      deps.toast('انضاف ✓ وانبعتله إيميل يحط فيه كلمة السر');
    } else {
      await fs.setDoc(fs.doc(db, 'adminInvites', email), data);
      deps.toast('الإيميل إله حساب من قبل: انبعتت دعوة، وبتتفعّل أول ما يسجّل دخول ويأكّد إيميله');
    }
    $('acc-form').reset();
    $('acc-perms').replaceChildren(...permBoxes(['studio'], 'acc-perm').children);
    await loadAccess();
  } catch (err) {
    console.error(err);
    const code = err?.code || '';
    deps.toast(code === 'auth/operation-not-allowed' ? 'إنشاء الحسابات بالإيميل مش مفعّل بـ Firebase Authentication'
      : code === 'auth/invalid-email' ? 'الإيميل مش صحيح'
        : code === 'permission-denied' ? 'ما عندك صلاحية (لازم تنزيل قواعد Firestore الجديدة)'
          : 'ما زبطت الإضافة، جرّب كمان مرة', true);
  } finally { deps.setBusy(btn, false); }
}

/* ---------- activity (admin-activity.js writes it) ---------- */
const ONLINE = 3 * 60e3;
const act = { seen: [], log: [], last: null, done: false, busy: false };
const dayFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });
const clockFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
const fullFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const ms = (t) => t?.toMillis?.() || 0;
function plural(n, one, two, few, many) { return n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`; }
function ago(t) {
  const d = Date.now() - t;
  if (d < 60e3) return 'هلّق';
  if (d < 3600e3) return 'قبل ' + plural(Math.floor(d / 60e3), 'دقيقة', 'دقيقتين', 'دقايق', 'دقيقة');
  if (d < 864e5) return 'قبل ' + plural(Math.floor(d / 3600e3), 'ساعة', 'ساعتين', 'ساعات', 'ساعة');
  return 'قبل ' + plural(Math.floor(d / 864e5), 'يوم', 'يومين', 'أيام', 'يوم');
}
function dayLabel(t) {
  const d = new Date(t); const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'اليوم';
  if (d.toDateString() === y.toDateString()) return 'مبارح';
  return dayFmt.format(d);
}
function personOf(uid, email) {
  const r = rows.find((x) => x.kind === 'admin' && x.id === uid);
  const mail = email || r?.email || '';
  return { name: r?.name || mail || uid, email: mail };
}
const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
const tabName = (t) => (t && deps.tabTitle?.(t)) || '';

async function loadActivity() {
  const { db, fs } = deps;
  try {
    const seen = await fs.getDocs(fs.collection(db, 'adminSeen'));
    act.seen = seen.docs.map((d) => ({ uid: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
  } catch (e) { console.error(e); act.seen = []; }
  act.log = []; act.last = null; act.done = false;
  // still no e-mail? the activity log knows it once that admin has opened the panel
  rows.forEach((r) => { if (!r.email && r.kind === 'admin') r.email = act.seen.find((x) => x.uid === r.id)?.email || ''; });
  renderPeople();
  render();
  await loadLog();
}
async function loadLog() {
  const { db, fs } = deps;
  if (act.busy || act.done) return;
  act.busy = true; deps.setBusy($('act-more'), true);
  try {
    const who = $('act-who').value;
    const parts = [fs.collection(db, 'adminLog')];
    if (who) parts.push(fs.where('uid', '==', who));
    parts.push(fs.orderBy('at', 'desc'));
    if (act.last) parts.push(fs.startAfter(act.last));
    parts.push(fs.limit(60));
    const snap = await fs.getDocs(fs.query(...parts));
    act.log.push(...snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) })));
    act.last = snap.docs[snap.docs.length - 1] || act.last;
    act.done = snap.docs.length < 60;
    renderLog();
  } catch (e) {
    console.error(e);
    deps.toast(e?.code === 'failed-precondition' ? 'الفلتر بحاجة لفهرس Firestore (firestore.indexes.json): انشره وجرّب' : 'ما قدرنا نجيب سجل النشاط', true);
  } finally { act.busy = false; deps.setBusy($('act-more'), false); }
}

function renderPeople() {
  const h = deps.h;
  const admins = rows.filter((r) => r.kind === 'admin');
  const uids = [...new Set([...admins.map((r) => r.id), ...act.seen.map((s) => s.uid)])];
  const people = uids.map((uid) => {
    const s = act.seen.find((x) => x.uid === uid) || null;
    return { uid, s, ...personOf(uid, s?.email) };
  }).sort((a, b) => ms(b.s?.seenAt) - ms(a.s?.seenAt));
  $('act-people').replaceChildren(...people.map((p, i) => {
    const seen = ms(p.s?.seenAt);
    const online = seen && Date.now() - seen < ONLINE;
    const line = (k, v, title) => h('div', { class: 'act-line' }, h('span', { class: 'act-k' }, k), h('span', { class: 'act-v', title: title || null }, v));
    return h('li', { class: `act-person${online ? ' is-online' : ''}${p.s ? '' : ' is-never'}`, style: `--i:${i}` },
      h('div', { class: 'act-top' },
        h('span', { class: 'act-av', 'aria-hidden': 'true' }, initial(p.name), h('span', { class: 'act-dot' })),
        h('div', { class: 'act-id' }, h('strong', {}, p.name), p.email && p.email !== p.name ? h('bdi', { dir: 'ltr' }, p.email) : ''),
        h('span', { class: 'act-state' }, !p.s ? 'ما فات لسا' : online ? 'موجود هلّق' : `آخر ظهور ${ago(seen)}`)),
      p.s ? h('div', { class: 'act-lines' },
        line('آخر دخول', ms(p.s.loginAt) ? fullFmt.format(new Date(ms(p.s.loginAt))) : '—'),
        line('آخر شي عمله', p.s.lastText || 'لسا ما عمل شي', p.s.lastAt ? fullFmt.format(new Date(ms(p.s.lastAt))) : ''),
        p.s.lastAt ? line('إمتى', ago(ms(p.s.lastAt))) : '',
        line(online ? 'فاتح هلّق' : 'آخر قسم', tabName(p.s.tab) || '—'),
        p.s.device ? line('الجهاز', p.s.device) : '')
        : h('p', { class: 'muted small act-never' }, 'ما في دخول مسجّل من وقت ما انضاف سجل النشاط.'));
  }));
  const sel = $('act-who'); const cur = sel.value;
  sel.replaceChildren(h('option', { value: '' }, 'كل المشرفين'), ...people.map((p) => h('option', { value: p.uid }, p.name)));
  sel.value = people.some((p) => p.uid === cur) ? cur : '';
}

const ICON = {
  login: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>',
  del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/></svg>',
  post: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-3-6-7-2z"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></svg>',
  add: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};
function kindOf(e) {
  if (e.type === 'login') return 'login';
  const t = e.text || '';
  if (/^(حذف|نقل .* لسلة|فصل)/.test(t)) return 'del';
  if (/منشور/.test(t)) return 'post';
  if (/^(أضاف|ربط)/.test(t)) return 'add';
  return 'edit';
}
function renderLog() {
  const h = deps.h;
  const type = $('act-type').value;
  const list = act.log.filter((e) => !type || e.type === type);
  $('act-empty').hidden = list.length > 0;
  $('act-more').hidden = act.done;
  const out = []; let day = '';
  list.forEach((e, i) => {
    const t = ms(e.at) || Date.now();
    const d = dayLabel(t);
    if (d !== day) { day = d; out.push(h('h4', { class: 'act-day' }, d)); }
    const p = personOf(e.uid, e.email);
    const kind = kindOf(e);
    const ico = h('span', { class: `act-ico is-${kind}` }); ico.innerHTML = ICON[kind];
    const meta = [e.device, tabName(e.tab) ? `قسم ${tabName(e.tab)}` : ''].filter(Boolean).join(' · ');
    out.push(h('div', { class: `act-item is-${e.type}`, style: `--i:${Math.min(i, 12)}` },
      h('time', { datetime: new Date(t).toISOString(), title: fullFmt.format(new Date(t)) }, clockFmt.format(new Date(t))),
      ico,
      h('div', { class: 'act-body' },
        h('p', {}, h('strong', {}, p.name), ' ', e.text || ''),
        meta ? h('span', { class: 'act-meta' }, meta) : '')));
  });
  $('act-log').replaceChildren(...out);
}

export function initAccess(d) {
  deps = d;
  $('act-refresh').addEventListener('click', loadActivity);
  $('act-more').addEventListener('click', loadLog);
  // the log scrolls on its own; reaching its end loads the older entries
  $('act-log').addEventListener('scroll', (e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 120) loadLog(); }, { passive: true });
  $('act-who').addEventListener('change', () => { act.log = []; act.last = null; act.done = false; loadLog(); });
  $('act-type').addEventListener('change', renderLog);
  $('tab-btn-admins')?.addEventListener('click', () => { if (rows.length) loadActivity(); });
  setInterval(() => { if (!$('tab-admins').hidden && document.visibilityState === 'visible') renderPeople(); }, 60e3);
  $('acc-perms').replaceChildren(...permBoxes(['studio'], 'acc-perm').children);
  $('acc-form').addEventListener('submit', addAdmin);
  $('acc-refresh').addEventListener('click', loadAccess);
  $('acc-all').addEventListener('click', () => $('acc-perms').querySelectorAll('input').forEach((b) => { b.checked = true; }));
  loadAccess();
}
export const permName = (k) => PERM_NAME[k] || k;
