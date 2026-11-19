// Beit Lahia Tech — admin dashboard
import { getDb, getAuth } from './firebase-init.js';
import { gazaDay } from './track.js';
import { DEFAULT_CONTENT, DEFAULT_SETTINGS, EVENT_TYPES, withDefaults, safeUrl, isEmail, SOCIAL_PLATFORMS, socialInfo, renderFooterLinks } from './content-defaults.js';
import { iconSvg } from './icons.js';
import { DEFAULT_WORKSHOP, mergeWorkshop, normalizeTopic, renderCertificate, fitSheet, arDate, WS_STATUS, WS_LEVEL, WS_STATES, AI_TOOLS, isScheduled, FORM_FIELDS, placeText } from './workshop-shared.js';

import { SURVEY_TOPICS, SURVEY_FORMATS, SURVEY_STATUS, TRAINER_MODES } from './forms-shared.js';
import { initStudio, showStudio, openWorkshopCampaign } from './admin-social.js?v=8';
import { initAccess, PERMS, OWNER_EMAIL } from './admin-access.js?v=3';
import { withActivity, startActivity, logAction } from './admin-activity.js?v=2';
import { initPeople, openScanner, openProfile, renderMessages, mailCerts, setAttendance, attendedText, mailPasses, pendingPassMails, mailPendingCerts, pendingCertMails, waHref } from './admin-people.js?v=1';

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
const { db, fs: fsPlain } = await getDb();
// every write made from the panel shows up in the owner's activity log (admin-activity.js)
const fs = withActivity(fsPlain);
let booted = false;

// perms = the sections this admin may open (admins/{uid}.perms); null = everything (owner, or an admin
// added before permissions existed). Firestore rules enforce the same thing on the data itself.
const me = { owner: false, perms: null };
const can = (p) => me.owner || me.perms === null || me.perms.includes(p);
const isFull = () => me.owner || me.perms === null;
function tabAllowed(t) {
  if (t === 'admins') return me.owner;
  if (t === 'overview') return true;
  if (t === 'total') return can('members') && can('workshops');
  if (t === 'messages') return can('members') || can('workshops');
  const hit = PERMS.find(([, , tabs]) => tabs.includes(t));
  return hit ? can(hit[0]) : isFull();
}

// an invite (adminInvites/{email}) becomes access on the first sign-in with a verified email
async function claimInvite(user) {
  const email = (user.email || '').toLowerCase();
  if (!email) return null;
  let inv;
  try { inv = await fs.getDoc(fs.doc(db, 'adminInvites', email)); } catch { return null; }
  if (!inv.exists()) return null;
  try { await user.reload(); } catch { /* offline: keep what we have */ }
  if (!auth.currentUser.emailVerified) {
    try { await au.sendEmailVerification(auth.currentUser); } catch { /* sent recently */ }
    return { pending: true };
  }
  await auth.currentUser.getIdToken(true); // the rules need email_verified in the token
  const d = inv.data();
  const data = { email, name: d.name || '', perms: d.perms || [], ...(d.addedBy ? { addedBy: d.addedBy } : {}), createdAt: fs.serverTimestamp() };
  await fs.setDoc(fs.doc(db, 'admins', user.uid), data);
  await fs.deleteDoc(inv.ref).catch(() => {});
  return { data };
}

au.onAuthStateChanged(auth, async (user) => {
  if (!user) { show('view-login'); return; }
  let data = null;
  try { const snap = await fs.getDoc(fs.doc(db, 'admins', user.uid)); if (snap.exists()) data = snap.data(); } catch { data = null; }
  let note = '';
  if (!data) {
    try {
      const c = await claimInvite(user);
      if (c?.data) data = c.data;
      else if (c?.pending) note = `عندك دعوة للوحة الإدارة. بعتنالك إيميل تأكيد على ${user.email}: افتح الرابط اللي فيه، وبعدين ارجع لهون وحدّث الصفحة.`;
    } catch (e) { console.warn('[invite]', e); }
  }
  if (!data) {
    $('denied-email').textContent = user.email || '';
    $('denied-uid').textContent = user.uid;
    $('denied-note').textContent = note;
    $('denied-note').hidden = !note;
    show('view-denied');
    return;
  }
  me.owner = (user.email || '').toLowerCase() === OWNER_EMAIL;
  me.perms = Array.isArray(data.perms) && !me.owner ? data.perms : null;
  applyPerms();
  $('admin-email').textContent = user.email || '';
  try { localStorage.setItem('blt-admin', '1'); } catch { /* ignore */ } // this browser isn't counted in the visits
  show('view-app');
  if (!booted) { booted = true; boot(); startActivity({ db, fs: fsPlain, user, tab: () => location.hash.slice(1) }); }
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
const TABS = ['overview', 'members', 'team', 'total', 'messages', 'trainers', 'survey', 'forms', 'workshop', 'cert', 'content', 'events', 'gallery', 'social', 'studio', 'stats', 'settings', 'admins']; // same order as the sidebar
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Page-head title per tab: the section's own first heading (hidden in place), else the sidebar label.
// The crumb is the sidebar group the tab sits under.
const TAB_META = {};
TABS.forEach((t) => {
  const btn = $(`tab-btn-${t}`);
  let g = btn.previousElementSibling;
  while (g && !g.classList.contains('tab-group')) g = g.previousElementSibling;
  const intro = $(`tab-${t}`).querySelector(':scope > .tab-intro:first-child h2');
  if (intro) intro.classList.add('moved-title');
  TAB_META[t] = { title: intro ? intro.textContent.trim() : btn.textContent.trim(), group: g ? g.textContent.trim() : 'لوحة الإدارة' };
});

function moveIndicator() {
  const ind = document.querySelector('.tab-ind');
  const btn = document.querySelector('.admin-tabs [aria-selected="true"]');
  if (!ind || !btn) return;
  const first = !ind.dataset.placed; // first placement: jump there, glide only on later moves
  if (first) ind.style.transition = 'none';
  ind.style.transform = `translateY(${btn.offsetTop}px)`;
  ind.style.height = `${btn.offsetHeight}px`;
  if (first && btn.offsetHeight) { void ind.offsetWidth; ind.style.transition = ''; ind.dataset.placed = '1'; }
}
addEventListener('resize', moveIndicator);

function enterPanel(sec) {
  if (reduceMotion.matches) return;
  sec.classList.remove('is-entering');
  void sec.offsetWidth; // restart the animation
  sec.classList.add('is-entering');
}

function selectTab(name, focus = false) {
  if (!tabAllowed(name)) name = 'overview';
  TABS.forEach((t) => {
    const btn = $(`tab-btn-${t}`);
    const on = t === name;
    btn.setAttribute('aria-selected', on);
    btn.tabIndex = on ? 0 : -1;
    $(`tab-${t}`).hidden = !on;
    if (on && t === 'cert') { const fix = () => { refitPreview(); refreshPreview(); }; requestAnimationFrame(fix); setTimeout(fix, 250); }
    if (on && t === 'total') renderTotal();
    if (on && t === 'messages') renderMessages();
    if (on && t === 'overview') renderOverview(true);
    if (on && t === 'studio') showStudio();
    if (on && focus) btn.focus();
  });
  $('ph-title').textContent = TAB_META[name].title;
  $('ph-crumb').textContent = TAB_META[name].group;
  document.title = `${TAB_META[name].title} | لوحة الإدارة`;
  enterPanel($(`tab-${name}`));
  enterPanel(document.querySelector('.ph-text'));
  moveIndicator();
  setDrawer(false);
  history.replaceState(null, '', `#${name}`);
}

// sidebar, shortcuts and overview panels follow the permissions
function applyPerms() {
  TABS.forEach((t) => { $(`tab-btn-${t}`).hidden = !tabAllowed(t); });
  document.querySelectorAll('.admin-tabs .tab-group').forEach((g) => { // a group label with nothing under it goes too
    let n = g.nextElementSibling; let any = false;
    while (n && !n.classList.contains('tab-group')) { if (n.getAttribute('role') === 'tab' && !n.hidden) any = true; n = n.nextElementSibling; }
    g.hidden = !any;
  });
  document.querySelectorAll('#ov-quick [data-goto], #tab-overview .ov-panel-head [data-goto]').forEach((b) => { b.hidden = !tabAllowed(b.dataset.goto); });
  document.querySelector('.ov-chart-panel').hidden = !can('members') && !can('workshops');
  document.querySelector('.ov-latest-panel').hidden = !can('members') && !can('workshops');
  $('ov-ws').hidden = !can('workshops');
  const backup = $('backup-btn')?.closest('.set-card');
  if (backup) backup.hidden = !isFull(); // a full backup reads every collection
  moveIndicator();
}

/* mobile: the sidebar is a drawer */
function setDrawer(open) {
  const side = $('admin-side');
  if (open === side.classList.contains('is-open')) return;
  side.classList.toggle('is-open', open);
  $('side-backdrop').hidden = !open;
  $('menu-btn').setAttribute('aria-expanded', String(open));
  document.body.classList.toggle('drawer-open', open);
  if (open) requestAnimationFrame(moveIndicator);
}
$('menu-btn').addEventListener('click', () => setDrawer(!$('admin-side').classList.contains('is-open')));
$('side-backdrop').addEventListener('click', () => setDrawer(false));
addEventListener('keydown', (e) => { if (e.key === 'Escape') setDrawer(false); });

// any [data-goto="tab"] button jumps to that tab
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-goto]');
  if (b && TABS.includes(b.dataset.goto) && tabAllowed(b.dataset.goto)) { selectTab(b.dataset.goto); scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' }); }
});

$('ph-date').textContent = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
TABS.forEach((t, i) => {
  const btn = $(`tab-btn-${t}`);
  btn.addEventListener('click', () => selectTab(t));
  btn.addEventListener('keydown', (e) => {
    // RTL: ArrowLeft moves to the next tab
    const dir = ['ArrowLeft', 'ArrowDown'].includes(e.key) ? 1 : ['ArrowRight', 'ArrowUp'].includes(e.key) ? -1 : 0;
    if (dir) {
      e.preventDefault();
      const open = TABS.filter(tabAllowed); // skip the sections this admin can't open
      selectTab(open[(open.indexOf(t) + dir + open.length) % open.length], true);
    }
  });
});

function boot() {
  // modules first: the first selectTab may open their section right away
  $('wsa-social').hidden = !can('studio');
  if (can('studio')) initStudio({ h, toast, setBusy, db, fs, log: logAction, owner: me.owner, user: () => auth.currentUser, getToken: () => auth.currentUser.getIdToken() });
  if (me.owner) initAccess({ h, toast, setBusy, db, fs, au, auth, tabTitle: (t) => TAB_META[t]?.title || '' });
  const hash = location.hash.slice(1);
  // a limited admin lands on their own first section (the overview has little for them)
  const home = isFull() ? 'overview' : TABS.find((t) => t !== 'overview' && tabAllowed(t)) || 'overview';
  selectTab(TABS.includes(hash) && tabAllowed(hash) ? hash : home);
  requestAnimationFrame(moveIndicator);
  document.fonts?.ready.then(moveIndicator);
  if (can('members')) loadMembers();
  if (can('stats')) loadTraffic();
  if (can('site')) { loadContent(); loadEvents(); loadGallery(); }
  if (can('team')) loadTeam();
  loadSettings(); // site/settings is public
  if (can('workshops')) loadWorkshopAll();
  if (can('forms')) { loadTrainers(); loadSurveys(); loadFormsCfg(); }
}

/* =================== Overview =================== */
let siteSettings = null; // filled by loadSettings
const loaded = new Set(); // which data sources finished at least once

// Animate a number from what the element shows now to `to`.
function countUp(el, to) {
  const from = Number(el.dataset.v || 0);
  el.dataset.v = to;
  if (reduceMotion.matches || from === to) { el.textContent = num(to); return; }
  const t0 = performance.now();
  const dur = 900;
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - (1 - p) ** 4;
    el.textContent = num(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const relFmt = new Intl.RelativeTimeFormat('ar', { numeric: 'auto' });
function ago(ms) {
  const s = (ms - Date.now()) / 1000;
  const abs = Math.abs(s);
  if (abs < 60) return 'هلأ';
  if (abs < 3600) return relFmt.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return relFmt.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 30) return relFmt.format(Math.round(s / 86400), 'day');
  return dateFmt.format(new Date(ms));
}

function tabIcon(t) {
  const svg = $(`tab-btn-${t}`).querySelector('svg');
  return svg ? svg.cloneNode(true) : null;
}

function setTabCount(t, n) {
  const btn = $(`tab-btn-${t}`);
  let em = btn.querySelector('.tab-count');
  if (!em) { em = h('em', { class: 'tab-count' }); btn.append(em); }
  em.hidden = !n;
  if (em.textContent !== String(n)) { em.textContent = n; em.classList.remove('pop'); void em.offsetWidth; em.classList.add('pop'); }
}

function renderOverview(enter = false) {
  if ($('tab-overview').hidden && !enter) { syncTabCounts(); return; }
  const now = Date.now();
  const week = now - 7 * 864e5;
  const prevWeek = now - 14 * 864e5;
  const inRange = (t, a, b) => { const ms = tsOf(t); return ms >= a && ms < b; };
  const newWeek = members.filter((m) => inRange(m.createdAt, week, Infinity)).length;
  const newPrev = members.filter((m) => inRange(m.createdAt, prevWeek, week)).length;
  const visits7 = lastDays(7).reduce((s, d) => s + (traffic[d]?.home || 0), 0);
  const uncontacted = members.filter((m) => !m.contacted).length;

  // greeting
  const hr = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Gaza' }).format(new Date()));
  $('ov-hello').textContent = hr < 12 ? 'صباح الخير 👋' : 'مساء الخير 👋';

  // status chips
  const cur = workshops.find((w) => w.id === currentId);
  const regOpen = siteSettings ? siteSettings.registrationOpen !== false : null;
  const chips = [];
  if (regOpen != null) chips.push(h('button', { type: 'button', class: `ov-chip ${regOpen ? 'is-on' : 'is-off'}`, 'data-goto': 'settings' }, h('i'), regOpen ? 'التسجيل بالمجتمع مفتوح' : 'التسجيل بالمجتمع مسكّر'));
  if (cur) {
    const open = cur.status === 'live' && cur.open && !isScheduled(cur);
    chips.push(h('button', { type: 'button', class: `ov-chip ${open ? 'is-on' : 'is-off'}`, 'data-goto': 'workshop' }, h('i'), `${wsName(cur)}: ${open ? 'التسجيل مفتوح' : 'التسجيل مسكّر'}`));
  }
  if (newWeek) chips.push(h('button', { type: 'button', class: 'ov-chip is-new', 'data-goto': 'members' }, h('i'), `${num(newWeek)} تسجيل جديد هالأسبوع`));
  $('ov-chips').replaceChildren(...chips.filter((c) => tabAllowed(c.dataset.goto)));

  // KPI cards (clickable, jump to their tab)
  const diff = newWeek - newPrev;
  const kpis = [
    { tab: 'members', label: 'مسجّلين بالمجتمع', value: members.length, ready: loaded.has('members'), accent: true,
      sub: loaded.has('members') ? (diff === 0 ? 'نفس الأسبوع الماضي' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} عن الأسبوع الماضي`) : '', trend: Math.sign(diff) },
    { tab: 'members', label: 'لسا ما تواصلنا معهم', value: uncontacted, ready: loaded.has('members'), sub: uncontacted ? 'بستنّوا رسالة منك' : 'تواصلت مع الكل 🎉' },
    { tab: 'workshop', label: 'تسجيلات الورشات', value: allRegs.length, ready: loaded.has('workshops'), sub: `${num(workshops.length)} ورشة بالسجل` },
    { tab: 'cert', label: 'شهادات انطبعت', value: allCerts.length, ready: loaded.has('workshops'), sub: 'بكل الورشات' },
    { tab: 'trainers', label: 'مدربين متطوعين', value: trainers.length, ready: loaded.has('trainers'), sub: 'من فورم المدربين' },
    { tab: 'survey', label: 'ردود الاستبيان', value: surveys.length, ready: loaded.has('surveys'), sub: 'على المواضيع المطلوبة' },
    { tab: 'stats', label: 'زيارات آخر 7 أيام', value: visits7, ready: loaded.has('traffic'), sub: 'للصفحة الرئيسية' },
    { tab: 'total', label: 'الإجمالي بدون تكرار', value: mergePeople().people.length, ready: loaded.has('members') && loaded.has('workshops'), sub: 'المجتمع + الورشات' },
  ].filter((k) => tabAllowed(k.tab));
  const box = $('ov-kpis');
  if (box.children.length !== kpis.length) {
    box.replaceChildren(...kpis.map((k, i) => h('button', { type: 'button', class: `kpi${k.accent ? ' kpi-accent' : ''}`, 'data-goto': k.tab, style: `--i:${i}` },
      h('span', { class: 'kpi-icon' }, tabIcon(k.tab)),
      h('span', { class: 'kpi-value is-loading' }, '0'),
      h('span', { class: 'kpi-label' }, k.label),
      h('span', { class: 'kpi-sub' }))));
  }
  kpis.forEach((k, i) => {
    const card = box.children[i];
    const v = card.querySelector('.kpi-value');
    const sub = card.querySelector('.kpi-sub');
    sub.textContent = k.ready ? k.sub : '';
    sub.dataset.trend = k.trend ?? '';
    if (!k.ready) return;
    v.classList.remove('is-loading');
    if (enter) v.dataset.v = 0; // count up from zero each time the page opens
    countUp(v, k.value);
  });

  renderOvChart();
  renderOvLatest();
  renderOvWorkshop(cur);
  syncTabCounts();
}

function renderOvChart() {
  const days = lastDays(14);
  const byDay = (list) => list.reduce((acc, x) => { if (x.createdAt?.toDate) { const d = gazaDay(x.createdAt.toDate()); acc[d] = (acc[d] || 0) + 1; } return acc; }, {});
  const mDay = byDay(members);
  const wDay = byDay(allRegs);
  const rows = days.map((d) => ({ d, m: mDay[d] || 0, w: wDay[d] || 0, v: traffic[d]?.home || 0 }));
  const peak = Math.max(1, ...rows.map((r) => r.m + r.w));
  const chart = $('ov-chart');
  const total = rows.reduce((s, r) => s + r.m + r.w, 0);
  chart.setAttribute('aria-label', `التسجيلات آخر 14 يوم: ${total} تسجيل، أعلى يوم ${peak}`);
  chart.replaceChildren(...rows.map((r, i) => {
    const label = dayFmt.format(new Date(`${r.d}T12:00:00Z`));
    const col = h('div', { class: 'ov-col', style: `--i:${i}`, 'data-i': i },
      h('div', { class: 'ov-stack', style: `height:${((r.m + r.w) / peak) * 100}%` },
        r.w ? h('i', { class: 'seg-w', style: `flex:${r.w}` }) : null,
        r.m ? h('i', { class: 'seg-m', style: `flex:${r.m}` }) : null),
      h('span', { class: 'ov-x' }, i % 2 === 1 || i === 13 ? label : ''));
    return col;
  }));
  const tip = $('ov-tip');
  const show = (col) => {
    const r = rows[Number(col.dataset.i)];
    tip.replaceChildren(h('strong', {}, dayFmt.format(new Date(`${r.d}T12:00:00Z`))),
      h('span', {}, `بالمجتمع: ${num(r.m)}`), h('span', {}, `بالورشات: ${num(r.w)}`), h('span', {}, `زيارات: ${num(r.v)}`));
    tip.hidden = false;
    const wrap = chart.parentElement.getBoundingClientRect();
    const c = col.getBoundingClientRect();
    tip.style.left = `${Math.min(Math.max(c.left + c.width / 2 - wrap.left, 70), wrap.width - 70)}px`;
  };
  chart.onpointerover = (e) => { const col = e.target.closest('.ov-col'); if (col) show(col); };
  chart.onpointerleave = () => { tip.hidden = true; };
}

function renderOvLatest() {
  if (!loaded.has('members')) return;
  const items = [
    ...members.map((m) => ({ name: m.name, t: tsOf(m.createdAt), src: 'المجتمع', cls: 'src-m', sub: STATUS[m.status] || '', tab: 'members' })),
    ...allRegs.map((r) => ({ name: r.name, t: tsOf(r.createdAt), src: 'ورشة', cls: 'src-w', sub: wsLabel(r.workshopId), tab: 'workshop' })),
  ].filter((x) => x.t).sort((a, b) => b.t - a.t).slice(0, 6);
  $('ov-latest').replaceChildren(...(items.length ? items.map((x, i) => h('li', { style: `--i:${i}` },
    h('span', { class: `ov-av ${x.cls}` }, firstLetter(x.name)),
    h('span', { class: 'ov-li-text' }, h('strong', {}, x.name), h('small', {}, `${x.src} · ${x.sub}`)),
    h('time', { datetime: new Date(x.t).toISOString() }, ago(x.t))))
    : [h('li', { class: 'ov-empty' }, 'لسا ما في تسجيلات.')]));
}

function renderOvWorkshop(cur) {
  const box = $('ov-ws');
  if (!loaded.has('workshops')) { box.replaceChildren(h('div', { class: 'ov-skel ov-skel-lg' })); return; }
  if (!cur) {
    box.replaceChildren(h('div', { class: 'ov-panel-head' }, h('h3', {}, 'الورشة الحالية')),
      h('p', { class: 'muted' }, 'ما في ورشة محددة كحالية.'),
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-goto': 'workshop' }, 'روح للورشات'));
    return;
  }
  const c = wsCounts(cur.id);
  const m = mergeWorkshop(cur);
  const b = stateBadge(cur);
  const pct = (a, z) => (z ? Math.round((a / z) * 100) : 0);
  const ring = (label, val, of, cls) => h('div', { class: `ov-ring ${cls}`, style: `--p:${pct(val, of)}` },
    h('span', { class: 'ov-ring-num' }, num(val)), h('small', {}, label));
  box.replaceChildren(
    h('div', { class: 'ov-panel-head' }, h('h3', {}, 'الورشة الحالية'), h('span', { class: `badge ${b.cls}` }, b.text)),
    h('p', { class: 'ov-ws-title' }, wsName(cur)),
    m.date ? h('p', { class: 'muted small' }, arDate(m.date)) : null,
    h('div', { class: 'ov-rings' },
      ring('مسجّل', c.regs, c.regs, 'r-regs'),
      ring('حضروا', c.attended, c.regs, 'r-att'),
      ring('شهادة', c.certs, c.attended || c.regs, 'r-cert')),
    h('div', { class: 'form-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', 'data-goto': 'workshop' }, 'إدارة الورشة'),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', 'data-goto': 'cert' }, 'الشهادات')));
}

const QUICK = [
  ['events', 'فعالية جديدة'], ['gallery', 'رفع صور'], ['content', 'تعديل نصوص الموقع'],
  ['team', 'أعضاء المجتمع'], ['forms', 'فتح وإغلاق الفورمات'], ['settings', 'نسخة احتياطية'],
];
$('ov-quick').replaceChildren(...QUICK.map(([t, label], i) => h('button', { type: 'button', class: 'ov-q', 'data-goto': t, style: `--i:${i}` },
  h('span', { class: 'ov-q-icon' }, tabIcon(t)), h('span', {}, label))),
  h('a', { class: 'ov-q', href: '/', target: '_blank', rel: 'noopener', style: `--i:${QUICK.length}` },
    h('span', { class: 'ov-q-icon' }, svgIcon('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>')), h('span', {}, 'فتح الموقع')));

function syncTabCounts() {
  if (loaded.has('members')) setTabCount('members', members.filter((m) => !m.contacted).length);
  if (loaded.has('trainers')) setTabCount('trainers', trainers.length);
  if (loaded.has('surveys')) setTabCount('survey', surveys.length);
}
const markLoaded = (k) => { loaded.add(k); renderOverview(); };

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
    renderTotal();
    renderMessages();
    markLoaded('members');
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
    const batch = fsPlain.writeBatch(db);
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

const waLink = (n) => waHref(n); // any stored format → wa.me/970… (see checkin-shared.js › waDigits)


/* =================== Data tables: sort + pages =================== */
const PAGERS = {};
const PAGER_BODY = { m: 'members-body', wr: 'wr-body', tt: 'tt-body', tr: 'tr-body', sv: 'sv-body' }; // pager id → its table body
const pagerState = (id) => (PAGERS[id] = PAGERS[id] || { page: 1, size: 25, key: '', dir: 1 });
const tsOf = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
const MEMBER_SORT = {
  name: (m) => m.name, status: (m) => STATUS[m.status] || m.status, specialty: (m) => m.specialty, age: (m) => Number(m.age) || 0,
  experience: (m) => EXPERIENCE[m.experience] || m.experience || '', residence: (m) => m.residence, university: (m) => m.university || '',
  createdAt: (m) => tsOf(m.createdAt), contacted: (m) => (m.contacted ? 1 : 0),
};
const REG_SORT = {
  name: (r) => r.name, status: (r) => WS_STATUS[r.status] || r.status || '', level: (r) => WS_LEVEL[r.level] || r.level || '',
  laptop: (r) => (r.laptop == null ? -1 : r.laptop ? 1 : 0), createdAt: (r) => tsOf(r.createdAt), attended: (r) => (r.attended ? 1 : 0),
};
function applyPager(id, all, getters, rerender) {
  const st = pagerState(id);
  let rows = all;
  if (st.key && getters[st.key]) {
    const g = getters[st.key];
    rows = [...all].sort((a, b) => {
      const x = g(a), y = g(b);
      const r = typeof x === 'number' || typeof y === 'number' ? (x || 0) - (y || 0) : String(x ?? '').localeCompare(String(y ?? ''), 'ar');
      return r * st.dir;
    });
  }
  const pages = Math.max(1, Math.ceil(rows.length / st.size));
  st.page = Math.min(Math.max(1, st.page), pages);
  const start = (st.page - 1) * st.size;
  const host = $(`${id}-pager`);
  if (!rows.length) host.replaceChildren();
  else {
    const go = (p) => { st.page = p; rerender(); };
    const size = h('select', { 'aria-label': 'عدد الصفوف بالصفحة', onchange: (e) => { st.size = Number(e.target.value); st.page = 1; rerender(); } },
      [10, 25, 50, 100].map((n) => h('option', { value: n, selected: n === st.size }, `${n} صف`)));
    host.replaceChildren(
      h('span', { class: 'pager-info' }, `${start + 1}–${Math.min(start + st.size, rows.length)} من ${rows.length}`),
      size,
      h('div', { class: 'pager-nav' },
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', disabled: st.page <= 1, onclick: () => go(1) }, '«'),
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', disabled: st.page <= 1, onclick: () => go(st.page - 1) }, 'السابق'),
        h('span', { class: 'pager-page' }, `${st.page} / ${pages}`),
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', disabled: st.page >= pages, onclick: () => go(st.page + 1) }, 'التالي'),
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', disabled: st.page >= pages, onclick: () => go(pages) }, '»')));
  }
  // header arrows
  const table = $(PAGER_BODY[id]).closest('table');
  table.querySelectorAll('th[data-sort]').forEach((th) => th.setAttribute('aria-sort', th.dataset.sort === st.key ? (st.dir > 0 ? 'ascending' : 'descending') : 'none'));
  return rows.slice(start, start + st.size);
}
function wireSort(id, bodyId, rerender) {
  const st = pagerState(id);
  $(bodyId).closest('table').querySelectorAll('th[data-sort]').forEach((th) => {
    th.querySelector('.th-sort').addEventListener('click', () => {
      if (st.key === th.dataset.sort) st.dir = -st.dir; else { st.key = th.dataset.sort; st.dir = 1; }
      st.page = 1;
      rerender();
    });
  });
}

function renderMembers() {
  const all = filtered();
  const rows = applyPager('m', all, MEMBER_SORT, renderMembers);
  // same WhatsApp number registered more than once → flag it
  const seen = members.reduce((m, x) => { if (x.whatsapp) m[x.whatsapp] = (m[x.whatsapp] || 0) + 1; return m; }, {});
  const pool = showTrash ? trash : members;
  $('members-count').textContent = showTrash ? `${all.length} من ${pool.length} بسلة المحذوفات` : `${all.length} من ${pool.length} تسجيل`;
  $('members-empty').textContent = showTrash ? 'سلة المحذوفات فاضية.' : 'ما في تسجيلات بهاد الفلتر.';
  $('members-empty').hidden = all.length > 0;
  $('members-body').replaceChildren(...rows.map((m) => {
    const tr = h('tr', { class: m.contacted ? 'is-contacted' : '' },
      h('td', { class: 'cell-name' }, profileBtn(m.name, { wa: m.whatsapp, email: m.email, name: m.name }),
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

/** a person's name that opens their profile (registrations, attendance, certificates, admin notes) */
const profileBtn = (name, seed) => h('button', { type: 'button', class: 'name-btn', title: 'افتح ملف الشخص', onclick: () => openProfile(seed) }, h('strong', {}, name));

const refreshMembers = () => { splitMembers(); fillResidenceFilter(); renderStats(); renderMembers(); renderTraffic(); renderOverview(); };

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

['f-search', 'f-status', 'f-exp', 'f-contacted', 'f-residence'].forEach((id) => $(id).addEventListener('input', () => { pagerState('m').page = 1; renderMembers(); }));
wireSort('m', 'members-body', () => renderMembers());
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
  markLoaded('traffic');
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
  { title: 'من نحن', fields: [
    ['about.kicker', 'السطر الصغير فوق العنوان'], ['about.title', 'العنوان'],
    ['about.text', 'الفقرة الأولى (بخط أكبر)', 'textarea'], ['about.text2', 'الفقرة الثانية', 'textarea'],
    ['about.showStat', 'إظهار كرت الرقم (مثلاً «16 عضو مؤسس») جنب كرت الرؤية', 'switch'],
    ['about.statNumber', 'الرقم بالكرت (مثلاً عدد المؤسسين)'], ['about.statLabel', 'النص تحت الرقم'],
    ['about.visionTitle', 'عنوان كرت الرؤية'], ['about.vision', 'نص الرؤية', 'textarea'],
  ] },
  { title: 'الأهداف', fields: [['goalsHead.title', 'عنوان السكشن'], ['goalsHead.text', 'وصف السكشن', 'textarea']],
    list: { path: 'goals', label: 'هدف', add: 'أضف هدف', min: 1, max: 12, item: [['title', 'العنوان'], ['text', 'النص', 'textarea']] } },
  { title: 'رحلة العضو (لمين المجتمع)', fields: [['journeyHead.title', 'عنوان السكشن'], ['journeyHead.text', 'وصف السكشن', 'textarea']],
    list: { path: 'journey', label: 'محطة', add: 'أضف محطة', min: 2, max: 6, item: [['title', 'العنوان'], ['text', 'النص', 'textarea']] } },
  { title: 'سكشن الفعاليات', note: 'الفعاليات نفسها بتضيفها من تبويب «الفعاليات».', fields: [['eventsHead.title', 'عنوان السكشن'], ['eventsHead.text', 'وصف السكشن']] },
  { title: 'سكشن الأعضاء', note: 'الأعضاء نفسهم، وإظهار السكشن أو إخفاؤه، من تبويب «الأعضاء».', fields: [['membersHead.title', 'عنوان السكشن'], ['membersHead.text', 'وصف السكشن']] },
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
  if (type === 'switch') {
    const box = h('input', { id, type: 'checkbox' });
    box.checked = value === true;
    box.addEventListener('change', () => { onInput(box.checked); markDirty(); });
    return h('div', { class: 'field field-switch' }, h('label', { class: 'switch', for: id },
      box, h('span', { class: 'switch-ui', 'aria-hidden': 'true' }), h('span', {}, label)));
  }
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

/* =================== Team (community members on the home page) =================== */
// team/{id} → name, role, bio, link, photo (small square data URL), order, published.
// The section only shows when site/settings.showMembers is on AND at least one member is published.
let team = [];
let teamEditing = null;
let teamPhoto = '';
let showMembers = false;

const firstLetter = (name) => [...String(name || '').trim()][0] || '؟';
function teamAvatar(m, size) {
  const style = size ? `width:${size}px;height:${size}px;font-size:${Math.round(size / 3)}px;border-radius:${Math.round(size / 4)}px` : null;
  return m.photo
    ? h('img', { class: 'member-photo', src: m.photo, alt: '', style })
    : h('span', { class: 'member-photo', 'aria-hidden': 'true', style }, firstLetter(m.name));
}

function syncTeamToggle() {
  const published = team.filter((m) => m.published).length;
  $('team-show').checked = showMembers;
  $('team-show-label').textContent = showMembers ? 'السكشن ظاهر على الموقع' : 'السكشن مخفي من الموقع';
  $('team-show-note').textContent = !showMembers
    ? 'السكشن مخفي. جهّز الأعضاء براحتك، وفعّله لما تكون جاهز.'
    : published
      ? `ظاهر على الصفحة الرئيسية، وفيه ${published} ${published === 1 ? 'عضو منشور' : 'أعضاء منشورين'}.`
      : 'مفعّل، بس ما رح يبيّن على الموقع لحد ما تنشر عضو واحد على الأقل.';
}

async function loadTeam() {
  try {
    const snap = await fs.getDocs(fs.collection(db, 'team'));
    team = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
    renderTeam();
  } catch (e) { toast(errMsg(e), true); }
}

function renderTeam() {
  $('team-empty').hidden = team.length > 0;
  $('team-list').replaceChildren(...team.map((m, i) => h('li', { class: m.published ? 'team-row' : 'team-row is-draft' },
    teamAvatar(m, 52),
    h('div', { class: 'team-row-info' },
      h('strong', {}, m.name),
      m.role ? h('span', { class: 'muted small' }, m.role) : null,
      h('span', { class: m.published ? 'badge badge-live' : 'badge badge-draft' }, m.published ? 'منشور' : 'مسودة')),
    h('div', { class: 'team-row-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => editTeam(m) }, 'تعديل'),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => toggleTeam(m) }, m.published ? 'إخفاء' : 'انشر'),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${m.name} لفوق`, title: 'لفوق', disabled: i === 0, onclick: () => moveTeam(i, -1) }, svgIcon(ICONS.up)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `${m.name} لتحت`, title: 'لتحت', disabled: i === team.length - 1, onclick: () => moveTeam(i, 1) }, svgIcon(ICONS.down)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': `حذف ${m.name}`, title: 'حذف', onclick: () => deleteTeam(m) }, svgIcon(ICONS.trash))))));
  syncTeamToggle();
}

function setTeamPhoto(src) {
  teamPhoto = src || '';
  const prev = $('tm-photo-preview');
  const next = teamAvatar({ name: $('tm-name').value, photo: teamPhoto });
  next.id = 'tm-photo-preview';
  prev.replaceWith(next);
  $('tm-photo-remove').hidden = !teamPhoto;
  $('tm-photo-edit').hidden = !teamPhoto;
}
$('tm-name').addEventListener('input', () => { if (!teamPhoto) $('tm-photo-preview').textContent = firstLetter($('tm-name').value); });

// centre-crop to a square and shrink until it fits the rules' size limit
function squarePhoto(img) {
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  for (let size = 320; size >= 120; size -= 40) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    for (let q = 0.85; q >= 0.5; q -= 0.07) {
      const data = c.toDataURL('image/jpeg', q);
      if (data.length <= 85000) return data;
    }
  }
  throw new Error('too-big');
}
/* ---------- crop + rotate editor (opens before the photo is added) ---------- */
const CROP = { img: null, rot: 0, zoom: 1, ox: 0, oy: 0, rotated: null };
const CS = 320; // editor canvas side
function rotatedSource() {
  const { img, rot } = CROP;
  const sw = img.naturalWidth, sh = img.naturalHeight;
  if (!rot) return { el: img, w: sw, h: sh };
  const c = document.createElement('canvas');
  const swap = rot % 2 === 1;
  c.width = swap ? sh : sw; c.height = swap ? sw : sh;
  const x = c.getContext('2d');
  x.translate(c.width / 2, c.height / 2);
  x.rotate((rot * Math.PI) / 2);
  x.drawImage(img, -sw / 2, -sh / 2);
  return { el: c, w: c.width, h: c.height };
}
function cropGeometry(side) {
  const r = CROP.rotated;
  const k = side / CS; // editor px → output px
  const sc = (CS / Math.min(r.w, r.h)) * CROP.zoom * k;
  const maxX = Math.max(0, (r.w * sc - side) / 2), maxY = Math.max(0, (r.h * sc - side) / 2);
  const ox = Math.max(-maxX, Math.min(maxX, CROP.ox * k)), oy = Math.max(-maxY, Math.min(maxY, CROP.oy * k));
  return { x: side / 2 - (r.w * sc) / 2 + ox, y: side / 2 - (r.h * sc) / 2 + oy, w: r.w * sc, h: r.h * sc };
}
function drawCrop() {
  const ctx = $('crop-canvas').getContext('2d');
  const g = cropGeometry(CS);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, CS, CS);
  ctx.drawImage(CROP.rotated.el, g.x, g.y, g.w, g.h);
}
function clampOffsets() {
  const r = CROP.rotated;
  const sc = (CS / Math.min(r.w, r.h)) * CROP.zoom;
  const maxX = Math.max(0, (r.w * sc - CS) / 2), maxY = Math.max(0, (r.h * sc - CS) / 2);
  CROP.ox = Math.max(-maxX, Math.min(maxX, CROP.ox));
  CROP.oy = Math.max(-maxY, Math.min(maxY, CROP.oy));
}
function cropRefresh() { CROP.rotated = rotatedSource(); clampOffsets(); drawCrop(); }
function openCrop(img) {
  Object.assign(CROP, { img, rot: 0, zoom: 1, ox: 0, oy: 0 });
  $('crop-zoom').value = 1;
  cropRefresh();
  $('crop-dlg').showModal();
}
$('crop-zoom').addEventListener('input', () => { CROP.zoom = Number($('crop-zoom').value); clampOffsets(); drawCrop(); });
$('crop-left').addEventListener('click', () => { CROP.rot = (CROP.rot + 3) % 4; CROP.ox = 0; CROP.oy = 0; cropRefresh(); });
$('crop-right').addEventListener('click', () => { CROP.rot = (CROP.rot + 1) % 4; CROP.ox = 0; CROP.oy = 0; cropRefresh(); });
$('crop-reset').addEventListener('click', () => { Object.assign(CROP, { rot: 0, zoom: 1, ox: 0, oy: 0 }); $('crop-zoom').value = 1; cropRefresh(); });
{
  const cv = $('crop-canvas');
  let drag = null;
  cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox: CROP.ox, oy: CROP.oy }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const k = CS / cv.getBoundingClientRect().width;
    CROP.ox = drag.ox + (e.clientX - drag.x) * k;
    CROP.oy = drag.oy + (e.clientY - drag.y) * k;
    clampOffsets(); drawCrop();
  });
  const end = () => { drag = null; };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    CROP.zoom = Math.max(1, Math.min(4, CROP.zoom - e.deltaY * 0.002));
    $('crop-zoom').value = CROP.zoom; clampOffsets(); drawCrop();
  }, { passive: false });
}
$('crop-ok').addEventListener('click', () => {
  try {
    for (let size = 320; size >= 120; size -= 40) {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
      const g = cropGeometry(size);
      ctx.drawImage(CROP.rotated.el, g.x, g.y, g.w, g.h);
      for (let q = 0.85; q >= 0.5; q -= 0.07) {
        const data = c.toDataURL('image/jpeg', q);
        if (data.length <= 85000) { setTeamPhoto(data); $('crop-dlg').close(); return; }
      }
    }
    throw new Error('too-big');
  } catch { toast('الصورة كبيرة كتير، جرّب تختار وحدة ثانية', true); }
});
$('tm-photo').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('اختار صورة JPG أو PNG أو WebP', true); return; }
  try { openCrop(await loadImage(file)); } catch { toast('ما قدرت أقرأ الصورة، جرّب وحدة ثانية', true); }
});
$('tm-photo-edit').addEventListener('click', () => {
  if (!teamPhoto) return;
  const img = new Image();
  img.onload = () => openCrop(img);
  img.src = teamPhoto;
});
$('tm-photo-remove').addEventListener('click', () => setTeamPhoto(''));

function resetTeamForm() {
  teamEditing = null;
  $('team-form').reset();
  $('tm-published').checked = true;
  $('team-error').textContent = '';
  $('team-form-title').textContent = 'عضو جديد';
  $('team-save').querySelector('.btn-label').textContent = 'أضف';
  $('team-cancel').hidden = true;
  setTeamPhoto('');
}
function editTeam(m) {
  teamEditing = m.id;
  $('tm-name').value = m.name || '';
  $('tm-role').value = m.role || '';
  $('tm-bio').value = m.bio || '';
  $('tm-link').value = m.link || '';
  ['name-en', 'role-en', 'bio-en', 'facebook', 'instagram', 'linkedin', 'whatsapp'].forEach((k) => { $(`tm-${k}`).value = m[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())] || ''; });
  $('tm-published').checked = !!m.published;
  setTeamPhoto(m.photo || '');
  $('team-form-title').textContent = `تعديل: ${m.name}`;
  $('team-save').querySelector('.btn-label').textContent = 'احفظ التعديل';
  $('team-cancel').hidden = false;
  $('team-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('tm-name').focus({ preventScroll: true });
}
$('team-cancel').addEventListener('click', resetTeamForm);

$('team-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('team-error');
  err.textContent = '';
  const name = $('tm-name').value.trim();
  if (!name) { err.textContent = 'اكتب الاسم بالعربي.'; $('tm-name').focus(); return; }
  const links = {};
  for (const [key, label] of [['facebook', 'فيسبوك'], ['instagram', 'إنستغرام'], ['linkedin', 'لينكدإن'], ['link', 'الرابط الآخر']]) {
    const url = withHttps($(`tm-${key}`).value);
    if (url && (!safeUrl(url) || (key !== 'link' && socialInfo(url)?.icon !== key))) { err.textContent = `رابط ${label} مش صحيح.`; $(`tm-${key}`).focus(); return; }
    links[key] = url;
  }
  const waRaw = $('tm-whatsapp').value.trim();
  const whatsapp = normalizePhone(waRaw);
  if (waRaw && !whatsapp) { err.textContent = 'رقم الواتساب مش صحيح. مثال: 0591234567 أو +970591234567'; $('tm-whatsapp').focus(); return; }
  const data = {
    name,
    nameEn: $('tm-name-en').value.trim(),
    role: $('tm-role').value.trim(),
    roleEn: $('tm-role-en').value.trim(),
    bio: $('tm-bio').value.trim().slice(0, 200),
    bioEn: $('tm-bio-en').value.trim().slice(0, 200),
    ...links,
    whatsapp,
    photo: teamPhoto,
    published: $('tm-published').checked,
    updatedAt: fs.serverTimestamp(),
  };
  const btn = $('team-save');
  setBusy(btn, true);
  try {
    if (teamEditing) await fs.updateDoc(fs.doc(db, 'team', teamEditing), data);
    else await fs.addDoc(fs.collection(db, 'team'), { ...data, order: team.reduce((m, x) => Math.max(m, x.order ?? 0), -1) + 1, createdAt: fs.serverTimestamp() });
    toast(teamEditing ? 'انحفظ التعديل' : (data.published ? 'انضاف العضو' : 'انضاف كمسودة'));
    resetTeamForm();
    await loadTeam();
  } catch (e2) { err.textContent = errMsg(e2); } finally { setBusy(btn, false); }
});

async function toggleTeam(m) {
  try {
    await fs.updateDoc(fs.doc(db, 'team', m.id), { published: !m.published, updatedAt: fs.serverTimestamp() });
    toast(m.published ? 'انخفى' : 'انشر');
    await loadTeam();
  } catch (e) { toast(errMsg(e), true); }
}
async function moveTeam(i, d) {
  if (!team[i] || !team[i + d]) return;
  try {
    const next = [...team]; [next[i], next[i + d]] = [next[i + d], next[i]];
    const batch = fs.writeBatch(db);
    next.forEach((m, k) => { if ((m.order ?? null) !== k) batch.update(fs.doc(db, 'team', m.id), { order: k, updatedAt: fs.serverTimestamp() }); });
    await batch.commit();
    await loadTeam();
  } catch (e) { toast(errMsg(e), true); }
}
async function deleteTeam(m) {
  if (!confirm(`حذف «${m.name}» من أعضاء المجتمع؟`)) return;
  try {
    await fs.deleteDoc(fs.doc(db, 'team', m.id));
    if (teamEditing === m.id) resetTeamForm();
    toast('انحذف');
    await loadTeam();
  } catch (e) { toast(errMsg(e), true); }
}

$('team-show').addEventListener('change', async (e) => {
  const on = e.target.checked;
  e.target.disabled = true;
  try {
    await fs.setDoc(fs.doc(db, 'site', 'settings'), { showMembers: on, updatedAt: fs.serverTimestamp() }, { merge: true });
    showMembers = on;
    toast(on ? 'سكشن الأعضاء صار ظاهر' : 'سكشن الأعضاء صار مخفي');
  } catch (e2) { e.target.checked = !on; toast(errMsg(e2), true); } finally { e.target.disabled = false; syncTeamToggle(); }
});

/* =================== Workshops: history, info, registrations, certificates =================== */
// workshops/{wid} → one workshop: info (tab «الورشات») + certificate template (tab «الشهادة»), saved with merge.
// site/settings.currentWorkshop → the workshop /workshop shows (set automatically when one goes «منشورة»).
// workshopRegs/{id} → registrations from /workshop, each with workshopId (admin: attended, certId).
// certificates/{id} → { name, no, date, regId?, workshopId }; anyone with the link /certificate?id=… can open it.
// Everything below the history panel (and the «الشهادة» tab) works on the selected workshop (selId).
let workshops = [];  // [{ id, ...saved data }]
let currentId = '';  // site/settings.currentWorkshop
let nextId = '';     // site/settings.nextWorkshop: a scheduled workshop, /workshop switches to it at its publish time
let selId = '';
let allRegs = [];
let allCerts = [];
let ws = mergeWorkshop(null); // the selected workshop
let regs = [];  // the selected workshop's registrations
let certs = []; // the selected workshop's certificates
let certDraft = structuredClone(ws.cert);
let certDirty = false;
let wsaDirty = false;
let previewRefresh = () => {};
let refitPreview = () => {};
const SEL_KEY = 'blt-admin-ws';

const certUrl = (id) => `${location.origin}/certificate?id=${id}`;
const wsUrl = (id) => `${location.origin}/workshop?w=${encodeURIComponent(id)}`;
const certById = (id) => allCerts.find((c) => c.id === id);
const todayYmd = () => gazaDay();
const issueDateText = () => arDate(ws.date || todayYmd());
const wsTime = (w) => (w.createdAt && typeof w.createdAt.toMillis === 'function' ? w.createdAt.toMillis() : w._t || 0);
const wsName = (w) => { const m = mergeWorkshop(w); return m.titleAr || m.title; };
const publishFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
/** visitors can see it right now (rules agree: done, or live with its publish time reached) */
const isPublic = (m) => m.status === 'done' || (m.status === 'live' && !isScheduled(m));
/** badge text + class: draft / scheduled (with time) / live / done */
function stateBadge(m) {
  if (isScheduled(m)) return { cls: 'badge-scheduled', text: `مجدولة: ${publishFmt.format(m.publishAt.toDate())}` };
  return { cls: `badge-${m.status}`, text: WS_STATES[m.status] };
}
// <input type="datetime-local"> works in the admin's local time
const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg); } catch { toast('ما قدرت أنسخ', true); }
}
// any [data-copy] button copies its text and flashes "انسخ ✓"
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  await copyText(b.dataset.copy, 'انسخ');
  b.classList.add('is-done');
  const old = b.textContent;
  b.textContent = 'انسخ ✓';
  setTimeout(() => { b.classList.remove('is-done'); b.textContent = old; }, 1600);
});

/** newest first; a workshop without a date yet (a new draft) goes on top */
function sortedWorkshops() {
  return [...workshops].sort((a, b) => String(b.date || '9999').localeCompare(String(a.date || '9999')) || wsTime(b) - wsTime(a));
}

async function loadWorkshopAll() {
  $('ws-list-empty').hidden = false;
  $('ws-list-empty').textContent = 'جاري التحميل…';
  try {
    const [wSnap, setSnap] = await Promise.all([
      fs.getDocs(fs.collection(db, 'workshops')),
      fs.getDoc(fs.doc(db, 'site', 'settings')),
      loadRegs(), loadCerts(),
    ]);
    workshops = wSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    currentId = setSnap.exists() ? String(setSnap.data().currentWorkshop || '') : '';
    nextId = setSnap.exists() ? String(setSnap.data().nextWorkshop || '') : '';
    await migrateWorkshops();
    await promoteScheduled();
  } catch (e) { console.error(e); toast(errMsg(e), true); }
  let saved = '';
  try { saved = localStorage.getItem(SEL_KEY) || ''; } catch { /* ignore */ }
  const pick = [saved, currentId].find((id) => id && workshops.some((w) => w.id === id)) || (sortedWorkshops()[0] || {}).id || '';
  selectWorkshop(pick, { force: true });
  renderTotal();
  renderMessages();
  markLoaded('workshops');
}

// First run after the move to workshops/: make the first workshop from the defaults (a draft, set as current),
// and link every registration/certificate that has no workshopId yet to the current workshop.
async function migrateWorkshops() {
  const now = fs.serverTimestamp();
  if (!workshops.length) {
    const ref = fs.doc(fs.collection(db, 'workshops'));
    const data = { ...structuredClone(DEFAULT_WORKSHOP), status: 'draft', publishAt: null };
    const batch = fsPlain.writeBatch(db);
    batch.set(ref, { ...data, createdAt: now, updatedAt: now });
    batch.set(fs.doc(db, 'site', 'settings'), { currentWorkshop: ref.id, updatedAt: now }, { merge: true });
    await batch.commit();
    workshops = [{ id: ref.id, ...data, _t: Date.now() }];
    currentId = ref.id;
  } else if (!workshops.some((w) => w.id === currentId)) {
    // no (valid) current workshop: use the newest live one, else the newest
    const pick = sortedWorkshops().find((w) => w.status === 'live') || sortedWorkshops()[0];
    await fs.setDoc(fs.doc(db, 'site', 'settings'), { currentWorkshop: pick.id, updatedAt: now }, { merge: true });
    currentId = pick.id;
  }
  const ops = [
    ...allRegs.filter((r) => !r.workshopId).map((r) => ['workshopRegs', r]),
    ...allCerts.filter((c) => !c.workshopId).map((c) => ['certificates', c]),
  ];
  for (let i = 0; i < ops.length; i += 400) {
    const batch = fsPlain.writeBatch(db);
    ops.slice(i, i + 400).forEach(([col, x]) => batch.update(fs.doc(db, col, x.id), { workshopId: currentId }));
    await batch.commit();
    ops.slice(i, i + 400).forEach(([, x]) => { x.workshopId = currentId; });
  }
  if (ops.length) toast(`انربط ${ops.length} تسجيل وشهادة قديمة بورشة «${wsName(workshops.find((w) => w.id === currentId))}»`);
}

// a scheduled workshop whose time came: make it the current one for good (the page already shows it)
async function promoteScheduled() {
  const w = workshops.find((x) => x.id === nextId);
  if (!nextId) return;
  const m = w ? mergeWorkshop(w) : null;
  if (m && m.status === 'live' && isScheduled(m)) return; // still waiting
  const patch = { nextWorkshop: '', updatedAt: fs.serverTimestamp() };
  if (m && m.status === 'live') patch.currentWorkshop = nextId;
  await fs.setDoc(fs.doc(db, 'site', 'settings'), patch, { merge: true });
  if (patch.currentWorkshop) currentId = nextId;
  nextId = '';
}

function applySelection() {
  regs = allRegs.filter((r) => r.workshopId === selId);
  certs = allCerts.filter((c) => c.workshopId === selId);
}

function selectWorkshop(id, { force = false } = {}) {
  if (!force && id === selId) return;
  if (!force && (certDirty || wsaDirty) && !confirm('في تعديلات مش محفوظة على الورشة المختارة. بدك تتركها؟')) return;
  selId = id;
  try { if (id) localStorage.setItem(SEL_KEY, id); } catch { /* ignore */ }
  ws = mergeWorkshop(workshops.find((w) => w.id === id) || null);
  applySelection();
  fillWorkshopForm();
  certDraft = structuredClone(ws.cert);
  fillCertForm();
  certDirty = false;
  wsaDirty = false;
  $('cf-status').textContent = '';
  $('wsa-status').textContent = '';
  $('ci-date').value = ws.date || todayYmd();
  syncSelectedUi();
  initPreview();
  renderWorkshopList();
  renderCerts();
  renderRegs();
}

function syncSelectedUi() {
  $('wsa-heading').textContent = ws.title;
  $('cert-heading').textContent = ws.title;
  const badge = $('wsa-state-badge');
  const st = stateBadge(ws);
  badge.className = `badge ${st.cls}`;
  badge.textContent = selId === currentId && isPublic(ws) ? `${st.text} · الظاهرة على الموقع` : st.text;
  $('wsa-open-page').href = selId ? `/workshop?w=${encodeURIComponent(selId)}` : '/workshop';
  $('cert-blank-link').href = selId ? `/certificate?w=${encodeURIComponent(selId)}` : '/certificate';
}

/* ---------- history ---------- */
function wsCounts(id) {
  const r = allRegs.filter((x) => x.workshopId === id);
  return { regs: r.length, attended: r.filter((x) => x.attended).length, certs: allCerts.filter((c) => c.workshopId === id).length };
}

function renderWorkshopList() {
  const list = sortedWorkshops();
  $('ws-list-empty').hidden = list.length > 0;
  $('ws-list-empty').textContent = 'ما في ورشات لسا. اضغط «+ ورشة جديدة».';
  $('ws-list').replaceChildren(...list.map((w) => {
    const m = mergeWorkshop(w);
    const n = wsCounts(w.id);
    const sel = w.id === selId;
    const sub = [m.titleAr ? h('bdi', { dir: 'ltr' }, m.title) : null, m.date ? arDate(m.date) : 'بدون تاريخ', placeText(m)]
      .filter(Boolean).flatMap((x, i) => (i ? [' · ', x] : [x]));
    return h('li', { class: sel ? 'is-selected' : '' },
      h('div', { class: 'wl-info' },
        h('div', { class: 'wl-title' },
          h('strong', {}, m.titleAr || m.title),
          h('span', { class: `badge ${stateBadge(m).cls}` }, stateBadge(m).text),
          w.id === currentId && isPublic(m) ? h('span', { class: 'badge badge-current', title: 'هاي اللي بتطلع على /workshop' }, 'الظاهرة على الموقع') : null),
        h('span', { class: 'muted small' }, sub),
        h('div', { class: 'wl-counts' },
          h('span', {}, `${n.regs} مسجّل`), h('span', {}, `${n.attended} حضروا`), h('span', {}, `${n.certs} شهادة`))),
      h('div', { class: 'wl-tools' },
        m.status === 'done'
          ? h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', title: 'بترجع مسودة مخفية', onclick: () => setWorkshopState(w, 'draft') }, 'إلغاء الأرشفة')
          : [
            h('button', {
              type: 'button', class: m.status === 'live' ? 'btn btn-ghost-dark btn-xs' : 'btn btn-primary btn-xs',
              title: m.status === 'live' ? 'بتختفي عن الزوار وبتوقف التسجيل' : 'بتطلع على /workshop وبتفتح التسجيل (إذا مفتوح)',
              onclick: () => setWorkshopState(w, m.status === 'live' ? 'draft' : 'live'),
            }, m.status === 'live' ? (isScheduled(m) ? 'إلغاء الجدولة' : 'إخفاء (مسودة)') : 'انشر الآن'),
            h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', title: 'بتنعرض بالورشات السابقة والتسجيل بوقف', onclick: () => setWorkshopState(w, 'done') }, 'أرشفة'),
          ],
        h('button', {
          type: 'button', class: sel ? 'btn btn-primary btn-xs' : 'btn btn-ghost-dark btn-xs', 'aria-pressed': String(sel),
          onclick: () => { selectWorkshop(w.id); if (selId === w.id) $('wsa-heading').closest('.tab-intro').scrollIntoView({ behavior: 'smooth', block: 'start' }); },
        }, sel ? 'مختارة ✓' : 'إدارة'),
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', onclick: () => copyText(wsUrl(w.id), 'انسخ رابط الورشة') }, 'نسخ الرابط'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `حذف ورشة ${m.titleAr || m.title}`, title: 'حذف الورشة', onclick: () => deleteWorkshop(w) }, svgIcon(ICONS.trash))));
  }));
}

/** one-click publish / hide / archive from the list (same fields the form saves) */
async function setWorkshopState(w, status) {
  const m = mergeWorkshop(w);
  if (status === 'live' && !m.title) { toast('اكتب اسم الورشة أول', true); return; }
  if (status === 'live' && !m.date) { toast('حدّد تاريخ الورشة أول (افتحها بزر «إدارة» واكتب التاريخ والوقت والمكان واحفظ)', true); return; }
  if (w.id === selId && wsaDirty && !confirm('في تعديلات مش محفوظة على هاي الورشة، رح تضيع. كمّل؟')) return;
  const label = { live: 'انشرت وصارت ظاهرة على /workshop', draft: 'صارت مسودة ومخفية عن الزوار', done: 'انأرشفت (بتظهر بالورشات السابقة)' }[status];
  try {
    const batch = fs.writeBatch(db);
    batch.update(fs.doc(db, 'workshops', w.id), { status, publishAt: null, updatedAt: fs.serverTimestamp() });
    const patch = {};
    if (status === 'live' && currentId !== w.id) patch.currentWorkshop = w.id;
    if (nextId === w.id) patch.nextWorkshop = '';
    if (Object.keys(patch).length) batch.set(fs.doc(db, 'site', 'settings'), { ...patch, updatedAt: fs.serverTimestamp() }, { merge: true });
    await batch.commit();
    Object.assign(w, { status, publishAt: null });
    if ('currentWorkshop' in patch) currentId = patch.currentWorkshop;
    if ('nextWorkshop' in patch) nextId = patch.nextWorkshop;
    if (w.id === selId) {
      ws = mergeWorkshop({ ...ws, status, publishAt: null, cert: ws.cert });
      $('wsa-state').value = status;
      $('wsa-publish').value = '';
      syncStateHint();
      syncSelectedUi();
    }
    renderWorkshopList();
    toast(`«${wsName(w)}» ${label}`);
  } catch (e) { toast(errMsg(e), true); }
}

async function deleteWorkshop(w) {
  const n = wsCounts(w.id);
  if (n.regs || n.certs) { toast('ما بتنحذف ورشة إلها تسجيلات أو شهادات. خلّي حالتها «انتهت» بدل الحذف.', true); return; }
  if (w.id === currentId && isPublic(mergeWorkshop(w))) { toast('هاي الورشة الظاهرة على الموقع. انشر ورشة ثانية أول، وبعدين احذفها.', true); return; }
  if (!confirm(`حذف ورشة «${wsName(w)}» نهائياً؟`)) return;
  try {
    const batch = fs.writeBatch(db);
    batch.delete(fs.doc(db, 'workshops', w.id));
    const patch = {};
    if (w.id === currentId) patch.currentWorkshop = '';
    if (w.id === nextId) patch.nextWorkshop = '';
    if (Object.keys(patch).length) batch.set(fs.doc(db, 'site', 'settings'), { ...patch, updatedAt: fs.serverTimestamp() }, { merge: true });
    await batch.commit();
    if (w.id === currentId) currentId = '';
    if (w.id === nextId) nextId = '';
    workshops = workshops.filter((x) => x.id !== w.id);
    if (selId === w.id) selectWorkshop(currentId || (sortedWorkshops()[0] || {}).id || '', { force: true });
    else renderWorkshopList();
    toast('انحذفت الورشة');
  } catch (e) { toast(errMsg(e), true); }
}

$('ws-new').addEventListener('click', async () => {
  if ((certDirty || wsaDirty) && !confirm('في تعديلات مش محفوظة على الورشة المختارة. بدك تتركها؟')) return;
  // copy the selected workshop's texts, topics and certificate template; a new workshop starts as a draft
  const base = mergeWorkshop(workshops.find((w) => w.id === selId) || null);
  const data = { ...structuredClone({ ...base, publishAt: null }), status: 'draft', publishAt: null, open: true, date: '', time: '', place: '', whatsappGroup: '' };
  const btn = $('ws-new');
  setBusy(btn, true);
  try {
    const ref = fs.doc(fs.collection(db, 'workshops'));
    await fs.setDoc(ref, { ...data, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
    workshops.push({ id: ref.id, ...data, _t: Date.now() });
    selectWorkshop(ref.id, { force: true });
    toast('انعملت ورشة جديدة (مسودة) بنفس محتوى اللي قبلها. عدّل معلوماتها، وبس تجهز خلّي حالتها «منشورة».');
    $('wsa-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('wsa-title').focus({ preventScroll: true });
  } catch (e) { toast(errMsg(e), true); } finally { setBusy(btn, false); }
});

/* ---------- workshop info form ---------- */
const syncWsOpen = () => { $('wsa-open-label').textContent = $('wsa-open').checked ? 'التسجيل بالورشة مفتوح' : 'التسجيل بالورشة مسكّر'; };
$('wsa-open').addEventListener('change', syncWsOpen);

const STATE_HINTS = {
  draft: 'المسودة مخفية عن الزوار، وما بتقبل تسجيلات.',
  live: 'بتطلع على /workshop وبتقبل تسجيلات لما يكون التسجيل مفتوح: فوراً لما تحفظ، أو بموعد النشر إذا حطيته.',
  done: 'بتنعرض بـ «ورشاتنا السابقة»، وصفحتها بتقول «الورشة انتهت». تسجيلاتها وشهاداتها بيضلوا زي ما هم.',
};
const syncStateHint = () => {
  $('wsa-state-hint').textContent = STATE_HINTS[$('wsa-state').value] || '';
  $('wsa-publish').disabled = $('wsa-state').value !== 'live';
};
$('wsa-state').addEventListener('change', syncStateHint);

$('wsa-fields').replaceChildren(...FORM_FIELDS.map((f) => h('label', {},
  h('input', { type: 'checkbox', class: 'check', id: `wsa-f-${f.key}` }), f.label)));

function fillWorkshopForm() {
  FORM_FIELDS.forEach((f) => { $(`wsa-f-${f.key}`).checked = ws.form[f.key]; });
  $('wsa-state').value = ws.status;
  $('wsa-publish').value = ws.publishAt ? toLocalInput(ws.publishAt.toDate()) : '';
  syncStateHint();
  $('wsa-open').checked = ws.open;
  syncWsOpen();
  $('wsa-title').value = ws.title;
  $('wsa-title-ar').value = ws.titleAr;
  $('wsa-desc').value = ws.description;
  $('wsa-date').value = ws.date;
  $('wsa-time').value = ws.time;
  $('wsa-hours').value = ws.hours;
  $('wsa-place').value = ws.place;
  $('wsa-mode').value = ws.mode;
  renderTopicRows(ws.topics);
  $('wsa-group').value = ws.whatsappGroup;
  $('wsa-closed').value = ws.closedMessage;
}

/* ---------- workshop content (topics / agenda) ---------- */
const MAX_TOPICS = 12;
const UP = 'المحور لفوق';
const DOWN = 'المحور لتحت';
function topicRow(t) {
  const li = h('li', { class: 'topic-row' },
    h('span', { class: 'topic-num', 'aria-hidden': 'true' }),
    h('div', { class: 'topic-fields' },
      h('div', { class: 'topic-line' },
        h('input', { type: 'text', class: 't-title', maxlength: 90, placeholder: 'عنوان المحور', 'aria-label': 'عنوان المحور', value: t.title }),
        h('input', { type: 'text', class: 't-time', maxlength: 24, placeholder: 'المدة: 30 دقيقة', 'aria-label': 'مدة المحور (اختياري)', value: t.time })),
      h('textarea', { class: 't-desc', rows: 2, maxlength: 240, placeholder: 'وصف قصير (اختياري)', 'aria-label': 'وصف المحور (اختياري)' })),
    h('div', { class: 'topic-tools' },
      h('button', { type: 'button', class: 'icon-btn', title: 'لفوق', 'aria-label': UP, onclick: () => moveTopic(li, -1) }, svgIcon(ICONS.up)),
      h('button', { type: 'button', class: 'icon-btn', title: 'لتحت', 'aria-label': DOWN, onclick: () => moveTopic(li, 1) }, svgIcon(ICONS.down)),
      h('button', { type: 'button', class: 'icon-btn danger', title: 'حذف المحور', 'aria-label': 'حذف المحور', onclick: () => { li.remove(); topicsChanged(); } }, svgIcon(ICONS.trash))));
  li.querySelector('.t-desc').value = t.desc || '';
  return li;
}
function renderTopicRows(topics) {
  $('wsa-topics').replaceChildren(...topics.map((t) => topicRow(normalizeTopic(t))));
  syncTopicTools();
}
function readTopicRows() {
  return [...$('wsa-topics').children].map((li) => ({
    title: li.querySelector('.t-title').value.trim(),
    desc: li.querySelector('.t-desc').value.trim(),
    time: li.querySelector('.t-time').value.trim(),
  })).filter((t) => t.title).slice(0, MAX_TOPICS);
}
function moveTopic(li, d) {
  const sib = d < 0 ? li.previousElementSibling : li.nextElementSibling;
  if (!sib) return;
  if (d < 0) sib.before(li); else sib.after(li);
  topicsChanged();
  li.querySelector(`[aria-label="${d < 0 ? UP : DOWN}"]`).focus();
}
function syncTopicTools() {
  const rows = [...$('wsa-topics').children];
  rows.forEach((li, i) => {
    li.querySelector('.topic-num').textContent = String(i + 1).padStart(2, '0');
    li.querySelector(`[aria-label="${UP}"]`).disabled = i === 0;
    li.querySelector(`[aria-label="${DOWN}"]`).disabled = i === rows.length - 1;
  });
  $('wsa-topic-add').disabled = rows.length >= MAX_TOPICS;
  // add up durations written in minutes or hours, a quick check against the workshop length
  let mins = 0;
  let known = true;
  rows.forEach((li) => {
    const v = li.querySelector('.t-time').value.replace(/[٠-٩]/g, (c) => c.charCodeAt(0) - 0x660);
    if (!v.trim()) return;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) { known = false; return; }
    mins += /ساع|hour/i.test(v) ? n * 60 : n;
  });
  const total = mins >= 60 ? `${+(mins / 60).toFixed(2)} ساعة` : `${mins} دقيقة`;
  $('wsa-topics-total').textContent = mins && known ? `(المجموع: ${total})` : '';
}
function topicsChanged() { syncTopicTools(); wsaDirty = true; $('wsa-status').textContent = 'في تعديلات مش محفوظة'; }
$('wsa-topics').addEventListener('input', syncTopicTools);
$('wsa-topic-add').addEventListener('click', () => {
  if ($('wsa-topics').children.length >= MAX_TOPICS) return;
  const li = topicRow({ title: '', desc: '', time: '' });
  $('wsa-topics').append(li);
  topicsChanged();
  li.querySelector('.t-title').focus();
});

$('wsa-fill-guide').addEventListener('click', () => {
  if (!selId) return;
  const d = DEFAULT_WORKSHOP;
  $('wsa-title').value = d.title; $('wsa-title-ar').value = d.titleAr; $('wsa-desc').value = d.description;
  $('wsa-time').value = d.time; $('wsa-hours').value = d.hours;
  renderTopicRows(d.topics);
  topicsChanged();
  toast('انعبّت من دليل الورشة. راجعها وبعدين اضغط «حفظ».');
});
$('wsa-form').addEventListener('input', () => { wsaDirty = true; $('wsa-status').textContent = 'في تعديلات مش محفوظة'; });
$('wsa-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selId) { toast('ما في ورشة مختارة', true); return; }
  const status = $('wsa-state').value;
  const title = $('wsa-title').value.trim();
  const hours = Number($('wsa-hours').value);
  const group = $('wsa-group').value.trim();
  if (!title) { toast('اكتب اسم الورشة', true); $('wsa-title').focus(); return; }
  if (!(hours >= 1 && hours <= 100)) { toast('عدد الساعات لازم يكون بين 1 و 100', true); $('wsa-hours').focus(); return; }
  if (group && !safeUrl(group)) { toast('رابط القروب لازم يبدأ بـ https://', true); $('wsa-group').focus(); return; }
  if (status === 'live' && !$('wsa-date').value && !confirm('ما حطيت تاريخ للورشة، رح يظهر «يُحدَّد قريباً» للزوار. تنشرها هيك؟')) { $('wsa-date').focus(); return; }
  const publishRaw = status === 'live' ? $('wsa-publish').value : '';
  const publishDate = publishRaw ? new Date(publishRaw) : null;
  if (publishDate && Number.isNaN(publishDate.getTime())) { toast('موعد النشر مش صحيح', true); $('wsa-publish').focus(); return; }
  const data = {
    status,
    publishAt: publishDate ? fs.Timestamp.fromDate(publishDate) : null,
    form: Object.fromEntries(FORM_FIELDS.map((f) => [f.key, $(`wsa-f-${f.key}`).checked])),
    open: $('wsa-open').checked,
    title,
    titleAr: $('wsa-title-ar').value.trim(),
    description: $('wsa-desc').value.trim(),
    date: $('wsa-date').value || '',
    time: $('wsa-time').value.trim(),
    hours,
    place: $('wsa-place').value.trim(),
    mode: $('wsa-mode').value === 'online' ? 'online' : 'onsite',
    topics: readTopicRows(),
    whatsappGroup: group,
    closedMessage: $('wsa-closed').value.trim() || DEFAULT_WORKSHOP.closedMessage,
  };
  const btn = $('wsa-save');
  setBusy(btn, true);
  try {
    // «منشورة» now → it becomes the workshop /workshop shows.
    // «منشورة» with a future time → nextWorkshop: the page switches to it by itself once the rules let visitors read it.
    const scheduled = status === 'live' && !!publishDate && publishDate.getTime() > Date.now();
    const makeCurrent = status === 'live' && !scheduled && currentId !== selId;
    const patch = {};
    if (makeCurrent) patch.currentWorkshop = selId;
    if (scheduled && nextId !== selId) patch.nextWorkshop = selId;
    if (!scheduled && nextId === selId) patch.nextWorkshop = '';
    const batch = fs.writeBatch(db);
    batch.set(fs.doc(db, 'workshops', selId), { ...data, updatedAt: fs.serverTimestamp() }, { merge: true });
    if (Object.keys(patch).length) batch.set(fs.doc(db, 'site', 'settings'), { ...patch, updatedAt: fs.serverTimestamp() }, { merge: true });
    await batch.commit();
    const raw = workshops.find((w) => w.id === selId);
    if (raw) Object.assign(raw, data);
    if ('currentWorkshop' in patch) currentId = patch.currentWorkshop;
    if ('nextWorkshop' in patch) nextId = patch.nextWorkshop;
    ws = mergeWorkshop({ ...ws, ...data, cert: ws.cert });
    wsaDirty = false;
    $('wsa-status').textContent = 'انحفظ';
    if (!$('ci-date').value) $('ci-date').value = ws.date || todayYmd();
    syncSelectedUi();
    renderWorkshopList();
    refreshPreview();
    toast(scheduled ? `انحفظت ومجدولة: بتطلع على /workshop ويفتح التسجيل ${publishFmt.format(publishDate)}`
      : makeCurrent ? 'انحفظت، وصارت هي الورشة الظاهرة على /workshop'
      : status === 'live' ? (data.open ? 'انحفظت معلومات الورشة (التسجيل مفتوح)' : 'انحفظت معلومات الورشة (التسجيل مسكّر)')
      : `انحفظت الورشة (${WS_STATES[status]})`);
  } catch (e2) { toast(errMsg(e2), true); } finally { setBusy(btn, false); }
});

$('wsa-copy-link').addEventListener('click', () => { if (selId) copyText(wsUrl(selId), 'انسخ رابط الورشة'); });
// «اعمل بوست وستوري»: the studio prepares the workshop's campaign (post + reminder story + «we've started» story)
$('wsa-social').addEventListener('click', () => {
  if (!selId) return;
  if (wsaDirty && !confirm('في تعديلات على الورشة ما انحفظت. الحملة بتاخد آخر نسخة محفوظة. تكمّل؟')) return;
  const url = selId === currentId ? 'https://beitlahia.tech/workshop' : `https://beitlahia.tech/workshop?w=${encodeURIComponent(selId)}`;
  selectTab('studio');
  openWorkshopCampaign(ws, { id: selId, url, shortUrl: 'beitlahia.tech/workshop' });
});

/* ---------- registrations ---------- */
async function loadRegs() {
  $('wr-count').textContent = 'جاري التحميل…';
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'workshopRegs'), fs.orderBy('createdAt', 'desc')));
    allRegs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { console.error(e); $('wr-count').textContent = errMsg(e); }
}

function hasCert(r) { return !!(r.certId && certById(r.certId)); }

function renderWsStats() {
  const n = (fn) => regs.filter(fn).length;
  const items = [
    ['مسجّلين بالورشة', regs.length, true],
    ['حضروا', n((r) => r.attended)],
    ['شهادات صادرة', n(hasCert)],
    ['معهم لابتوب', n((r) => r.laptop)],
    ['مبتدئين', n((r) => r.level === 'beginner')],
  ];
  $('wsa-stats').replaceChildren(...items.map(([label, value, accent]) => h('div', { class: accent ? 'stat stat-accent' : 'stat' },
    h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label))));
  const pending = n((r) => r.attended && !hasCert(r));
  const bulk = $('wr-bulk');
  bulk.querySelector('.btn-label').textContent = pending ? `أصدر شهادات للحاضرين (${pending})` : 'أصدر شهادات للحاضرين';
  bulk.disabled = !pending;
  const passes = pendingPassMails().length;
  $('wr-mail-pass').querySelector('.btn-label').textContent = passes ? `ابعت بطاقات الدخول بالإيميل (${passes})` : 'بطاقات الدخول بالإيميل';
  $('wr-mail-pass').disabled = !passes;
  const certMails = pendingCertMails().length;
  $('wr-mail-cert').hidden = !certMails;
  $('wr-mail-cert').querySelector('.btn-label').textContent = `ابعت الشهادات بالإيميل (${certMails})`;
}

function filteredRegs() {
  const q = $('wr-search').value.trim().toLowerCase();
  const f = $('wr-filter').value;
  const lv = $('wr-level').value;
  return regs.filter((r) => {
    if (lv && r.level !== lv) return false;
    if (f === 'attended' && !r.attended) return false;
    if (f === 'absent' && r.attended) return false;
    if (f === 'cert' && !hasCert(r)) return false;
    if (f === 'nocert' && !(r.attended && !hasCert(r))) return false;
    if (q && ![r.name, r.whatsapp, r.email, r.expectations].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}

const toolName = (k) => AI_TOOLS.find((t) => t.key === k)?.name || k;

function certActions(c, phone, small = true, email = '') {
  const cls = small ? 'btn btn-ghost-dark btn-xs' : 'btn btn-ghost-dark btn-sm';
  const wa = waLink(phone);
  return [
    h('a', { class: cls, href: certUrl(c.id), target: '_blank', rel: 'noopener' }, 'فتح ↗'),
    h('button', { type: 'button', class: cls, onclick: () => copyCertLink(c) }, 'نسخ الرابط'),
    mailOk(email) ? h('a', { class: `${cls} mail-send`, href: certMailLink(c, email), target: '_blank', rel: 'noopener noreferrer', title: 'يفتح Gmail برسالة جاهزة فيها رابط الشهادة' }, 'إيميل') : null,
    wa ? h('a', { class: `${cls} wa-send`, href: `${wa}?text=${encodeURIComponent(certMessage(c))}`, target: '_blank', rel: 'noopener noreferrer', title: 'ابعت الرابط على الواتساب', onclick: () => { markSent(c.id); } }, 'واتساب') : null,
  ];
}

const mailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
/** Gmail compose window with the message ready; the admin presses send */
function certMailLink(c, email) {
  const subject = `شهادة إنجاز ورشة ${ws.titleAr || ws.title} | بيت لاهيا تيك`;
  const body = `${certMessage(c)}

بيت لاهيا تيك
beitlahia.tech`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function certMessage(c) {
  return `مبروك ${c.name} 🎉🎓
يسعدنا في بيت لاهيا تيك إنك أنهيت ورشة «${ws.titleAr || ws.title}» بنجاح، وهاي شهادتك جاهزة:
${certUrl(c.id)}
بتقدر تفتحها وتحفظها PDF أو تطبعها.
نتمنى لك مسيرة تقنية موفقة، وبنشوفك بالورشات الجاية! 💚
— بيت لاهيا تيك`;
}
function copyCertLink(c) { return copyText(certUrl(c.id), 'انسخ رابط الشهادة'); }

/* ---------- WhatsApp: send certificates one after another ---------- */
const WA_KEY = 'blt-wa-sent';
const waSent = () => { try { return new Set(JSON.parse(localStorage.getItem(WA_KEY) || '[]')); } catch { return new Set(); } };
const markSent = (id) => { try { const s = waSent(); s.add(id); localStorage.setItem(WA_KEY, JSON.stringify([...s])); } catch { /* ignore */ } };
let waQ = [];
let waPos = 0;
function showWa() {
  const x = waQ[waPos];
  if (!x) { $('wa-dlg').close(); renderCerts(); toast('خلصت: انفتحت كل المحادثات'); return; }
  $('wa-prog').textContent = `${waPos + 1} من ${waQ.length}`;
  $('wa-name').textContent = x.c.name;
  $('wa-phone').textContent = x.reg.whatsapp;
  $('wa-msg').value = certMessage(x.c);
}
$('wa-bulk').addEventListener('click', () => {
  const done = waSent();
  waQ = certs.map((c) => ({ c, reg: c.regId ? allRegs.find((r) => r.id === c.regId) : null }))
    .filter((x) => x.reg && waLink(x.reg.whatsapp) && !done.has(x.c.id));
  if (!waQ.length) { toast('ما في شهادات جاهزة للإرسال: يا كلها انبعتت، يا ما في أرقام واتساب مربوطة', true); return; }
  waPos = 0;
  showWa();
  $('wa-dlg').showModal();
});
$('wa-send').addEventListener('click', () => {
  const x = waQ[waPos];
  if (!x) return;
  window.open(`${waLink(x.reg.whatsapp)}?text=${encodeURIComponent($('wa-msg').value)}`, '_blank', 'noopener');
  markSent(x.c.id);
  waPos += 1;
  showWa();
});
$('wa-skip').addEventListener('click', () => { waPos += 1; showWa(); });

function renderRegs() {
  renderWsStats();
  const all = filteredRegs();
  const rows = applyPager('wr', all, REG_SORT, renderRegs);
  const seen = regs.reduce((m, x) => { if (x.whatsapp) m[x.whatsapp] = (m[x.whatsapp] || 0) + 1; return m; }, {});
  $('wr-count').textContent = `${all.length} من ${regs.length} تسجيل`;
  $('wr-empty').hidden = all.length > 0;
  $('wr-empty').textContent = regs.length ? 'ما في تسجيلات بهاد الفلتر.' : 'ما في تسجيلات لسا. شارك رابط صفحة الورشة.';
  $('wr-body').replaceChildren(...rows.map((r) => {
    const c = r.certId ? certById(r.certId) : null;
    const tr = h('tr', { class: r.attended ? 'is-attended' : '' },
      h('td', { class: 'cell-name' }, profileBtn(r.name, { wa: r.whatsapp, email: r.email, name: r.name }),
        seen[r.whatsapp] > 1 ? h('span', { class: 'badge badge-dup', title: 'نفس رقم الواتساب مسجّل أكثر من مرة' }, 'مكرر') : null,
        r.expectations ? h('details', { class: 'cell-notes' }, h('summary', {}, 'توقعاته'), h('p', {}, r.expectations)) : null),
      h('td', { class: 'cell-contact' },
        waLink(r.whatsapp)
          ? h('a', { class: 'wa-btn', href: waLink(r.whatsapp), target: '_blank', rel: 'noopener noreferrer' }, h('bdi', { dir: 'ltr' }, r.whatsapp))
          : h('span', { class: 'muted' }, '—'),
        r.email ? h('a', { class: 'mail-link', href: `mailto:${r.email}`, dir: 'ltr' }, r.email) : null),
      h('td', {}, r.status ? h('span', { class: `pill pill-${r.status}` }, WS_STATUS[r.status] || r.status) : '—'),
      h('td', {}, r.level ? h('span', { class: `pill pill-${r.level}` }, WS_LEVEL[r.level] || r.level) : '—'),
      h('td', {}, r.laptop == null ? '—' : r.laptop ? 'آه' : 'لا'),
      h('td', {}, Array.isArray(r.aiTools) && r.aiTools.length ? h('div', { class: 'tool-tags' }, r.aiTools.map((k) => h('span', {}, toolName(k)))) : '—'),
      h('td', { class: 'cell-date' }, r.createdAt ? dateFmt.format(r.createdAt.toDate()) : '—'),
      h('td', { class: 'cell-att' }, h('input', {
        type: 'checkbox', class: 'check', checked: !!r.attended, 'aria-label': `${r.name} حضر`,
        onchange: (e) => setAttended(r, e.target.checked, tr, e.target),
      }), r.attended && r.attendedAt ? h('span', { class: 'att-time', title: attendedText(r) }, timeOnly(r.attendedAt)) : null),
      h('td', {}, c
        ? h('div', { class: 'cert-cell' }, h('span', { class: 'cert-no-tag' }, c.no), certActions(c, r.whatsapp, true, r.email),
          r.certMailedAt ? h('span', { class: 'muted small', title: 'انبعتت بالإيميل' }, 'إيميل ✓') : null)
        : r.attended
          ? h('button', { type: 'button', class: 'btn btn-primary btn-xs', onclick: (e) => issueForReg(r, e.currentTarget) }, 'أصدر شهادة')
          : h('span', { class: 'muted small', title: 'الشهادة بتنصدر بعد ما يتسجّل حضوره' }, 'بعد الحضور')),
      h('td', { class: 'cell-actions' }, h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `حذف تسجيل ${r.name}`, title: 'حذف التسجيل', onclick: () => deleteReg(r),
      }, svgIcon(ICONS.trash))));
    return tr;
  }));
}

const timeOnly = (t) => new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' }).format(t.toDate ? t.toDate() : new Date(t));
// ticking the box by hand = the same as a scan (time + who, see admin-people.js › setAttendance)
async function setAttended(r, value, tr, box) {
  box.disabled = true;
  try {
    const saving = setAttendance(r, value);
    tr.classList.toggle('is-attended', value);
    renderRegs();
    renderWorkshopList();
    await saving;
  } catch (e) { box.checked = !value; toast(errMsg(e), true); renderRegs(); } finally { box.disabled = false; }
}

async function deleteReg(r) {
  const c = r.certId ? certById(r.certId) : null;
  if (!confirm(`حذف تسجيل «${r.name}» نهائياً؟${c ? ' شهادته بتضل شغّالة (بتقدر تلغيها من تبويب «الشهادة»).' : ''}`)) return;
  try {
    await fs.deleteDoc(fs.doc(db, 'workshopRegs', r.id));
    allRegs = allRegs.filter((x) => x.id !== r.id);
    applySelection();
    renderRegs();
    renderWorkshopList();
    toast('انحذف التسجيل');
  } catch (e) { toast(errMsg(e), true); }
}

['wr-search', 'wr-filter', 'wr-level'].forEach((id) => $(id).addEventListener('input', () => { pagerState('wr').page = 1; renderRegs(); }));
wireSort('wr', 'wr-body', () => renderRegs());
$('wr-refresh').addEventListener('click', reloadLists);
async function reloadLists() {
  await Promise.all([loadCerts(), loadRegs()]);
  applySelection();
  renderCerts();
  renderRegs();
  renderWorkshopList();
  renderMessages();
}

/* ---------- check-in (QR), registrant e-mails, profiles, messages: admin-people.js ---------- */
initPeople({
  h, toast, setBusy, db, fs, can, isFull,
  email: () => (auth.currentUser?.email || '').toLowerCase(),
  getToken: () => auth.currentUser.getIdToken(),
  state: () => ({ allRegs, allCerts, members, workshops, selId, currentId }),
  onRegsChanged: () => { applySelection(); renderRegs(); renderWorkshopList(); renderMessages(); },
  wsName, certUrl, wsUrl,
});
$('wr-scan').addEventListener('click', openScanner);
$('wr-mail-pass').addEventListener('click', (e) => mailPasses(e.currentTarget));
$('wr-mail-cert').addEventListener('click', (e) => mailPendingCerts(e.currentTarget));

$('wr-export').addEventListener('click', () => {
  const rows = filteredRegs();
  const head = ['الاسم', 'واتساب', 'الإيميل', 'الحالة', 'المستوى', 'لابتوب', 'أدوات AI', 'توقعاته', 'حضر', 'وقت الحضور', 'سجّل الحضور', 'رقم الشهادة', 'رابط الشهادة', 'تاريخ التسجيل'];
  const esc = (v) => {
    let x = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(x)) x = `'${x}`;
    return /[",\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  const lines = [head, ...rows.map((r) => {
    const c = r.certId ? certById(r.certId) : null;
    return [r.name, r.whatsapp || '', r.email || '', WS_STATUS[r.status] || r.status || '', WS_LEVEL[r.level] || r.level || '', r.laptop == null ? '' : r.laptop ? 'نعم' : 'لا',
      (r.aiTools || []).map(toolName).join(' / '), r.expectations || '', r.attended ? 'نعم' : 'لا',
      r.attended && r.attendedAt ? dateTimeFmt.format(r.attendedAt.toDate()) : '', r.attended ? r.attendedBy || '' : '', c ? c.no : '', c ? certUrl(c.id) : '',
      r.createdAt ? dateTimeFmt.format(r.createdAt.toDate()) : ''];
  })].map((row) => row.map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `beit-lahia-workshop-${ws.date || gazaDay()}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

/* ---------- issuing certificates ---------- */
// numbering counts every certificate with the same prefix (all workshops), so a number never repeats
function nextNumbers(count) {
  const prefix = ws.cert.numberPrefix || '';
  const max = allCerts.reduce((m, c) => {
    if (typeof c.no !== 'string' || !c.no.startsWith(prefix)) return m;
    const n = parseInt(c.no.slice(prefix.length), 10);
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 0);
  return Array.from({ length: count }, (_, i) => `${prefix}${String(max + i + 1).padStart(3, '0')}`);
}

/** people: [{ name, regId? }] → issues them all in one batch, returns the new certificates */
/** a draft isn't public, so its certificates would open with the wrong title → publish first */
function canIssue() {
  if (!selId) { toast('ما في ورشة مختارة', true); return false; }
  if (ws.status === 'draft') { toast('الورشة لسا «مسودة». خلّي حالتها «منشورة» أو «انتهت» قبل ما تصدر شهادات.', true); return false; }
  return true;
}

async function issue(people, date) {
  const nos = nextNumbers(people.length);
  const batch = fs.writeBatch(db);
  const made = people.map((p, i) => {
    const ref = fs.doc(fs.collection(db, 'certificates'));
    const data = { name: p.name, no: nos[i], date, workshopId: selId, createdAt: fs.serverTimestamp() };
    if (p.regId) {
      data.regId = p.regId;
      batch.update(fs.doc(db, 'workshopRegs', p.regId), { certId: ref.id });
    }
    batch.set(ref, data);
    return { id: ref.id, name: p.name, no: nos[i], date, regId: p.regId || '', workshopId: selId };
  });
  await batch.commit();
  allCerts.push(...made);
  made.forEach((c) => { const r = allRegs.find((x) => x.id === c.regId); if (r) r.certId = c.id; });
  applySelection();
  renderCerts();
  renderRegs();
  renderWorkshopList();
  return made;
}

async function issueForReg(r, btn) {
  if (!canIssue()) return;
  if (!r.attended) { toast('الشهادة بتنصدر للي حضروا بس. سجّل حضوره أول.', true); return; }
  btn.disabled = true;
  try {
    const made = await issue([{ name: r.name, regId: r.id }], issueDateText());
    toast(`انصدرت الشهادة ${made[0].no}`);
    mailCerts(made, { quiet: !mailOk(r.email) }).catch((e) => toast(e.message, true));
  } catch (e) { btn.disabled = false; toast(errMsg(e), true); }
}

$('wr-bulk').addEventListener('click', async () => {
  const pending = regs.filter((r) => r.attended && !hasCert(r));
  if (!pending.length || !canIssue()) return;
  if (!confirm(`إصدار ${pending.length} شهادة للي حضروا وما إلهم شهادة؟`)) return;
  const btn = $('wr-bulk');
  setBusy(btn, true);
  const made = [];
  try {
    for (let i = 0; i < pending.length; i += 200) {
      made.push(...await issue(pending.slice(i, i + 200).map((r) => ({ name: r.name, regId: r.id })), issueDateText()));
    }
    const withMail = pending.filter((r) => mailOk(r.email)).length;
    toast(`انصدرت ${pending.length} شهادة.${withMail ? ` بنبعتها بالإيميل لـ ${withMail}…` : ' ابعتلهم الروابط من عمود «الشهادة».'}`);
  } catch (e) { toast(errMsg(e), true); } finally { btn.classList.remove('is-loading'); renderWsStats(); }
  if (made.length) await mailCerts(made).catch((e) => toast(e.message, true));
});

$('ci-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('ci-name').value.replace(/\s+/g, ' ').trim();
  if (name.length < 2) { toast('اكتب الاسم كامل', true); $('ci-name').focus(); return; }
  if (!canIssue()) return;
  const btn = $('ci-save');
  setBusy(btn, true);
  try {
    const [c] = await issue([{ name }], arDate($('ci-date').value || todayYmd()));
    $('ci-name').value = '';
    toast(`انصدرت الشهادة ${c.no}`);
    copyCertLink(c);
  } catch (e2) { toast(errMsg(e2), true); } finally { setBusy(btn, false); }
});

/* ---------- issued list ---------- */
async function loadCerts() {
  try {
    const snap = await fs.getDocs(fs.collection(db, 'certificates'));
    allCerts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) { toast(errMsg(e), true); }
}

function renderCerts() {
  const list = [...certs].sort((a, b) => String(b.no).localeCompare(String(a.no), 'en', { numeric: true }));
  $('cl-title').textContent = `الشهادات الصادرة (${list.length})`;
  $('cert-empty').hidden = list.length > 0;
  $('cert-list').replaceChildren(...list.map((c) => {
    const reg = c.regId ? allRegs.find((r) => r.id === c.regId) : null;
    return h('li', {},
      h('span', { class: 'cert-no-tag' }, c.no),
      h('div', { class: 'cl-info' }, h('strong', {}, c.name), h('span', { class: 'muted small' }, [c.date, reg ? 'من تسجيلات الورشة' : 'إصدار يدوي', waSent().has(c.id) ? 'انبعتت واتساب ✓' : ''].filter(Boolean).join(' · '))),
      h('div', { class: 'cl-tools' }, certActions(c, reg?.whatsapp, true, reg?.email),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': `إلغاء شهادة ${c.name}`, title: 'إلغاء الشهادة', onclick: () => revokeCert(c) }, svgIcon(ICONS.trash))));
  }));
}

async function revokeCert(c) {
  if (!confirm(`إلغاء شهادة «${c.name}» (${c.no})؟ رابطها رح يبطّل يشتغل.`)) return;
  try {
    const batch = fs.writeBatch(db);
    batch.delete(fs.doc(db, 'certificates', c.id));
    const reg = c.regId ? allRegs.find((r) => r.id === c.regId && r.certId === c.id) : null;
    if (reg) batch.update(fs.doc(db, 'workshopRegs', reg.id), { certId: '' });
    await batch.commit();
    allCerts = allCerts.filter((x) => x.id !== c.id);
    if (reg) reg.certId = '';
    applySelection();
    renderCerts();
    renderRegs();
    renderWorkshopList();
    toast('انلغت الشهادة');
  } catch (e) { toast(errMsg(e), true); }
}

/* ---------- certificate template + live preview ---------- */
const CF_TEXT = ['title', 'titleAccent', 'titleEn', 'intro', 'reason', 'numberPrefix', 'place', 'tagline1', 'tagline2'];
const SIG_FIELDS = ['role', 'name', 'en'];

function fillCertForm() {
  CF_TEXT.forEach((k) => { $(`cf-${k}`).value = certDraft[k]; });
  certDraft.signers.forEach((s, i) => {
    SIG_FIELDS.forEach((k) => { $(`cf-s${i}-${k}`).value = s[k]; });
    showSigThumb(i);
  });
}

function showSigThumb(i) {
  const sig = certDraft.signers[i].sig;
  $(`cf-s${i}-thumb`).replaceChildren(sig ? h('img', { src: sig, alt: 'التوقيع' }) : h('span', {}, 'بدون توقيع إلكتروني'));
  $(`cf-s${i}-remove`).hidden = !sig;
}

function readCertForm() {
  CF_TEXT.forEach((k) => { certDraft[k] = $(`cf-${k}`).value.trim(); });
  certDraft.signers.forEach((s, i) => SIG_FIELDS.forEach((k) => { s[k] = $(`cf-s${i}-${k}`).value.trim(); }));
}

function markCertDirty() {
  certDirty = true;
  $('cf-status').textContent = 'في تعديلات مش محفوظة';
}

let previewFitted = false;
function initPreview() {
  const host = $('cert-preview');
  if (!previewFitted) { previewFitted = true; refitPreview = fitSheet(host); } // scale the A4 sheet to the box, once
  refreshPreview();
}
// wide screens: the settings form is exactly as tall as the preview next to it and scrolls inside,
// so the panels under the preview (issue / issued certificates) come into view right away
function matchCertForm() {
  const preview = document.querySelector('#tab-cert .cert-preview-panel');
  const layout = document.querySelector('#tab-cert .cert-layout');
  if (!preview || !layout || !('ResizeObserver' in window)) return;
  new ResizeObserver(() => {
    if (preview.offsetHeight) layout.style.setProperty('--cert-h', preview.offsetHeight + 'px');
  }).observe(preview);
}
matchCertForm();

function refreshPreview() {
  const host = $('cert-preview');
  const sample = $('cf-sample').value.trim();
  previewRefresh = renderCertificate(host, { ...ws, cert: certDraft }, {
    name: sample, no: sample ? nextNumbers(1)[0] : '', date: issueDateText(), url: sample ? `${location.origin}/certificate?id=preview` : '',
  });
  refitPreview();
}

$('cert-form').addEventListener('input', (e) => {
  if (e.target.type === 'file') return;
  readCertForm();
  markCertDirty();
  refreshPreview();
});
$('cf-sample').addEventListener('input', refreshPreview);

// signature photo → transparent PNG: near-white pixels become see-through, then trim and shrink to fit
function signaturePng(img) {
  const maxW = 600, maxH = 220;
  const k = Math.min(1, maxW / img.naturalWidth, maxH / img.naturalHeight);
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const hgt = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = hgt;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, hgt);
  const px = ctx.getImageData(0, 0, w, hgt);
  const d = px.data;
  // the paper's brightness (85th percentile) sets the cut-off, so grey-ish photos still clean up
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  let acc = 0, paper = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= 0.85 * w * hgt) { paper = v; break; } }
  const cut = Math.max(60, Math.min(225, paper - 45));
  let minX = w, minY = hgt, maxX = -1, maxY = -1;
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (d[i + 3] < 20 || lum > cut) { d[i + 3] = 0; continue; }
      // darker = more opaque; keeps soft edges, and inks the stroke in the brand's night blue
      d[i + 3] = Math.min(255, Math.round((cut - lum) * 3) + 40);
      d[i] = 11; d[i + 1] = 18; d[i + 2] = 32;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error('empty');
  ctx.putImageData(px, 0, 0);
  const pad = 4;
  const sx = Math.max(0, minX - pad), sy = Math.max(0, minY - pad);
  const sw = Math.min(w, maxX + pad + 1) - sx, sh = Math.min(hgt, maxY + pad + 1) - sy;
  for (let scale = 1; scale >= 0.3; scale -= 0.1) {
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(sw * scale)); out.height = Math.max(1, Math.round(sh * scale));
    out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const data = out.toDataURL('image/png');
    if (data.length <= 70000) return data;
  }
  throw new Error('too-big');
}

[0, 1].forEach((i) => {
  $(`cf-s${i}-file`).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('اختار صورة JPG أو PNG أو WebP', true); return; }
    try {
      certDraft.signers[i].sig = signaturePng(await loadImage(file));
      showSigThumb(i);
      markCertDirty();
      refreshPreview();
    } catch (err) {
      toast(err && err.message === 'empty' ? 'ما لقيت توقيع بالصورة. صوّره بقلم غامق على ورقة بيضاء.' : 'ما قدرت أقرأ الصورة، جرّب وحدة ثانية', true);
    }
  });
  $(`cf-s${i}-remove`).addEventListener('click', () => {
    certDraft.signers[i].sig = '';
    showSigThumb(i);
    markCertDirty();
    refreshPreview();
  });
});

$('cf-reset').addEventListener('click', () => {
  if (!confirm('ترجيع كل نصوص الشهادة للنص الأصلي؟ (التواقيع المرفوعة بتضل، وما بينحفظ إشي لحد ما تضغط «احفظ»)')) return;
  const sigs = certDraft.signers.map((s) => s.sig);
  certDraft = structuredClone(DEFAULT_WORKSHOP.cert);
  certDraft.signers.forEach((s, i) => { s.sig = sigs[i] || ''; });
  fillCertForm();
  markCertDirty();
  refreshPreview();
});

$('cert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  readCertForm();
  if (!selId) { toast('ما في ورشة مختارة', true); return; }
  if (!certDraft.title && !certDraft.titleAccent) { toast('اكتب عنوان الشهادة', true); $('cf-title').focus(); return; }
  const btn = $('cf-save');
  setBusy(btn, true);
  try {
    const cert = structuredClone(certDraft);
    await fs.setDoc(fs.doc(db, 'workshops', selId), { cert, updatedAt: fs.serverTimestamp() }, { merge: true });
    const raw = workshops.find((w) => w.id === selId);
    if (raw) raw.cert = structuredClone(cert);
    ws = mergeWorkshop({ ...ws, cert });
    certDirty = false;
    $('cf-status').textContent = 'انحفظ';
    toast('انحفظت الشهادة، وصارت ظاهرة على كل روابط هاي الورشة');
  } catch (e2) { toast(errMsg(e2), true); } finally { setBusy(btn, false); }
});
window.addEventListener('beforeunload', (e) => { if (certDirty || wsaDirty) { e.preventDefault(); e.returnValue = ''; } });

/* =================== Total, trainers, topic survey =================== */
function downloadCsv(filename, head, rows) {
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // stop spreadsheet formula injection
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head, ...rows].map((r) => r.map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }); // BOM → Excel reads Arabic
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const waCell = (n) => (waLink(n)
  ? h('a', { class: 'wa-btn', href: waLink(n), target: '_blank', rel: 'noopener noreferrer', title: 'فتح محادثة واتساب' }, h('bdi', { dir: 'ltr' }, n))
  : h('span', { class: 'muted' }, '—'));
const dayStamp = () => new Date().toISOString().slice(0, 10);

/* ---------- total: community members + workshop registrations, merged ---------- */
// One person = one row. Two records are the same person when they share a WhatsApp number or an email,
// or (as a fallback) the same full name of 3+ words. Name-only matches are flagged so they can be reviewed.
const arNorm = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ').trim().toLowerCase();

function mergePeople() {
  const items = [
    ...members.map((m) => ({ member: true, name: m.name, wa: m.whatsapp || '', email: String(m.email || '').toLowerCase(), t: tsOf(m.createdAt) })),
    ...allRegs.map((r) => ({ member: false, wid: r.workshopId || '', name: r.name, wa: r.whatsapp || '', email: String(r.email || '').toLowerCase(), t: tsOf(r.createdAt) })),
  ];
  const parent = items.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const nameOnly = new Set(); // group roots joined only through the name
  const seen = new Map();
  const link = (key, i, byName) => {
    if (!seen.has(key)) { seen.set(key, i); return; }
    const a = find(i), b = find(seen.get(key));
    if (a === b) return;
    parent[a] = b;
    if (byName) nameOnly.add(b);
  };
  items.forEach((it, i) => { if (it.wa) link(`p:${it.wa}`, i); if (it.email) link(`e:${it.email}`, i); });
  items.forEach((it, i) => { const n = arNorm(it.name); if (n.split(' ').length >= 3) link(`n:${n}`, i, true); });

  const groups = new Map();
  items.forEach((it, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { name: '', wa: '', email: '', member: false, wids: new Set(), first: 0, viaName: false, size: 0 });
    const g = groups.get(r);
    g.size++;
    if (it.member) { g.member = true; g.name = it.name; } else if (!g.name) g.name = it.name;
    if (!g.wa && it.wa) g.wa = it.wa;
    if (!g.email && it.email) g.email = it.email;
    if (!it.member) g.wids.add(it.wid);
    if (it.t && (!g.first || it.t < g.first)) g.first = it.t;
  });
  nameOnly.forEach((root) => { const g = groups.get(find(root)); if (g) g.viaName = true; });
  return { people: [...groups.values()], records: items.length };
}

const wsLabel = (wid) => { const w = workshops.find((x) => x.id === wid); return w ? wsName(w) : 'ورشة محذوفة'; };
const TOTAL_SORT = {
  name: (g) => g.name, sources: (g) => (g.member ? 1 : 0) + g.wids.size, count: (g) => g.wids.size, first: (g) => g.first,
};
let totalCache = { people: [], records: 0 };

function filteredTotal() {
  const q = $('tt-search').value.trim().toLowerCase();
  const src = $('tt-source').value;
  return totalCache.people.filter((g) => {
    if (src === 'member' && !g.member) return false;
    if (src === 'ws' && !g.wids.size) return false;
    if (src === 'both' && !(g.member && g.wids.size)) return false;
    if (src === 'only-ws' && (g.member || !g.wids.size)) return false;
    if (q && ![g.name, g.wa, g.email].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderTotal() {
  if ($('tab-total').hidden) return;
  totalCache = mergePeople();
  const { people, records } = totalCache;
  const n = (fn) => people.filter(fn).length;
  const items = [
    ['الإجمالي بدون تكرار', people.length, true],
    ['مسجّلين بالمجتمع', n((g) => g.member)],
    ['مسجّلين بورشة', n((g) => g.wids.size)],
    ['بالمجتمع وبورشة', n((g) => g.member && g.wids.size)],
    ['ورشات فقط', n((g) => !g.member && g.wids.size)],
    ['تكرارات انشالت', records - people.length],
  ];
  $('total-stats').replaceChildren(...items.map(([label, value, accent]) => h('div', { class: accent ? 'stat stat-accent' : 'stat' },
    h('span', { class: 'stat-value' }, num(value)), h('span', { class: 'stat-label' }, label))));
  const all = filteredTotal();
  const rows = applyPager('tt', all, TOTAL_SORT, renderTotal);
  $('tt-count').textContent = `${all.length} من ${people.length} شخص (من ${records} تسجيل قبل الدمج)`;
  $('tt-empty').hidden = all.length > 0;
  $('tt-body').replaceChildren(...rows.map((g) => h('tr', {},
    h('td', { class: 'cell-name' }, profileBtn(g.name, { wa: g.wa, email: g.email, name: g.name }),
      g.viaName ? h('span', { class: 'badge badge-dup', title: 'اتدمجوا لأنه نفس الاسم الثلاثي، مع إنه الرقم أو الإيميل مختلف. راجعهم' }, 'دُمج بالاسم') : null),
    h('td', { class: 'cell-contact' }, waCell(g.wa), g.email ? h('a', { class: 'mail-link', href: `mailto:${g.email}`, dir: 'ltr' }, g.email) : null),
    h('td', { class: 'src-cell' },
      g.member ? h('span', { class: 'badge badge-src-member' }, 'المجتمع') : null,
      [...g.wids].map((wid) => h('span', { class: 'badge badge-src-ws' }, wsLabel(wid)))),
    h('td', {}, g.wids.size || '—'),
    h('td', { class: 'cell-date' }, g.first ? dateFmt.format(new Date(g.first)) : '—'))));
}
['tt-search', 'tt-source'].forEach((id) => $(id).addEventListener('input', () => { pagerState('tt').page = 1; renderTotal(); }));
wireSort('tt', 'tt-body', () => renderTotal());
$('tt-refresh').addEventListener('click', async () => { await Promise.all([loadMembers(), loadRegs()]); renderTotal(); });
$('tt-export').addEventListener('click', () => {
  downloadCsv(`beit-lahia-total-${dayStamp()}.csv`,
    ['الاسم', 'واتساب', 'الإيميل', 'مسجّل بالمجتمع', 'الورشات', 'عدد الورشات', 'دُمج بالاسم', 'أول تسجيل'],
    filteredTotal().map((g) => [g.name, g.wa, g.email, g.member ? 'نعم' : 'لا', [...g.wids].map(wsLabel).join(' / '), g.wids.size,
      g.viaName ? 'نعم' : '', g.first ? dateTimeFmt.format(new Date(g.first)) : '']));
});

/* ---------- trainers ---------- */
let trainers = [];
const TRAINER_SORT = {
  name: (t) => t.name, specialty: (t) => t.specialty, age: (t) => Number(t.age) || 0, years: (t) => Number(t.years) || 0,
  mode: (t) => TRAINER_MODES[t.mode] || '', createdAt: (t) => tsOf(t.createdAt),
};
async function loadTrainers() {
  $('tr-count').textContent = 'جاري التحميل…';
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'trainers'), fs.orderBy('createdAt', 'desc')));
    trainers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTrainers();
    markLoaded('trainers');
  } catch (e) { console.error(e); $('tr-count').textContent = errMsg(e); }
}
function filteredTrainers() {
  const q = $('tr-search').value.trim().toLowerCase();
  const mode = $('tr-mode').value;
  return trainers.filter((t) => {
    if (mode && t.mode !== mode) return false;
    return !q || [t.name, t.whatsapp, t.email, t.specialty, t.topic, t.venues].join(' ').toLowerCase().includes(q);
  });
}
function renderTrainers() {
  const avg = trainers.length ? Math.round((trainers.reduce((s, t) => s + (Number(t.years) || 0), 0) / trainers.length) * 10) / 10 : 0;
  const c = (m) => trainers.filter((t) => t.mode === m).length;
  const items = [['مدربين مسجّلين', trainers.length, true], ['ورشة', c('workshop')], ['دورة', c('course')], ['ورشة ودورة', c('both')], ['متوسط سنوات الخبرة', avg]];
  $('trainers-stats').replaceChildren(...items.map(([label, value, accent]) => h('div', { class: accent ? 'stat stat-accent' : 'stat' },
    h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label))));
  const all = filteredTrainers();
  const rows = applyPager('tr', all, TRAINER_SORT, renderTrainers);
  const seen = trainers.reduce((m, x) => { if (x.whatsapp) m[x.whatsapp] = (m[x.whatsapp] || 0) + 1; return m; }, {});
  $('tr-count').textContent = `${all.length} من ${trainers.length} مدرّب`;
  $('tr-empty').hidden = all.length > 0;
  $('tr-body').replaceChildren(...rows.map((t) => h('tr', {},
    h('td', { class: 'cell-name' }, h('strong', {}, t.name),
      seen[t.whatsapp] > 1 ? h('span', { class: 'badge badge-dup', title: 'نفس رقم الواتساب مسجّل أكثر من مرة' }, 'مكرر') : null),
    h('td', { class: 'cell-contact' }, waCell(t.whatsapp), t.email ? h('a', { class: 'mail-link', href: `mailto:${t.email}`, dir: 'ltr' }, t.email) : null),
    h('td', {}, t.specialty),
    h('td', {}, t.age),
    h('td', {}, t.years === 0 ? 'لسا ببدأ' : `${t.years} سنة`),
    h('td', {}, h('span', { class: `badge badge-mode-${t.mode}` }, TRAINER_MODES[t.mode] || t.mode)),
    h('td', { class: 'cell-wrap' }, t.topic),
    h('td', { class: 'cell-wrap' }, t.venues || '—'),
    h('td', { class: 'cell-date' }, t.createdAt ? dateFmt.format(t.createdAt.toDate()) : '—'),
    h('td', { class: 'cell-actions' }, h('button', {
      type: 'button', class: 'icon-btn danger', 'aria-label': `حذف ${t.name}`, title: 'حذف نهائي', onclick: () => deleteTrainer(t),
    }, svgIcon(ICONS.trash))))));
}
async function deleteTrainer(t) {
  if (!confirm(`حذف «${t.name}» نهائياً من المدربين؟ هاي ما بترجع.`)) return;
  try {
    await fs.deleteDoc(fs.doc(db, 'trainers', t.id));
    trainers = trainers.filter((x) => x.id !== t.id);
    renderTrainers();
    toast('انحذف');
  } catch (e) { toast(errMsg(e), true); }
}
['tr-search', 'tr-mode'].forEach((id) => $(id).addEventListener('input', () => { pagerState('tr').page = 1; renderTrainers(); }));
wireSort('tr', 'tr-body', () => renderTrainers());
$('tr-refresh').addEventListener('click', loadTrainers);
$('tr-export').addEventListener('click', () => {
  downloadCsv(`beit-lahia-trainers-${dayStamp()}.csv`,
    ['الاسم', 'واتساب', 'الإيميل', 'التخصص', 'العمر', 'سنوات الخبرة', 'بيقدّم', 'الدورة / المجال', 'جهات سابقة', 'تاريخ التسجيل'],
    filteredTrainers().map((t) => [t.name, t.whatsapp || '', t.email || '', t.specialty, t.age, t.years, TRAINER_MODES[t.mode] || t.mode,
      t.topic, t.venues || '', t.createdAt ? dateTimeFmt.format(t.createdAt.toDate()) : '']));
});

/* ---------- forms settings (site/forms): texts, open/closed, survey topics ---------- */
let formsCfg = {};
let fmTopics = SURVEY_TOPICS.map((t) => ({ ...t })); // the list being edited
/** label for a topic key: the saved list, then names of topics removed later, then the defaults */
function topicName(key) {
  return (Array.isArray(formsCfg.surveyTopics) && formsCfg.surveyTopics.find((t) => t.key === key)?.name)
    || formsCfg.surveyTopicNames?.[key] || SURVEY_TOPICS.find((t) => t.key === key)?.name || key;
}
const FM_PAGES = { survey: '/survey', trainer: '/trainer' };
// the same texts the public pages ship with (shown when nothing was saved yet)
const FM_TEXT = {
  survey: { title: 'شو بدك نعمل لك ورشة أو دورة عنه؟', lead: 'اختار المواضيع اللي بتحب نشتغل عليها، وإحنا بنرتّب الورشات والدورات الجاية على أساس اختياراتكم.', closed: 'الفورم مسكّر حالياً. تابعنا، رح نفتحه قريباً.' },
  trainer: { title: 'سجّل كمدرّب', lead: 'عندك خبرة وبتقدر تعطي ورشة أو دورة؟ عبّي بياناتك، وبنرجعلك لما نخطط لورشات ودورات جديدة للمجتمع.', closed: 'الفورم مسكّر حالياً. تابعنا، رح نفتحه قريباً.' },
};
function fmFill() {
  ['survey', 'trainer'].forEach((k) => {
    const open = formsCfg[k + 'Open'] !== false;
    $('fm-' + k + '-open').checked = open;
    $('fm-' + k + '-open-label').textContent = open ? 'الفورم مفتوح' : 'الفورم مسكّر';
    $('fm-' + k + '-title').value = formsCfg[k + 'Title'] || FM_TEXT[k].title;
    $('fm-' + k + '-lead').value = formsCfg[k + 'Lead'] || FM_TEXT[k].lead;
    $('fm-' + k + '-closed').value = formsCfg[k + 'ClosedMessage'] || FM_TEXT[k].closed;
  });
  fmTopics = (Array.isArray(formsCfg.surveyTopics) && formsCfg.surveyTopics.length ? formsCfg.surveyTopics : SURVEY_TOPICS).map((t) => ({ key: t.key, name: t.name }));
  fmRenderTopics();
}
async function loadFormsCfg() {
  try {
    const snap = await fs.getDoc(fs.doc(db, 'site', 'forms'));
    formsCfg = snap.exists() ? snap.data() : {};
  } catch (e) { toast(errMsg(e), true); }
  fmFill();
  renderSurveys();
}
function fmRenderTopics() {
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= fmTopics.length) return; [fmTopics[i], fmTopics[j]] = [fmTopics[j], fmTopics[i]]; fmRenderTopics(); };
  $('fm-topics').replaceChildren(...fmTopics.map((t, i) => h('li', {},
    h('input', { type: 'text', value: t.name, maxlength: 60, 'aria-label': 'اسم الموضوع ' + (i + 1), oninput: (e) => { t.name = e.target.value; } }),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'فوق', disabled: i === 0, onclick: () => move(i, -1) }, svgIcon(ICONS.up)),
    h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'تحت', disabled: i === fmTopics.length - 1, onclick: () => move(i, 1) }, svgIcon(ICONS.down)),
    h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'شيل ' + t.name, onclick: () => { fmTopics.splice(i, 1); fmRenderTopics(); } }, svgIcon(ICONS.trash)))));
}
function fmAddTopic() {
  const name = $('fm-topic-new').value.replace(/\s+/g, ' ').trim();
  if (name.length < 2) { $('fm-topic-new').focus(); return; }
  if (fmTopics.some((t) => t.name === name)) { toast('الموضوع موجود', true); return; }
  fmTopics.push({ key: 't' + Date.now().toString(36), name });
  $('fm-topic-new').value = '';
  fmRenderTopics();
}
$('fm-topic-add').addEventListener('click', fmAddTopic);
$('fm-topic-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); fmAddTopic(); } });
$('fm-topic-reset').addEventListener('click', () => {
  if (confirm('ترجيع قائمة المواضيع الأصلية؟ (ما بتتحفظ إلا لما تضغط احفظ)')) { fmTopics = SURVEY_TOPICS.map((t) => ({ ...t })); fmRenderTopics(); }
});
['survey', 'trainer'].forEach((k) => {
  $('fm-' + k + '-open').addEventListener('change', () => { $('fm-' + k + '-open-label').textContent = $('fm-' + k + '-open').checked ? 'الفورم مفتوح' : 'الفورم مسكّر'; });
  $('fm-' + k + '-copy').addEventListener('click', () => copyText(location.origin + FM_PAGES[k], 'انسخ الرابط'));
  $('fm-' + k + '-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
      [k + 'Open']: $('fm-' + k + '-open').checked,
      [k + 'Title']: $('fm-' + k + '-title').value.trim() || FM_TEXT[k].title,
      [k + 'Lead']: $('fm-' + k + '-lead').value.trim() || FM_TEXT[k].lead,
      [k + 'ClosedMessage']: $('fm-' + k + '-closed').value.trim() || FM_TEXT[k].closed,
    };
    if (k === 'survey') {
      const list = fmTopics.map((t) => ({ key: t.key, name: String(t.name).replace(/\s+/g, ' ').trim() }));
      if (!list.length) { toast('لازم يضل موضوع واحد على الأقل', true); return; }
      if (list.some((t) => t.name.length < 2)) { toast('في موضوع اسمه فاضي أو قصير', true); return; }
      if (new Set(list.map((t) => t.name)).size !== list.length) { toast('في موضوعين بنفس الاسم', true); return; }
      data.surveyTopics = list;
      data.surveyKeys = list.map((t) => t.key);
      data.surveyTopicNames = Object.fromEntries(list.map((t) => [t.key, t.name])); // merged: names of removed topics stay
    }
    const btn = $('fm-' + k + '-save');
    setBusy(btn, true);
    try {
      await fs.setDoc(fs.doc(db, 'site', 'forms'), { ...data, updatedAt: fs.serverTimestamp() }, { merge: true });
      formsCfg = { ...formsCfg, ...data };
      if (k === 'survey') formsCfg.surveyTopicNames = { ...(formsCfg.surveyTopicNames || {}), ...data.surveyTopicNames };
      toast('انحفظ');
      renderSurveys();
    } catch (e2) { toast(errMsg(e2), true); } finally { setBusy(btn, false); }
  });
});

/* ---------- topic survey ---------- */
let surveys = [];
const SURVEY_SORT = {
  format: (s) => SURVEY_FORMATS[s.format] || '', status: (s) => SURVEY_STATUS[s.status] || '', name: (s) => s.name || '', createdAt: (s) => tsOf(s.createdAt),
};
async function loadSurveys() {
  $('sv-count').textContent = 'جاري التحميل…';
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'topicSurveys'), fs.orderBy('createdAt', 'desc')));
    surveys = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderSurveys();
    markLoaded('surveys');
  } catch (e) { console.error(e); $('sv-count').textContent = errMsg(e); }
}
const topicsText = (s) => (s.topics || []).map(topicName).join('، ');
function filteredSurveys() {
  const q = $('sv-search').value.trim().toLowerCase();
  const fmt = $('sv-format').value;
  return surveys.filter((s) => {
    if (fmt && s.format !== fmt) return false;
    return !q || [s.name, s.whatsapp, s.other, topicsText(s)].join(' ').toLowerCase().includes(q);
  });
}
function renderSurveys() {
  const total = surveys.length;
  const c = (f) => surveys.filter((s) => s.format === f).length;
  const items = [['إجابات', total, true], ['بدهم ورشة قصيرة', c('workshop')], ['بدهم دورة طويلة', c('course')], ['الاثنين عادي', c('any')],
    ['تركوا بيانات تواصل', surveys.filter((s) => s.whatsapp).length]];
  $('survey-stats').replaceChildren(...items.map(([label, value, accent]) => h('div', { class: accent ? 'stat stat-accent' : 'stat' },
    h('span', { class: 'stat-value' }, value), h('span', { class: 'stat-label' }, label))));

  // topic ranking: votes per topic, as bars
  const votes = {};
  surveys.forEach((s) => (s.topics || []).forEach((k) => { votes[k] = (votes[k] || 0) + 1; }));
  const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1] || topicName(a[0]).localeCompare(topicName(b[0]), 'ar'));
  const max = ranked.length ? ranked[0][1] : 1;
  $('survey-bars-empty').hidden = ranked.length > 0;
  $('survey-bars').replaceChildren(...ranked.map(([k, v]) => h('li', {},
    h('span', { class: 'bar-name' }, topicName(k)),
    h('span', { class: 'bar-track', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.max(3, Math.round((v / max) * 100))}%` })),
    h('span', { class: 'bar-val' }, `${v} · ${Math.round((v / total) * 100)}%`))));

  const others = surveys.filter((s) => s.other);
  $('survey-other-panel').hidden = others.length === 0;
  $('survey-other').replaceChildren(...others.map((s) => h('li', {}, s.other, s.name ? h('small', { class: 'muted' }, ` — ${s.name}`) : null)));

  const all = filteredSurveys();
  const rows = applyPager('sv', all, SURVEY_SORT, renderSurveys);
  $('sv-count').textContent = `${all.length} من ${total} إجابة`;
  $('sv-empty').hidden = all.length > 0;
  $('sv-body').replaceChildren(...rows.map((s) => h('tr', {},
    h('td', { class: 'cell-wrap' }, topicsText(s) || '—', s.other ? h('div', { class: 'muted small' }, `غيره: ${s.other}`) : null),
    h('td', {}, SURVEY_FORMATS[s.format] || s.format),
    h('td', {}, SURVEY_STATUS[s.status] || '—'),
    h('td', { class: 'cell-name' }, s.name ? h('strong', {}, s.name) : h('span', { class: 'muted' }, 'بدون اسم')),
    h('td', { class: 'cell-contact' }, waCell(s.whatsapp)),
    h('td', { class: 'cell-date' }, s.createdAt ? dateFmt.format(s.createdAt.toDate()) : '—'),
    h('td', { class: 'cell-actions' }, h('button', {
      type: 'button', class: 'icon-btn danger', 'aria-label': 'حذف هاي الإجابة', title: 'حذف نهائي', onclick: () => deleteSurvey(s),
    }, svgIcon(ICONS.trash))))));
}
async function deleteSurvey(s) {
  if (!confirm('حذف هاي الإجابة نهائياً؟ هاي ما بترجع.')) return;
  try {
    await fs.deleteDoc(fs.doc(db, 'topicSurveys', s.id));
    surveys = surveys.filter((x) => x.id !== s.id);
    renderSurveys();
    toast('انحذفت');
  } catch (e) { toast(errMsg(e), true); }
}
['sv-search', 'sv-format'].forEach((id) => $(id).addEventListener('input', () => { pagerState('sv').page = 1; renderSurveys(); }));
wireSort('sv', 'sv-body', () => renderSurveys());
$('sv-refresh').addEventListener('click', loadSurveys);
$('sv-export').addEventListener('click', () => {
  downloadCsv(`beit-lahia-survey-${dayStamp()}.csv`,
    ['المواضيع', 'موضوع آخر', 'يفضّل', 'الحالة', 'الاسم', 'واتساب', 'تاريخ'],
    filteredSurveys().map((s) => [topicsText(s), s.other || '', SURVEY_FORMATS[s.format] || s.format, SURVEY_STATUS[s.status] || '', s.name || '', s.whatsapp || '',
      s.createdAt ? dateTimeFmt.format(s.createdAt.toDate()) : '']));
});

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
const syncOpenLabel = () => {
  const on = $('set-open').checked;
  $('set-open-label').textContent = on ? 'التسجيل مفتوح' : 'التسجيل مسكّر';
  $('set-open-sub').textContent = on ? 'الناس بيقدروا يسجّلوا هلأ.' : 'صفحة التسجيل بتعرض الرسالة اللي تحت بدل الفورم.';
  $('settings-form').classList.toggle('is-closed', !on);
};
$('set-open').addEventListener('change', syncOpenLabel);

// settings card: unsaved-changes state, message counter, "try the group link"
function setSettingsDirty(on) {
  const st = $('settings-status');
  st.textContent = on ? 'في تعديلات مش محفوظة' : 'كل شي محفوظ';
  st.classList.toggle('is-dirty', on);
}
function syncSettingsExtras() {
  $('set-msg-count').textContent = `${$('set-msg').value.length}/300`;
  const url = safeUrl($('set-group').value.trim());
  const a = $('set-group-test');
  a.href = url || '#';
  a.setAttribute('aria-disabled', String(!url));
}
$('settings-form').addEventListener('input', () => { setSettingsDirty(true); syncSettingsExtras(); });
$('set-group-test').addEventListener('click', (e) => { if (e.currentTarget.getAttribute('aria-disabled') === 'true') e.preventDefault(); });

// account card
function fillAccount() {
  const email = auth.currentUser?.email || '';
  $('acc-email').textContent = email;
  $('acc-av').textContent = (email[0] || 'أ').toUpperCase();
}
$('acc-reset').addEventListener('click', async () => {
  const email = auth.currentUser?.email;
  if (!email) return;
  const btn = $('acc-reset');
  setBusy(btn, true);
  try {
    await au.sendPasswordResetEmail(auth, email);
    toast(`بعتنا رابط تغيير كلمة السر على ${email}`);
  } catch (e) { toast(e?.code === 'auth/too-many-requests' ? 'طلبات كثير. استنى شوي وجرّب.' : 'ما قدرت أبعت الرابط.', true); } finally { setBusy(btn, false); }
});

// site/settings is shared by two tabs (التواصل / الإعدادات): each one saves only its own fields (merge).
async function loadSettings() {
  let s = DEFAULT_SETTINGS;
  try {
    const snap = await fs.getDoc(fs.doc(db, 'site', 'settings'));
    if (snap.exists()) s = { ...DEFAULT_SETTINGS, ...snap.data() };
  } catch (e) { toast(errMsg(e), true); }
  siteSettings = s;
  markLoaded('settings');
  $('set-open').checked = s.registrationOpen !== false;
  $('set-msg').value = s.closedMessage || '';
  $('set-group').value = s.whatsappGroup || '';
  syncOpenLabel();
  syncSettingsExtras();
  setSettingsDirty(false);
  fillAccount();
  showMembers = s.showMembers === true;
  syncTeamToggle();
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
    siteSettings = { ...siteSettings, registrationOpen: $('set-open').checked };
    renderOverview();
    setSettingsDirty(false);
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
    const [membersAll, eventsAll, galleryAll, statsAll, siteContent, siteSettings, siteForms, teamAll, workshopsAll, regsAll, certsAll, trainersAll, surveysAll] = await Promise.all([
      all('members'), all('events'), all('gallery'), all('stats'), one('site', 'content'), one('site', 'settings'), one('site', 'forms'), all('team'),
      all('workshops'), all('workshopRegs'), all('certificates'), all('trainers'), all('topicSurveys'),
    ]);
    const backup = {
      app: 'beit-lahia-tech', version: 1, exportedAt: new Date().toISOString(),
      members: membersAll, events: eventsAll, gallery: galleryAll, stats: statsAll, team: teamAll,
      workshops: workshopsAll, workshopRegs: regsAll, certificates: certsAll,
      trainers: trainersAll, topicSurveys: surveysAll,
      site: { content: siteContent, settings: siteSettings, forms: siteForms },
    };
    if ($('backup-full').checked) backup.galleryFull = await all('galleryFull');
    const blob = new Blob([JSON.stringify(backup, null, 1)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `beit-lahia-backup-${gazaDay()}.json` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`نزلت النسخة: ${membersAll.length} تسجيل، ${eventsAll.length} فعالية، ${galleryAll.length} صورة`);
    $('backup-status').textContent = `آخر نسخة: ${new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' }).format(new Date())} · ${(blob.size / 1024 / 1024).toFixed(1)} MB`;
  } catch (e) { console.error(e); toast(errMsg(e), true); } finally { setBusy(btn, false, 'نزّل نسخة احتياطية'); }
});
