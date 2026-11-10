// Beit Lahia Tech — admin dashboard
import { getDb, getAuth } from './firebase-init.js';
import { gazaDay } from './track.js';
import { DEFAULT_CONTENT, DEFAULT_SETTINGS, EVENT_TYPES, withDefaults, safeUrl, isEmail, SOCIAL_PLATFORMS, socialInfo, renderFooterLinks } from './content-defaults.js';
import { iconSvg } from './icons.js';

const $ = (id) => document.getElementById(id);
const STATUS = { tawjihi: 'طالب توجيهي', student: 'طالب جامعة', graduate: 'خريج' };
const EXPERIENCE = { none: 'لسا ببدأ', lt1: 'أقل من سنة', '1-2': '1 – 2 سنة', '3-5': '3 – 5 سنوات', '5+': 'أكثر من 5 سنوات' };
const dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((k) => k != null && el.append(k.nodeType ? k : String(k)));
  return el;
}
const svgIcon = (d) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = d; // static, trusted icon paths only
  return s;
};
const ICONS = {
  trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
};

let toastTimer;
function toast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.toggle('is-error', isError);
  t.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-on'), 3200);
}
function setBusy(btn, on, label) {
  btn.disabled = on;
  btn.classList.toggle('is-loading', on);
  if (label) btn.querySelector('.btn-label').textContent = label;
}
const errMsg = (e) => (e && e.code === 'permission-denied' ? 'ما عندك صلاحية لهاد الإجراء.' : 'صار خطأ، جرّب كمان مرة.');

function show(view) {
  ['view-loading', 'view-login', 'view-denied', 'view-app'].forEach((v) => { $(v).hidden = v !== view; });
}

/* =================== Auth =================== */
const { auth, au } = await getAuth();
const { db, fs } = await getDb();
let booted = false;

au.onAuthStateChanged(auth, async (user) => {
  if (!user) { show('view-login'); return; }
  let isAdmin = false;
  try { isAdmin = (await fs.getDoc(fs.doc(db, 'admins', user.uid))).exists(); } catch { isAdmin = false; }
  if (!isAdmin) {
    $('denied-email').textContent = user.email || '';
    $('denied-uid').textContent = user.uid;
    show('view-denied');
    return;
  }
  $('admin-email').textContent = user.email || '';
  try { localStorage.setItem('blt-admin', '1'); } catch { /* ignore */ } // this browser isn't counted in the visits
  show('view-app');
  if (!booted) { booted = true; boot(); }
});

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('login-btn');
  const err = $('login-error');
  err.textContent = '';
  const email = $('login-email').value.trim();
  const pass = $('login-password').value;
  if (!email || !pass) { err.textContent = 'اكتب الإيميل وكلمة السر.'; return; }
  setBusy(btn, true);
  try {
    await au.signInWithEmailAndPassword(auth, email, pass);
    $('login-password').value = '';
  } catch (e2) {
    const code = e2 && e2.code;
    err.textContent = code === 'auth/too-many-requests' ? 'محاولات كثير. استنى شوي وجرّب.'
      : code === 'auth/network-request-failed' ? 'ما في اتصال بالإنترنت.'
      : code === 'auth/operation-not-allowed' ? 'تسجيل الدخول بالإيميل مش مفعّل بالمشروع.'
      : 'الإيميل أو كلمة السر غلط.';
  } finally { setBusy(btn, false); }
});

$('forgot-btn').addEventListener('click', async () => {
  const msg = $('forgot-msg');
  const err = $('login-error');
  err.textContent = '';
  msg.hidden = true;
  const email = $('login-email').value.trim();
  if (!isEmail(email.toLowerCase())) { err.textContent = 'اكتب إيميلك فوق، وبعدين اضغط «نسيت كلمة السر».'; $('login-email').focus(); return; }
  const btn = $('forgot-btn');
  btn.disabled = true;
  try {
    await au.sendPasswordResetEmail(auth, email);
    msg.textContent = 'إذا الإيميل مسجّل كأدمن، رح يوصلك رابط لتغيير كلمة السر خلال دقائق. شيّك كمان على الـ Spam.';
    msg.hidden = false;
  } catch (e2) {
    const code = e2 && e2.code;
    if (code === 'auth/user-not-found') { // don't reveal which emails exist
      msg.textContent = 'إذا الإيميل مسجّل كأدمن، رح يوصلك رابط لتغيير كلمة السر خلال دقائق. شيّك كمان على الـ Spam.';
      msg.hidden = false;
    } else {
      err.textContent = code === 'auth/too-many-requests' ? 'طلبات كثير. استنى شوي وجرّب.'
        : code === 'auth/network-request-failed' ? 'ما في اتصال بالإنترنت.'
        : code === 'auth/invalid-email' ? 'الإيميل مش صحيح.'
        : 'ما قدرت أبعت الرابط. جرّب كمان مرة.';
    }
  } finally { btn.disabled = false; }
});

document.querySelectorAll('[data-signout]').forEach((b) => b.addEventListener('click', async () => {
  if (content.dirty && !confirm('في تعديلات على المحتوى مش محفوظة. بدك تطلع؟')) return;
  content.dirty = false;
  await au.signOut(auth);
  location.reload();
}));
$('copy-uid').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('denied-uid').textContent); toast('انسخ'); } catch { toast('ما قدرت أنسخ، انسخه يدوي', true); }
});

/* =================== Tabs =================== */
const TABS = ['members', 'stats', 'content', 'events', 'gallery', 'social', 'settings'];
function selectTab(name, focus = false) {
  TABS.forEach((t) => {
    const btn = $(`tab-btn-${t}`);
    const on = t === name;
    btn.setAttribute('aria-selected', on);
    btn.tabIndex = on ? 0 : -1;
    $(`tab-${t}`).hidden = !on;
    if (on && focus) btn.focus();
  });
  history.replaceState(null, '', `#${name}`);
}
TABS.forEach((t, i) => {
  const btn = $(`tab-btn-${t}`);
  btn.addEventListener('click', () => selectTab(t));
  btn.addEventListener('keydown', (e) => {
    // RTL: ArrowLeft moves to the next tab
    const dir = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0;
    if (dir) { e.preventDefault(); selectTab(TABS[(i + dir + TABS.length) % TABS.length], true); }
  });
});

function boot() {
  const hash = location.hash.slice(1);
  selectTab(TABS.includes(hash) ? hash : 'members');
  loadMembers();
  loadTraffic();
  loadContent();
  loadEvents();
  loadGallery();
  loadSettings();
}

/* =================== Members =================== */
// Deleting moves a registration to the trash (deletedAt); it's purged for good 30 days later.
let allMembers = [];
let members = []; // active (not in the trash)
let trash = [];
let showTrash = false;
const TRASH_DAYS = 30;

async function loadMembers() {
  $('members-count').textContent = 'جاري التحميل…';
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'members'), fs.orderBy('createdAt', 'desc')));
    allMembers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await purgeOldTrash();
    splitMembers();
    fillResidenceFilter();
    renderStats();
    renderMembers();
    renderTraffic();
  } catch (e) {
    console.error(e);
    $('members-count').textContent = errMsg(e);
  }
}

function splitMembers() {
  members = allMembers.filter((m) => !m.deletedAt);
  trash = allMembers.filter((m) => m.deletedAt)
    .sort((a, b) => (b.deletedAt?.toMillis?.() || 0) - (a.deletedAt?.toMillis?.() || 0));
  $('trash-toggle').textContent = showTrash ? '← رجوع للتسجيلات' : `سلة المحذوفات (${trash.length})`;
  $('trash-toggle').setAttribute('aria-pressed', String(showTrash));
  $('trash-note').hidden = !showTrash;
}

async function purgeOldTrash() {
  const cutoff = Date.now() - TRASH_DAYS * 864e5;
  const old = allMembers.filter((m) => m.deletedAt?.toMillis?.() && m.deletedAt.toMillis() < cutoff);
  if (!old.length) return;
  try {
    const batch = fs.writeBatch(db);
    old.slice(0, 450).forEach((m) => batch.delete(fs.doc(db, 'members', m.id)));
    await batch.commit();
    const gone = new Set(old.slice(0, 450).map((m) => m.id));
    allMembers = allMembers.filter((m) => !gone.has(m.id));
  } catch (e) { console.warn('[trash purge]', e); }
}

function fillResidenceFilter() {
  const sel = $('f-residence');
  const current = sel.value;
  const counts = members.reduce((acc, m) => { if (m.residence) acc[m.residence] = (acc[m.residence] || 0) + 1; return acc; }, {});
  const places = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, 'ar'));
  sel.replaceChildren(h('option', { value: '' }, 'كل المناطق'), ...places.map((p) => h('option', { value: p }, `${p} (${counts[p]})`)));
  sel.value = places.includes(current) ? current : '';
}

function renderStats() {
  const week = Date.now() - 7 * 864e5;
  const count = (fn) => members.filter(fn).length;
  const items = [
    ['مجموع التسجيلات', members.length, true],
    ['طلاب توجيهي', count((m) => m.status === 'tawjihi')],
    ['طلاب جامعة', count((m) => m.status === 'student')],
    ['خريجين', count((m) => m.status === 'graduate')],
    ['آخر 7 أيام', count((m) => m.createdAt && m.createdAt.toMillis() >= week)],
    ['لسا ما تواصلنا', count((m) => !m.contacted)],
  ];
  $('stats').replaceChildren(...items.map(([label, value, accent]) => h('div', { class: accent ? 'stat stat-accent' : 'stat' },
    h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label))));
}

function filtered() {
  const q = $('f-search').value.trim().toLowerCase();
  const st = $('f-status').value;
  const ex = $('f-exp').value;
  const ct = $('f-contacted').value;
  const rs = $('f-residence').value;
  return (showTrash ? trash : members).filter((m) => {
    if (st && m.status !== st) return false;
    if (rs && m.residence !== rs) return false;
    if (ex && m.experience !== ex) return false;
    if (ct === 'yes' && !m.contacted) return false;
    if (ct === 'no' && m.contacted) return false;
    if (q) {
      const hay = [m.name, m.whatsapp, m.email, m.specialty, m.university, m.residence, m.notes, m.portfolio].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const waLink = (n) => (typeof n === 'string' && /^\+\d{8,15}$/.test(n) ? `https://wa.me/${n.slice(1)}` : '');

function renderMembers() {
  const rows = filtered();
  // same WhatsApp number registered more than once → flag it
  const seen = members.reduce((m, x) => { if (x.whatsapp) m[x.whatsapp] = (m[x.whatsapp] || 0) + 1; return m; }, {});
  const pool = showTrash ? trash : members;
  $('members-count').textContent = showTrash ? `${rows.length} من ${pool.length} بسلة المحذوفات` : `${rows.length} من ${pool.length} تسجيل`;
  $('members-empty').textContent = showTrash ? 'سلة المحذوفات فاضية.' : 'ما في تسجيلات بهاد الفلتر.';
  $('members-empty').hidden = rows.length > 0;
  $('members-body').replaceChildren(...rows.map((m) => {
    const tr = h('tr', { class: m.contacted ? 'is-contacted' : '' },
      h('td', { class: 'cell-name' }, h('strong', {}, m.name),
        seen[m.whatsapp] > 1 ? h('span', { class: 'badge badge-dup', title: 'نفس رقم الواتساب مسجّل أكثر من مرة' }, 'مكرر') : null,
        m.notes ? h('details', { class: 'cell-notes' }, h('summary', {}, 'ملاحظات'), h('p', {}, m.notes)) : null),
      h('td', { class: 'cell-contact' },
        waLink(m.whatsapp)
          ? h('a', { class: 'wa-btn', href: waLink(m.whatsapp), target: '_blank', rel: 'noopener noreferrer', title: 'فتح محادثة واتساب' }, h('bdi', { dir: 'ltr' }, m.whatsapp))
          : h('span', { class: 'muted' }, '—'),
        m.email ? h('a', { class: 'mail-link', href: `mailto:${m.email}`, dir: 'ltr' }, m.email) : null),
      h('td', {}, h('span', { class: `pill pill-${m.status}` }, STATUS[m.status] || m.status)),
      h('td', {}, m.specialty),
      h('td', {}, m.age),
      h('td', {}, m.experience ? EXPERIENCE[m.experience] || m.experience : '—'),
      h('td', {}, m.residence),
      h('td', {}, m.university || '—'),
      h('td', {}, safeUrl(m.portfolio)
        ? h('a', { href: safeUrl(m.portfolio), target: '_blank', rel: 'noopener noreferrer nofollow', class: 'cell-link', title: m.portfolio }, 'فتح ↗')
        : '—'),
      h('td', { class: 'cell-date' }, m.createdAt ? dateFmt.format(m.createdAt.toDate()) : '—'),
      h('td', {}, h('input', {
        type: 'checkbox', class: 'check', checked: !!m.contacted, 'aria-label': `تواصلنا مع ${m.name}`,
        onchange: (e) => setContacted(m, e.target.checked, tr, e.target),
      })),
      h('td', { class: 'cell-actions' }, showTrash
        ? [
          h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => restoreMember(m) }, 'استرجاع'),
          h('button', {
            type: 'button', class: 'icon-btn danger', 'aria-label': `حذف ${m.name} نهائياً`, title: 'حذف نهائي',
            onclick: () => purgeMember(m),
          }, svgIcon(ICONS.trash)),
        ]
        : h('button', {
          type: 'button', class: 'icon-btn', 'aria-label': `نقل تسجيل ${m.name} لسلة المحذوفات`, title: 'حذف (لسلة المحذوفات)',
          onclick: () => deleteMember(m),
        }, svgIcon(ICONS.trash))));
    return tr;
  }));
}

const refreshMembers = () => { splitMembers(); fillResidenceFilter(); renderStats(); renderMembers(); renderTraffic(); };

async function setContacted(m, value, tr, box) {
  box.disabled = true;
  try {
    await fs.updateDoc(fs.doc(db, 'members', m.id), { contacted: value });
    m.contacted = value;
    tr.classList.toggle('is-contacted', value);
    renderStats();
  } catch (e) {
    box.checked = !value;
    toast(errMsg(e), true);
  } finally { box.disabled = false; }
}

async function deleteMember(m) {
  if (!confirm(`نقل تسجيل «${m.name}» لسلة المحذوفات؟ بتقدر ترجّعه خلال ${TRASH_DAYS} يوم.`)) return;
  try {
    await fs.updateDoc(fs.doc(db, 'members', m.id), { deletedAt: fs.serverTimestamp() });
    m.deletedAt = fs.Timestamp.now();
    refreshMembers();
    toast('انتقل لسلة المحذوفات');
  } catch (e) { toast(errMsg(e), true); }
}
async function restoreMember(m) {
  try {
    await fs.updateDoc(fs.doc(db, 'members', m.id), { deletedAt: fs.deleteField() });
    delete m.deletedAt;
    refreshMembers();
    toast('رجع التسجيل');
  } catch (e) { toast(errMsg(e), true); }
}
async function purgeMember(m) {
  if (!confirm(`حذف «${m.name}» نهائياً؟ هاي ما بترجع.`)) return;
  try {
    await fs.deleteDoc(fs.doc(db, 'members', m.id));
    allMembers = allMembers.filter((x) => x.id !== m.id);
    refreshMembers();
    toast('انحذف نهائياً');
  } catch (e) { toast(errMsg(e), true); }
}

$('trash-toggle').addEventListener('click', () => {
  showTrash = !showTrash;
  splitMembers();
  renderMembers();
});

['f-search', 'f-status', 'f-exp', 'f-contacted', 'f-residence'].forEach((id) => $(id).addEventListener('input', renderMembers));
$('refresh-members').addEventListener('click', loadMembers);

$('export-csv').addEventListener('click', () => {
  const rows = filtered();
  const head = ['الاسم', 'واتساب', 'الإيميل', 'الحالة', 'التخصص', 'العمر', 'سنوات الخبرة', 'وين مقيم', 'الجامعة', 'معرض الأعمال', 'ملاحظات', 'تواصلنا', 'تاريخ التسجيل'];
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...rows.map((m) => [
    m.name, m.whatsapp || '', m.email || '', STATUS[m.status] || m.status, m.specialty, m.age, m.experience ? EXPERIENCE[m.experience] : '',
    m.residence, m.university || '', m.portfolio || '', m.notes || '', m.contacted ? 'نعم' : 'لا',
    m.createdAt ? dateTimeFmt.format(m.createdAt.toDate()) : '',
  ])].map((r) => r.map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); // BOM → Excel reads Arabic
  const a = h('a', { href: URL.createObjectURL(blob), download: `beit-lahia-members-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* =================== Traffic =================== */
// stats/{YYYY-MM-DD} = { home, join, start } (counted by track.js); registrations come from members.
let traffic = {};
let range = 7;
const dayFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const num = (n) => new Intl.NumberFormat('en-US').format(n);

function lastDays(n) {
  const out = [];
  const today = new Date(`${gazaDay()}T12:00:00Z`);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(today.getTime() - i * 864e5).toISOString().slice(0, 10));
  return out;
}

async function loadTraffic() {
  try {
    const from = lastDays(30)[0];
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'stats'), fs.where(fs.documentId(), '>=', from)));
    traffic = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  } catch (e) {
    console.warn('[traffic]', e);
    $('funnel-note').textContent = errMsg(e);
  }
  renderTraffic();
}

function renderTraffic() {
  const days = lastDays(range);
  const signupsByDay = {};
  members.forEach((m) => {
    if (!m.createdAt) return;
    const d = gazaDay(m.createdAt.toDate());
    signupsByDay[d] = (signupsByDay[d] || 0) + 1;
  });
  const rows = days.map((d) => ({
    day: d,
    home: traffic[d]?.home || 0,
    join: traffic[d]?.join || 0,
    start: traffic[d]?.start || 0,
    signups: signupsByDay[d] || 0,
  }));
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
  // registrations only count from the first day the visit counter ran, so the funnel compares like with like
  const firstTracked = Object.keys(traffic).sort()[0];
  const trackedSignups = firstTracked ? rows.filter((r) => r.day >= firstTracked).reduce((s, r) => s + r.signups, 0) : 0;
  const steps = [
    ['زاروا الصفحة الرئيسية', sum('home')],
    ['فتحوا صفحة التسجيل', sum('join')],
    ['بلّشوا يعبّوا الفورم', sum('start')],
    ['سجّلوا', trackedSignups],
  ];
  const max = Math.max(1, ...steps.map((s) => s[1]));
  $('funnel').replaceChildren(...steps.map(([label, value], i) => {
    const prev = i > 0 ? steps[i - 1][1] : 0;
    // "% of the step before" only means something while it stays ≤ 100 (a direct link to /join skips the home page)
    const pct = i > 0 && prev > 0 && value <= prev ? Math.round((value / prev) * 100) : null;
    return h('li', { class: 'funnel-row' },
      h('div', { class: 'funnel-label' }, h('span', {}, label),
        h('span', { class: 'funnel-value' }, num(value), pct != null ? h('small', {}, ` · ${pct}% من اللي قبل`) : null)),
      h('div', { class: 'funnel-track' }, h('i', { style: `width:${value ? Math.max(1.5, (value / max) * 100) : 0}%` })));
  }));
  const joined = sum('join');
  $('funnel-note').textContent = !joined
    ? 'لسا ما في زيارات بهاي الفترة. العدّاد بيشتغل من يوم ما ينرفع الموقع بالنسخة الجديدة.'
    : trackedSignups <= joined
      ? `من كل 100 شخص فتحوا صفحة التسجيل، سجّل ${Math.round((trackedSignups / joined) * 100)}.`
      : 'التسجيلات أكثر من زيارات صفحة التسجيل، لأنه في تسجيلات صارت قبل ما يشتغل العدّاد. النسبة بتصير دقيقة بعد كم يوم.';

  // daily bars: one series (home-page visits); the tooltip shows the rest of that day
  const chart = $('daychart');
  const peak = Math.max(1, ...rows.map((r) => r.home));
  chart.setAttribute('aria-label', `زيارات الصفحة الرئيسية لآخر ${range} يوم، أعلى يوم ${num(peak)}`);
  chart.style.setProperty('--n', rows.length);
  chart.replaceChildren(
    h('span', { class: 'daychart-max', 'aria-hidden': 'true' }, num(peak)),
    ...rows.map((r, i) => {
      const label = dayFmt.format(new Date(`${r.day}T12:00:00Z`));
      const col = h('div', { class: 'daycol', tabindex: 0, 'data-i': i, 'aria-label': `${label}: ${r.home} زيارة، ${r.signups} تسجيل` },
        h('i', { style: `height:${r.home ? Math.max(2, (r.home / peak) * 100) : 0}%` }));
      const showAxis = i === 0 || i === rows.length - 1 || (rows.length > 7 && i === Math.floor(rows.length / 2));
      if (showAxis) col.append(h('span', { class: 'daycol-x' }, label));
      return col;
    }));
  const tip = $('chart-tip');
  const showTip = (col) => {
    const r = rows[Number(col.dataset.i)];
    tip.replaceChildren(
      h('strong', {}, dayFmt.format(new Date(`${r.day}T12:00:00Z`))),
      h('span', {}, `الرئيسية: ${num(r.home)}`), h('span', {}, `صفحة التسجيل: ${num(r.join)}`),
      h('span', {}, `بلّشوا يعبّوا: ${num(r.start)}`), h('span', {}, `سجّلوا: ${num(r.signups)}`));
    tip.hidden = false;
    const wrap = chart.parentElement.getBoundingClientRect();
    const c = col.getBoundingClientRect();
    const x = Math.min(Math.max(c.left + c.width / 2 - wrap.left, 70), wrap.width - 70);
    tip.style.left = `${x}px`;
  };
  chart.onpointerover = (e) => { const col = e.target.closest('.daycol'); if (col) showTip(col); };
  chart.onfocusin = (e) => { const col = e.target.closest('.daycol'); if (col) showTip(col); };
  chart.onpointerleave = () => { tip.hidden = true; };
  chart.onfocusout = () => { tip.hidden = true; };

  $('daytable').replaceChildren(
    h('thead', {}, h('tr', {}, ['اليوم', 'الرئيسية', 'صفحة التسجيل', 'بلّشوا يعبّوا', 'سجّلوا'].map((t) => h('th', { scope: 'col' }, t)))),
    h('tbody', {}, [...rows].reverse().map((r) => h('tr', {},
      h('td', {}, dayFmt.format(new Date(`${r.day}T12:00:00Z`))),
      h('td', {}, num(r.home)), h('td', {}, num(r.join)), h('td', {}, num(r.start)), h('td', {}, num(r.signups))))));
}

document.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', () => {
  range = Number(b.dataset.range);
  document.querySelectorAll('[data-range]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderTraffic();
}));

/* =================== Content editor =================== */
const SCHEMA = [
  { title: 'الواجهة الرئيسية', fields: [
    ['hero.eyebrow', 'السطر الصغير فوق العنوان'], ['hero.titleLead', 'العنوان'],
    ['hero.titleAccent', 'الجزء الملوّن من العنوان'], ['hero.lead', 'الوصف', 'textarea'],
  ] },
  { title: 'الأهداف', fields: [['goalsHead.title', 'عنوان السكشن'], ['goalsHead.text', 'وصف السكشن', 'textarea']],
    list: { path: 'goals', label: 'هدف', add: 'أضف هدف', min: 1, max: 12, item: [['title', 'العنوان'], ['text', 'النص', 'textarea']] } },
  { title: 'رحلة العضو (لمين المجتمع)', fields: [['journeyHead.title', 'عنوان السكشن'], ['journeyHead.text', 'وصف السكشن', 'textarea']],
    list: { path: 'journey', label: 'محطة', add: 'أضف محطة', min: 2, max: 6, item: [['title', 'العنوان'], ['text', 'النص', 'textarea']] } },
  { title: 'سكشن الفعاليات', note: 'الفعاليات نفسها بتضيفها من تبويب «الفعاليات».', fields: [['eventsHead.title', 'عنوان السكشن'], ['eventsHead.text', 'وصف السكشن']] },
  { title: 'سكشن المعرض', note: 'الصور نفسها بترفعها من تبويب «المعرض».', fields: [['galleryHead.title', 'عنوان السكشن'], ['galleryHead.text', 'وصف السكشن']] },
  { title: 'المجالات', fields: [['fieldsHead.title', 'عنوان السكشن'], ['fieldsHead.text', 'وصف السكشن', 'textarea'], ['fields', 'المجالات (كل مجال بسطر)', 'lines']] },
  { title: 'الدعوة للتسجيل', fields: [['cta.title', 'العنوان'], ['cta.text', 'النص'], ['cta.button', 'نص الزر']] },
  { title: 'الأسئلة الشائعة',
    list: { path: 'faq', label: 'سؤال', add: 'أضف سؤال', min: 1, max: 15, item: [['q', 'السؤال'], ['a', 'الجواب', 'textarea']] } },
];

const content = { data: structuredClone(DEFAULT_CONTENT), dirty: false };
const getPath = (o, p) => p.split('.').reduce((x, k) => (x == null ? x : x[k]), o);
const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((x, k) => x[k], o)[last] = v; };

function markDirty(on = true) {
  content.dirty = on;
  $('content-savebar').classList.toggle('is-dirty', on);
  $('content-status').textContent = on ? 'في تعديلات مش محفوظة' : 'كل التعديلات محفوظة';
}
window.addEventListener('beforeunload', (e) => { if (content.dirty) { e.preventDefault(); e.returnValue = ''; } });

let uid = 0;
function inputFor(label, type, value, onInput) {
  const id = `ce-${++uid}`;
  const control = type === 'textarea'
    ? h('textarea', { id, rows: 3, value })
    : type === 'lines'
      ? h('textarea', { id, rows: 6, value })
      : h('input', { id, type: 'text', value });
  control.addEventListener('input', () => { onInput(control.value); markDirty(); });
  return h('div', { class: 'field' }, h('label', { for: id }, label), control);
}

function renderEditor() {
  uid = 0;
  const c = content.data;
  $('content-editor').replaceChildren(...SCHEMA.map((g) => {
    const panel = h('section', { class: 'panel editor-group' }, h('h3', {}, g.title));
    if (g.note) panel.append(h('p', { class: 'muted small' }, g.note));
    if (g.fields) {
      panel.append(h('div', { class: 'editor-fields' }, g.fields.map(([path, label, type]) => (type === 'lines'
        ? inputFor(label, 'lines', getPath(c, path).join('\n'), (v) => setPath(c, path, v.split('\n').map((s) => s.trim()).filter(Boolean)))
        : inputFor(label, type, getPath(c, path), (v) => setPath(c, path, v))))));
    }
    if (g.list) panel.append(renderList(g.list));
    return panel;
  }));
}

function renderList(spec) {
  const wrap = h('div');
  const draw = () => {
    const arr = getPath(content.data, spec.path);
    const tool = (icon, label, disabled, fn, extra = '') => h('button', {
      type: 'button', class: `icon-btn ${extra}`, 'aria-label': label, title: label, disabled, onclick: fn,
    }, svgIcon(ICONS[icon]));
    const move = (i, d) => { [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; markDirty(); draw(); };
    wrap.replaceChildren(
      h('div', { class: 'list-items' }, arr.map((item, i) => h('div', { class: 'list-item' },
        h('div', { class: 'list-item-head' },
          h('strong', {}, `${spec.label} ${i + 1}`),
          h('div', { class: 'list-item-tools' },
            tool('up', 'لفوق', i === 0, () => move(i, -1)),
            tool('down', 'لتحت', i === arr.length - 1, () => move(i, 1)),
            tool('trash', 'حذف', arr.length <= spec.min, () => { arr.splice(i, 1); markDirty(); draw(); }, 'danger'))),
        spec.item.map(([key, label, type]) => inputFor(label, type, item[key] || '', (v) => { item[key] = v; }))))),
      arr.length < spec.max
        ? h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm add-btn', onclick: () => {
          arr.push(Object.fromEntries(spec.item.map(([k]) => [k, '']))); markDirty(); draw();
          const items = wrap.querySelectorAll('.list-item'); items[items.length - 1].querySelector('input, textarea').focus();
        } }, `+ ${spec.add}`)
        : null);
  };
  draw();
  return wrap;
}

async function loadContent() {
  try {
    const snap = await fs.getDoc(fs.doc(db, 'site', 'content'));
    const { updatedAt, ...saved } = snap.exists() ? snap.data() : {};
    content.data = withDefaults(saved);
  } catch (e) { toast(errMsg(e), true); }
  renderEditor();
  markDirty(false);
}

function validateContent(c) {
  for (const g of SCHEMA) {
    if (g.list) {
      const arr = getPath(c, g.list.path);
      const bad = arr.findIndex((it) => g.list.item.some(([k]) => !String(it[k] || '').trim()));
      if (bad >= 0) return `${g.title}: ${g.list.label} ${bad + 1} فيه خانة فاضية.`;
    }
  }
  return '';
}

$('content-save').addEventListener('click', async () => {
  const msg = validateContent(content.data);
  if (msg) { toast(msg, true); return; }
  const btn = $('content-save');
  setBusy(btn, true);
  try {
    await fs.setDoc(fs.doc(db, 'site', 'content'), { ...content.data, updatedAt: fs.serverTimestamp() });
    markDirty(false);
    toast('انحفظ المحتوى، وصار ظاهر على الموقع');
  } catch (e) { toast(errMsg(e), true); } finally { setBusy(btn, false); }
});
$('content-reset').addEventListener('click', () => {
  if (!confirm('ترجّع كل النصوص للنص الأصلي؟ (ما بتنحفظ إلا لما تضغط «احفظ التعديلات»)')) return;
  content.data = structuredClone(DEFAULT_CONTENT);
  renderEditor();
  markDirty();
});

/* =================== Events =================== */
let events = [];
let editingId = null;

async function loadEvents() {
  try {
    const snap = await fs.getDocs(fs.collection(db, 'events'));
    events = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || ((b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
    renderEvents();
  } catch (e) { toast(errMsg(e), true); }
}

function renderEvents() {
  $('events-empty').hidden = events.length > 0;
  $('event-list').replaceChildren(...events.map((ev) => {
    let when = '';
    if (ev.date) { const d = new Date(`${ev.date}T12:00:00`); if (!isNaN(d)) when = dateFmt.format(d); }
    return h('li', { class: ev.published ? 'event-row' : 'event-row is-draft' },
      h('div', { class: 'event-row-top' },
        h('span', { class: ev.published ? 'badge badge-live' : 'badge badge-draft' }, ev.published ? 'منشور' : 'مسودة'),
        ev.date && ev.date < new Date().toISOString().slice(0, 10)
          ? h('span', { class: 'badge badge-draft', title: 'تاريخها فات، فما بتظهر على الموقع' }, 'انتهت') : null,
        h('span', { class: 'meta' }, [EVENT_TYPES[ev.type] || 'فعالية', when, ev.place].filter(Boolean).join(' · '))),
      h('h3', {}, ev.title),
      ev.description ? h('p', { class: 'meta' }, ev.description.length > 140 ? `${ev.description.slice(0, 140)}…` : ev.description) : null,
      h('div', { class: 'event-row-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => editEvent(ev) }, 'تعديل'),
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => togglePublish(ev) }, ev.published ? 'إخفاء من الموقع' : 'انشر'),
        h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: () => deleteEvent(ev) }, 'حذف')));
  }));
}

function resetEventForm() {
  editingId = null;
  $('event-form').reset();
  $('ev-published').checked = true;
  $('event-error').textContent = '';
  $('event-form-title').textContent = 'فعالية أو إعلان جديد';
  $('event-save').querySelector('.btn-label').textContent = 'أضف';
  $('event-cancel').hidden = true;
}
function editEvent(ev) {
  editingId = ev.id;
  $('ev-type').value = ev.type || 'event';
  $('ev-title').value = ev.title || '';
  $('ev-date').value = ev.date || '';
  $('ev-place').value = ev.place || '';
  $('ev-desc').value = ev.description || '';
  $('ev-link').value = ev.link || '';
  $('ev-published').checked = !!ev.published;
  $('event-form-title').textContent = 'تعديل';
  $('event-save').querySelector('.btn-label').textContent = 'احفظ التعديل';
  $('event-cancel').hidden = false;
  $('event-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('ev-title').focus({ preventScroll: true });
}
$('event-cancel').addEventListener('click', resetEventForm);

$('event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('event-error');
  err.textContent = '';
  const link = $('ev-link').value.trim();
  const data = {
    type: $('ev-type').value,
    title: $('ev-title').value.trim(),
    date: $('ev-date').value,
    place: $('ev-place').value.trim(),
    description: $('ev-desc').value.trim(),
    link,
    published: $('ev-published').checked,
    updatedAt: fs.serverTimestamp(),
  };
  if (!data.title) { err.textContent = 'اكتب عنوان.'; $('ev-title').focus(); return; }
  if (link && !safeUrl(link)) { err.textContent = 'الرابط لازم يبدأ بـ https://'; $('ev-link').focus(); return; }
  const btn = $('event-save');
  setBusy(btn, true);
  try {
    if (editingId) await fs.updateDoc(fs.doc(db, 'events', editingId), data);
    else await fs.addDoc(fs.collection(db, 'events'), { ...data, createdAt: fs.serverTimestamp() });
    toast(editingId ? 'انحفظ التعديل' : (data.published ? 'انضافت وانشرت على الموقع' : 'انضافت كمسودة'));
    resetEventForm();
    await loadEvents();
  } catch (e2) { err.textContent = errMsg(e2); } finally { setBusy(btn, false); }
});

async function togglePublish(ev) {
  try {
    await fs.updateDoc(fs.doc(db, 'events', ev.id), { published: !ev.published, updatedAt: fs.serverTimestamp() });
    toast(ev.published ? 'انخفت من الموقع' : 'انشرت على الموقع');
    await loadEvents();
  } catch (e) { toast(errMsg(e), true); }
}
async function deleteEvent(ev) {
  if (!confirm(`حذف «${ev.title}» نهائياً؟`)) return;
  try {
    await fs.deleteDoc(fs.doc(db, 'events', ev.id));
    if (editingId === ev.id) resetEventForm();
    toast('انحذفت');
    await loadEvents();
  } catch (e) { toast(errMsg(e), true); }
}

/* =================== Gallery =================== */
// Photos live in Firestore (no Cloud Storage / paid plan needed):
//   gallery/{id}     → thumb (small data URL), caption, published, order, w, h   (listed on the home page)
//   galleryFull/{id} → src (full image data URL, ≤ ~900 KB)                       (loaded when a photo is opened)
let gallery = [];

const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
  img.src = url;
});
function encode(img, maxSide, maxChars, startQ) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  let w = Math.round(img.naturalWidth * scale);
  let h2 = Math.round(img.naturalHeight * scale);
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h2;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h2); // PNG transparency → white
    ctx.drawImage(img, 0, 0, w, h2);
    for (let q = startQ; q >= 0.5; q -= 0.08) {
      const data = c.toDataURL('image/jpeg', q);
      if (data.length <= maxChars) return { data, w, h: h2 };
    }
    w = Math.round(w * 0.82); h2 = Math.round(h2 * 0.82); // still too big: shrink and retry
  }
  throw new Error('too-big');
}

async function loadGallery() {
  try {
    const snap = await fs.getDocs(fs.collection(db, 'gallery'));
    gallery = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderGalleryAdmin();
  } catch (e) { toast(errMsg(e), true); }
}

function renderGalleryAdmin() {
  $('gallery-empty').hidden = gallery.length > 0;
  $('gallery-list').replaceChildren(...gallery.map((p, i) => {
    const cap = h('input', { type: 'text', value: p.caption || '', maxlength: 140, placeholder: 'وصف قصير (اختياري)', 'aria-label': 'وصف الصورة' });
    cap.addEventListener('change', async () => {
      try { await fs.updateDoc(fs.doc(db, 'gallery', p.id), { caption: cap.value.trim(), updatedAt: fs.serverTimestamp() }); p.caption = cap.value.trim(); toast('انحفظ الوصف'); } catch (e) { toast(errMsg(e), true); }
    });
    return h('li', { class: p.published ? 'g-item' : 'g-item is-draft' },
      h('img', { src: p.thumb, alt: p.caption || '' }),
      h('span', { class: p.published ? 'badge badge-live' : 'badge badge-draft' }, p.published ? 'منشورة' : 'مسودة'),
      h('div', { class: 'field' }, cap),
      h('div', { class: 'g-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => togglePhoto(p) }, p.published ? 'إخفاء' : 'انشر'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'لقدام', title: 'لقدام', disabled: i === 0, onclick: () => movePhoto(i, -1) }, svgIcon(ICONS.up)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'لورا', title: 'لورا', disabled: i === gallery.length - 1, onclick: () => movePhoto(i, 1) }, svgIcon(ICONS.down)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'حذف الصورة', title: 'حذف', onclick: () => deletePhoto(p) }, svgIcon(ICONS.trash))));
  }));
}

async function uploadFiles(files) {
  const list = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
  if (!list.length) { toast('اختار صور JPG أو PNG أو WebP', true); return; }
  const progress = $('gallery-progress');
  let done = 0; let failed = 0;
  const minOrder = gallery.reduce((m, p) => Math.min(m, p.order ?? 0), 0);
  for (const file of list) {
    progress.textContent = `جاري رفع ${done + failed + 1} من ${list.length}…`;
    try {
      const img = await loadImage(file);
      const full = encode(img, 1600, 900000, 0.82);
      const thumb = encode(img, 520, 90000, 0.74);
      const ref = fs.doc(fs.collection(db, 'gallery'));
      const batch = fs.writeBatch(db);
      batch.set(ref, {
        thumb: thumb.data, caption: '', published: false, order: minOrder - list.length + done,
        w: thumb.w, h: thumb.h, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp(),
      });
      batch.set(fs.doc(db, 'galleryFull', ref.id), { src: full.data });
      await batch.commit();
      done++;
    } catch (e) { console.error(e); failed++; }
  }
  progress.textContent = failed ? `انرفعت ${done}، وفشلت ${failed}.` : `انرفعت ${done} صورة كمسودة. انشرها لما تكون جاهزة.`;
  $('gallery-input').value = '';
  await loadGallery();
}

$('gallery-input').addEventListener('change', (e) => uploadFiles(e.target.files));
const dz = $('dropzone');
['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, () => dz.classList.remove('is-over')));
dz.addEventListener('drop', (e) => { e.preventDefault(); uploadFiles(e.dataTransfer.files); });

async function togglePhoto(p) {
  try {
    await fs.updateDoc(fs.doc(db, 'gallery', p.id), { published: !p.published, updatedAt: fs.serverTimestamp() });
    toast(p.published ? 'انخفت من الموقع' : 'انشرت على الموقع');
    await loadGallery();
  } catch (e) { toast(errMsg(e), true); }
}
async function movePhoto(i, d) {
  const a = gallery[i]; const b = gallery[i + d];
  if (!a || !b) return;
  try {
    const batch = fs.writeBatch(db);
    // re-number everything so the order is always clean
    const next = [...gallery]; [next[i], next[i + d]] = [next[i + d], next[i]];
    next.forEach((p, k) => { if ((p.order ?? null) !== k) batch.update(fs.doc(db, 'gallery', p.id), { order: k, updatedAt: fs.serverTimestamp() }); });
    await batch.commit();
    await loadGallery();
  } catch (e) { toast(errMsg(e), true); }
}
async function deletePhoto(p) {
  if (!confirm('حذف الصورة نهائياً؟')) return;
  try {
    const batch = fs.writeBatch(db);
    batch.delete(fs.doc(db, 'gallery', p.id));
    batch.delete(fs.doc(db, 'galleryFull', p.id));
    await batch.commit();
    toast('انحذفت الصورة');
    await loadGallery();
  } catch (e) { toast(errMsg(e), true); }
}

/* =================== Settings =================== */
// same rules as the registration form: Arabic digits ok, local 05x → +970
function normalizePhone(v) {
  let s = String(v ?? '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (/^05\d{8}$/.test(s)) s = `+970${s.slice(1)}`;
  else if (/^(970|972)\d{9}$/.test(s)) s = `+${s}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}
const syncOpenLabel = () => { $('set-open-label').textContent = $('set-open').checked ? 'التسجيل مفتوح' : 'التسجيل مسكّر'; };
$('set-open').addEventListener('change', syncOpenLabel);

// site/settings is shared by two tabs (التواصل / الإعدادات): each one saves only its own fields (merge).
async function loadSettings() {
  let s = DEFAULT_SETTINGS;
  try {
    const snap = await fs.getDoc(fs.doc(db, 'site', 'settings'));
    if (snap.exists()) s = { ...DEFAULT_SETTINGS, ...snap.data() };
  } catch (e) { toast(errMsg(e), true); }
  $('set-open').checked = s.registrationOpen !== false;
  $('set-msg').value = s.closedMessage || '';
  $('set-group').value = s.whatsappGroup || '';
  syncOpenLabel();
  fillSocial(s);
}
$('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const group = $('set-group').value.trim();
  if (group && !safeUrl(group)) { toast('رابط القروب لازم يبدأ بـ https://', true); $('set-group').focus(); return; }
  const btn = $('settings-save');
  setBusy(btn, true);
  try {
    await fs.setDoc(fs.doc(db, 'site', 'settings'), {
      registrationOpen: $('set-open').checked,
      closedMessage: $('set-msg').value.trim() || DEFAULT_SETTINGS.closedMessage,
      whatsappGroup: group,
      updatedAt: fs.serverTimestamp(),
    }, { merge: true });
    toast($('set-open').checked ? 'انحفظ: التسجيل مفتوح' : 'انحفظ: التسجيل مسكّر');
  } catch (e2) { toast(errMsg(e2), true); } finally { setBusy(btn, false); }
});

/* =================== Contact & social =================== */
const SOCIAL_ROWS = [
  ...SOCIAL_PLATFORMS.map((p) => ({ key: p.key, name: p.name, example: p.example, domain: p.domain, icon: p.key })),
  { key: 'other1', name: 'رابط آخر', example: 'https://…', icon: 'link', other: true },
  { key: 'other2', name: 'رابط آخر', example: 'https://…', icon: 'link', other: true },
];
const socialInputs = {};
let socialDirty = false;

const withHttps = (v) => { v = String(v ?? '').trim(); return !v || /^https?:\/\//i.test(v) ? v : `https://${v}`; };
function socialError(row, raw) {
  const url = withHttps(raw);
  if (!url) return '';
  let ok = false;
  try { const u = new URL(url); ok = !!safeUrl(url) && u.hostname.includes('.'); } catch { ok = false; }
  if (!ok) return 'الرابط مش صحيح.';
  if (!row.other && socialInfo(url)?.icon !== row.key) return `هاد مش رابط ${row.name}. لازم يكون من ${row.domain}`;
  return '';
}
function showFieldError(id, msg) {
  const input = $(id);
  input.closest('.field').classList.toggle('has-error', !!msg);
  input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  $(`${id}-error`).textContent = msg;
}

function validateDirect(id) {
  const v = $(id).value.trim();
  const msg = id === 'set-contact'
    ? (v && !normalizePhone(v) ? 'الرقم مش صحيح. مثال: 0591234567 أو +970591234567' : '')
    : (v && !isEmail(v.toLowerCase()) ? 'الإيميل مش صحيح. مثال: info@beitlahia.tech' : '');
  showFieldError(id, msg);
  return !msg;
}

function buildSocialFields() {
  document.querySelectorAll('.sf-icon[data-icon]').forEach((el) => el.replaceChildren(iconSvg(el.dataset.icon)));
  $('social-fields').replaceChildren(...SOCIAL_ROWS.map((row) => {
    const id = `soc-${row.key}`;
    const input = h('input', { id, type: 'url', dir: 'ltr', maxlength: 300, placeholder: row.example, autocomplete: 'off' });
    socialInputs[row.key] = input;
    input.addEventListener('input', () => {
      if (input.closest('.field').classList.contains('has-error')) showFieldError(id, socialError(row, input.value));
      socialChanged();
    });
    input.addEventListener('blur', () => showFieldError(id, socialError(row, input.value)));
    return h('div', { class: 'field social-field' },
      h('label', { for: id }, h('span', { class: 'sf-icon' }, iconSvg(row.icon)), row.name),
      input, h('p', { class: 'error', id: `${id}-error` }));
  }));
  ['set-contact', 'set-email'].forEach((id) => {
    $(id).addEventListener('input', () => {
      if ($(id).closest('.field').classList.contains('has-error')) validateDirect(id);
      socialChanged();
    });
    $(id).addEventListener('blur', () => validateDirect(id));
  });
}

function collectSocial() {
  const email = $('set-email').value.trim().toLowerCase();
  return {
    contactWhatsapp: normalizePhone($('set-contact').value),
    contactEmail: isEmail(email) ? email : '',
    socialLinks: SOCIAL_ROWS.map((row) => withHttps(socialInputs[row.key].value))
      .filter((u, i) => u && !socialError(SOCIAL_ROWS[i], u)),
  };
}

function previewSocial() {
  const preview = $('social-preview');
  renderFooterLinks(preview, collectSocial());
  const any = preview.children.length > 0;
  $('social-preview-empty').hidden = any;
  preview.closest('.social-preview').querySelector('.footer-title').hidden = !any;
}

function socialChanged() {
  socialDirty = true;
  $('social-status').textContent = 'في تعديلات مش محفوظة';
  previewSocial();
}

function fillSocial(s) {
  $('set-contact').value = s.contactWhatsapp || '';
  $('set-email').value = s.contactEmail || '';
  Object.values(socialInputs).forEach((i) => { i.value = ''; });
  const links = Array.isArray(s.socialLinks) ? s.socialLinks : DEFAULT_SETTINGS.socialLinks;
  const others = SOCIAL_ROWS.filter((r) => r.other).map((r) => socialInputs[r.key]);
  links.forEach((url) => {
    const key = socialInfo(url)?.icon;
    const own = key && key !== 'link' ? socialInputs[key] : null;
    const target = own && !own.value ? own : others.find((i) => !i.value);
    if (target) target.value = url;
  });
  ['set-contact', 'set-email', ...SOCIAL_ROWS.map((r) => `soc-${r.key}`)].forEach((id) => showFieldError(id, ''));
  socialDirty = false;
  $('social-status').textContent = '';
  previewSocial();
}

$('social-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bad = [];
  if (!validateDirect('set-contact')) bad.push('set-contact');
  if (!validateDirect('set-email')) bad.push('set-email');
  SOCIAL_ROWS.forEach((row) => {
    const id = `soc-${row.key}`;
    const msg = socialError(row, socialInputs[row.key].value);
    showFieldError(id, msg);
    if (msg) bad.push(id);
  });
  if (bad.length) { $(bad[0]).focus(); toast('في خانات بحاجة تعديل.', true); return; }
  const btn = $('social-save');
  setBusy(btn, true);
  try {
    await fs.setDoc(fs.doc(db, 'site', 'settings'), { ...collectSocial(), updatedAt: fs.serverTimestamp() }, { merge: true });
    socialDirty = false;
    $('social-status').textContent = 'انحفظ';
    toast('انحفظ التواصل، وصار ظاهر بفوتر الموقع');
  } catch (e2) { toast(errMsg(e2), true); } finally { setBusy(btn, false); }
});
window.addEventListener('beforeunload', (e) => { if (socialDirty) { e.preventDefault(); e.returnValue = ''; } });
buildSocialFields();

/* =================== Backup =================== */
// Everything the admin can read, as one JSON file (Timestamps → ISO strings).
const plainData = (v) => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plainData);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plainData(x)]));
  return v;
};

$('backup-btn').addEventListener('click', async () => {
  const btn = $('backup-btn');
  setBusy(btn, true, 'جاري التجهيز…');
  try {
    const all = async (name) => (await fs.getDocs(fs.collection(db, name))).docs.map((d) => ({ id: d.id, ...plainData(d.data()) }));
    const one = async (name, id) => { const s = await fs.getDoc(fs.doc(db, name, id)); return s.exists() ? plainData(s.data()) : null; };
    const [membersAll, eventsAll, galleryAll, statsAll, siteContent, siteSettings] = await Promise.all([
      all('members'), all('events'), all('gallery'), all('stats'), one('site', 'content'), one('site', 'settings'),
    ]);
    const backup = {
      app: 'beit-lahia-tech', version: 1, exportedAt: new Date().toISOString(),
      members: membersAll, events: eventsAll, gallery: galleryAll, stats: statsAll,
      site: { content: siteContent, settings: siteSettings },
    };
    if ($('backup-full').checked) backup.galleryFull = await all('galleryFull');
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `beit-lahia-backup-${gazaDay()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`نزلت النسخة: ${membersAll.length} تسجيل، ${eventsAll.length} فعالية، ${galleryAll.length} صورة`);
  } catch (e) { console.error(e); toast(errMsg(e), true); } finally { setBusy(btn, false, 'نزّل نسخة احتياطية'); }
});
