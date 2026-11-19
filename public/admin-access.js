// Admin › «المشرفين» (owner only): add admins, choose what each one may open, change it, or remove access.
// A new admin gets a Firebase account created here (on a separate app instance, so the owner stays
// signed in) plus an email to set their own password. An email that already has an account gets an
// invite (adminInvites/{email}) that turns into access the first time they sign in with a verified email.
import { getApp, SDK, IS_LOCAL } from './firebase-init.js';

export const OWNER_EMAIL = 'habojarad305@gmail.com';
// permission key → its name and the admin tabs it opens
export const PERMS = [
  ['members', 'التسجيلات', ['members']],
  ['team', 'أعضاء المجتمع', ['team']],
  ['forms', 'الفورمات والاستبيان والمدربين', ['trainers', 'survey', 'forms']],
  ['workshops', 'الورشات والشهادات', ['workshop', 'cert']],
  ['site', 'محتوى الموقع والفعاليات والمعرض والتواصل', ['content', 'events', 'gallery', 'social']],
  ['studio', 'استوديو السوشيال والنشر', ['studio']],
  ['stats', 'الزيارات', ['stats']],
  ['settings', 'الإعدادات', ['settings']],
];
const PERM_NAME = Object.fromEntries(PERMS.map(([k, n]) => [k, n]));

const $ = (id) => document.getElementById(id);
let deps; // { h, toast, setBusy, db, fs, au, auth }
let rows = []; // { kind: 'admin' | 'invite', id, email, name, perms (array | null = everything) }

const dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 120;

function permBoxes(selected, name) {
  const cur = new Set(selected || PERMS.map(([k]) => k));
  return deps.h('div', { class: 'perm-boxes' }, PERMS.map(([k, label]) => deps.h('label', { class: 'perm-box' },
    deps.h('input', { type: 'checkbox', name, value: k, checked: cur.has(k) }), deps.h('span', {}, label))));
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
    ].map((r) => ({ ...r, perms: Array.isArray(r.perms) ? r.perms : null, at: r.createdAt?.toMillis?.() || 0 }))
      .sort((x, y) => (isOwnerRow(y) - isOwnerRow(x)) || (y.at - x.at));
    render();
  } catch (e) {
    console.error(e);
    deps.toast('ما قدرنا نجيب قائمة المشرفين', true);
  }
}
const isOwnerRow = (r) => (r.email || '').toLowerCase() === OWNER_EMAIL;

function render() {
  $('acc-empty').hidden = rows.length > 0;
  $('acc-list').replaceChildren(...rows.map((r) => {
    const owner = isOwnerRow(r);
    const who = deps.h('div', { class: 'acc-who' },
      deps.h('strong', {}, r.name || r.email || '(بدون إيميل)'),
      deps.h('span', { class: 'muted small', dir: 'ltr' }, r.email || `uid: ${r.id}`),
      deps.h('span', { class: `acc-badge ${owner ? 'is-owner' : r.kind === 'invite' ? 'is-wait' : ''}` },
        owner ? 'صاحب المنصة' : r.kind === 'invite' ? 'بانتظار أول دخول' : r.perms ? 'مشرف' : 'كل الصلاحيات'),
      r.at ? deps.h('span', { class: 'muted small' }, `انضاف ${dateFmt.format(new Date(r.at))}`) : '');
    if (owner) return deps.h('li', { class: 'acc-row' }, who, deps.h('p', { class: 'muted small acc-note' }, 'إلك كل الصلاحيات، وإنت بس بتضيف المشرفين وبتعدّل صلاحياتهم.'));
    const boxes = permBoxes(r.perms, `perm-${r.id}`);
    const save = deps.h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: (e) => savePerms(r, boxes, e.currentTarget) }, deps.h('span', { class: 'btn-label' }, 'احفظ الصلاحيات'), deps.h('span', { class: 'spinner', 'aria-hidden': 'true' }));
    const reset = r.email ? deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => sendReset(r.email) }, 'ابعتله رابط كلمة سر') : '';
    const remove = deps.h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: () => removeRow(r) }, r.kind === 'invite' ? 'إلغاء الدعوة' : 'شيل الصلاحية');
    return deps.h('li', { class: 'acc-row' }, who,
      r.perms ? '' : deps.h('p', { class: 'muted small acc-note' }, 'هاد الحساب انضاف قبل الصلاحيات، فمعه كل شي. حدّد إله الصلاحيات واحفظ.'),
      boxes, deps.h('div', { class: 'acc-actions' }, save, reset, remove));
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
  if (!confirm(what)) return;
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

export function initAccess(d) {
  deps = d;
  $('acc-perms').replaceChildren(...permBoxes(['studio'], 'acc-perm').children);
  $('acc-form').addEventListener('submit', addAdmin);
  $('acc-refresh').addEventListener('click', loadAccess);
  $('acc-all').addEventListener('click', () => $('acc-perms').querySelectorAll('input').forEach((b) => { b.checked = true; }));
  loadAccess();
}
export const permName = (k) => PERM_NAME[k] || k;
