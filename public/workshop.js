// Beit Lahia Tech — workshop page.
// /workshop → the workshop in site/settings.currentWorkshop; /workshop?w=<id> → that workshop.
// Content from workshops/{id}; registration → workshopRegs (with workshopId). A finished workshop
// (status 'done') shows «الورشة انتهت» instead of the form; past workshops are listed at the bottom.
import { getDbLite as getDb } from './firebase-init.js';
import { DEFAULT_SETTINGS, renderFooterLinks } from './content-defaults.js';
import { mergeWorkshop, arDate, hoursWord, accentAI, AI_TOOLS, DEFAULT_WORKSHOP } from './workshop-shared.js';

const $ = (id) => document.getElementById(id);
const COLLECTION = 'workshopRegs';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

$('year').textContent = new Date().getFullYear();
renderFooterLinks($('footer-social'), null);

/* =================== Content =================== */
let ws = mergeWorkshop(null);
let wid = ''; // the workshop shown here ('' → none found, the form stays closed)
const askedId = (new URLSearchParams(location.search).get('w') || '').trim();
const validId = (v) => /^[A-Za-z0-9_-]{1,40}$/.test(v || '');

const topicsText = (n) => (!n ? '' : n === 1 ? 'محور واحد' : n === 2 ? 'محورين' : n <= 10 ? `${n} محاور` : `${n} محور`);
function hoursText(n) { return n === 1 ? 'ساعة' : n === 2 ? 'ساعتين' : n <= 10 ? `${n} ساعات` : `${n} ساعة`; }

function renderContent() {
  accentAI($('ws-title'), ws.title);
  $('i-title').textContent = ws.title;
  // highlight "الذكاء الاصطناعي" in the Arabic title with the AI gradient
  const h1 = $('ws-title-ar');
  h1.replaceChildren();
  const m = /(بال|لل|ال)?ذكاء الاصطناعي/.exec(ws.titleAr);
  if (m) {
    h1.append(ws.titleAr.slice(0, m.index));
    const s = document.createElement('span'); s.className = 'ai-grad'; s.textContent = m[0];
    h1.append(s, ws.titleAr.slice(m.index + m[0].length));
  } else h1.textContent = ws.titleAr || ws.title;
  $('ws-desc').textContent = ws.description;
  $('m-hours-v').textContent = hoursText(ws.hours);
  $('i-hours').textContent = ws.hours >= 3 ? `${ws.hours} ${hoursWord(ws.hours)}` : hoursWord(ws.hours);
  const when = [ws.date ? arDate(ws.date) : '', ws.time].filter(Boolean).join(' · ');
  $('m-date').hidden = !when; $('m-date-v').textContent = when;
  $('i-date-row').hidden = !when; $('i-date').textContent = when;
  $('m-place').hidden = !ws.place; $('m-place-v').textContent = ws.place;
  $('i-place-row').hidden = !ws.place; $('i-place').textContent = ws.place;
  $('topics-title').textContent = `${hoursText(ws.hours)} عملية، من الفكرة للكود الشغّال`;
  $('ws-topics').replaceChildren(...ws.topics.map((t, i) => {
    const li = document.createElement('li'); li.className = 'ws-topic';
    const head = document.createElement('div'); head.className = 'ws-topic-head';
    const num = document.createElement('span'); num.className = 'ws-num';
    num.append(document.createElement('i'), String(i + 1).padStart(2, '0'));
    head.append(num);
    if (t.time) { const tm = document.createElement('span'); tm.className = 'ws-time'; tm.textContent = t.time; head.append(tm); }
    const h3 = document.createElement('h3'); h3.textContent = t.title;
    li.append(head, h3);
    if (t.desc) { const p = document.createElement('p'); p.textContent = t.desc; li.append(p); }
    return li;
  }));
  $('topics').hidden = ws.topics.length === 0;
  const done = ws.status === 'done';
  if (!wid || done || !ws.open) {
    $('ws-eyebrow').classList.add(done ? 'is-done' : 'is-closed');
    $('ws-eyebrow-text').textContent = !wid ? 'ورشة عمل' : done ? `ورشة عمل · انتهت${ws.date ? ` (${arDate(ws.date)})` : ''}` : 'ورشة عمل · التسجيل مسكّر';
    $('cta-book').hidden = true;
    $('closed-title').textContent = !wid ? 'الورشة مش موجودة' : done ? 'الورشة انتهت' : 'التسجيل بالورشة مسكّر';
    $('closed-msg').textContent = !wid
      ? 'ما لقينا هاي الورشة. ممكن الرابط غلط أو الورشة لسا ما انفتحت. تابعنا عشان توصلك الورشات الجاية.'
      : done ? 'شكراً لكل اللي حضروا ✦ تابعنا عشان توصلك الورشات الجاية.' : ws.closedMessage;
    form.hidden = true;
    $('success').hidden = true;
    $('closed').hidden = false;
  }
  if (done) $('topics-title').textContent = `${hoursText(ws.hours)} عملية، هاد اللي غطيناه`;
  if (wid) document.title = `${ws.titleAr || ws.title} | ورشات بيت لاهيا تيك`;
  const group = /^https:\/\/\S+$/.test(ws.whatsappGroup.trim()) ? ws.whatsappGroup.trim() : '';
  $('group-btn').hidden = !group;
  if (group) $('group-btn').href = group;
  $('success-meta').replaceChildren(...[ws.title, when, ws.place].filter(Boolean).map((t) => Object.assign(document.createElement('span'), { textContent: t })));
}

function renderPast(list) {
  const items = list.filter((x) => x.id !== wid)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  $('past').hidden = items.length === 0;
  $('ws-past').replaceChildren(...items.map((x) => {
    const li = document.createElement('li');
    const a = Object.assign(document.createElement('a'), { className: 'ws-past-card', href: `/workshop?w=${encodeURIComponent(x.id)}` });
    const date = document.createElement('span'); date.className = 'ws-past-date';
    date.append(document.createElement('i'), x.date ? arDate(x.date) : 'ورشة سابقة');
    const h3 = document.createElement('h3'); h3.textContent = x.titleAr || x.title;
    a.append(date, h3);
    if (x.titleAr && x.title) {
      const en = document.createElement('bdi'); en.className = 'ws-past-en'; en.dir = 'ltr'; en.textContent = x.title; a.append(en);
    }
    const meta = document.createElement('div'); meta.className = 'ws-past-meta';
    [hoursText(x.hours), topicsText(x.topics.length), x.place].filter(Boolean)
      .forEach((t) => meta.append(Object.assign(document.createElement('span'), { textContent: t })));
    a.append(meta);
    li.append(a);
    return li;
  }));
}

(async () => {
  let fs, db;
  try {
    ({ db, fs } = await getDb());
    const setSnap = await fs.getDoc(fs.doc(db, 'site', 'settings')).catch(() => null);
    const settings = setSnap && setSnap.exists() ? setSnap.data() : {};
    if (setSnap && setSnap.exists()) renderFooterLinks($('footer-social'), { ...DEFAULT_SETTINGS, ...settings });
    const id = validId(askedId) ? askedId : validId(settings.currentWorkshop) ? settings.currentWorkshop : '';
    // a draft (or a wrong id) isn't readable by visitors → "not found"
    const snap = id ? await fs.getDoc(fs.doc(db, 'workshops', id)).catch(() => null) : null;
    if (snap && snap.exists()) { wid = id; ws = mergeWorkshop(snap.data()); }
    else ws = { ...mergeWorkshop(null), topics: askedId ? [] : DEFAULT_WORKSHOP.topics };
  } catch (e) {
    console.warn('[workshop]', e); // defaults keep the page readable; the form stays closed
  }
  renderContent();
  if (!db) return;
  try {
    const past = await fs.getDocs(fs.query(fs.collection(db, 'workshops'), fs.where('status', '==', 'done')));
    renderPast(past.docs.map((d) => ({ id: d.id, ...mergeWorkshop(d.data()) })));
  } catch (e) { console.warn('[workshop past]', e); }
})();

/* =================== Hero: neural pixel network =================== */
function drawNet() {
  const svg = $('ws-net');
  const W = svg.clientWidth, H = svg.clientHeight;
  if (!W || !H) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const n = Math.round(Math.min(26, Math.max(12, W / 55)));
  const pts = Array.from({ length: n }, () => [rnd() * W, rnd() * H]);
  const ns = 'http://www.w3.org/2000/svg';
  const out = [];
  const defs = document.createElementNS(ns, 'defs');
  defs.innerHTML = '<linearGradient id="net-grad" x1="0" x2="1"><stop offset="0" stop-color="#34D399"/><stop offset="1" stop-color="#22D3EE"/></linearGradient>';
  out.push(defs);
  pts.forEach((p, i) => {
    pts.map((q, j) => [j, Math.hypot(p[0] - q[0], p[1] - q[1])]).filter(([j]) => j > i).sort((a, b) => a[1] - b[1]).slice(0, 2)
      .forEach(([j, d]) => {
        if (d > 260) return;
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', p[0].toFixed(1)); l.setAttribute('y1', p[1].toFixed(1));
        l.setAttribute('x2', pts[j][0].toFixed(1)); l.setAttribute('y2', pts[j][1].toFixed(1));
        if (rnd() < 0.35) { l.classList.add('pulse'); l.style.animationDelay = `${(-rnd() * 4.5).toFixed(2)}s`; }
        out.push(l);
      });
  });
  pts.forEach((p) => {
    const r = document.createElementNS(ns, 'rect');
    const s = rnd() < 0.3 ? 7 : 5;
    r.setAttribute('x', (p[0] - s / 2).toFixed(1)); r.setAttribute('y', (p[1] - s / 2).toFixed(1));
    r.setAttribute('width', s); r.setAttribute('height', s); r.setAttribute('rx', 1.5);
    const t = rnd(); if (t < 0.15) r.setAttribute('class', 'r'); else if (t < 0.35) r.setAttribute('class', 'c');
    out.push(r);
  });
  svg.replaceChildren(...out);
}
drawNet();
let netTimer;
window.addEventListener('resize', () => { clearTimeout(netTimer); netTimer = setTimeout(drawNet, 200); });

/* =================== Hero: the AI "generates" the pixel strawberry =================== */
const PROMPTS = [
  'ارسملي شعار بيت لاهيا بالبكسلات',
  'ابنيلي صفحة تسجيل للورشة بهوية المجتمع',
  'راجع الكود وصلّح الأخطاء',
];
const card = $('ai-card');
const logo = $('ai-logo');
const rects = [...document.querySelectorAll('#logo rect')].map((r) => {
  const c = r.cloneNode();
  c.setAttribute('fill', r.parentNode.getAttribute('fill'));
  logo.append(c);
  return c;
}).sort((a, b) => (+a.getAttribute('y') - +b.getAttribute('y')) || (+a.getAttribute('x') - +b.getAttribute('x')));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function generateLoop() {
  if (reduceMotion) {
    $('ai-typed').textContent = PROMPTS[0];
    rects.forEach((r) => r.classList.add('on'));
    $('ai-prog').style.width = '100%';
    $('ai-status').textContent = 'جاهز ✓';
    card.classList.add('is-done');
    return;
  }
  for (let k = 0; ; k = (k + 1) % PROMPTS.length) {
    const text = PROMPTS[k];
    card.classList.remove('is-done', 'is-gen');
    rects.forEach((r) => r.classList.remove('on', 'hot'));
    $('ai-prog').style.width = '0';
    $('ai-status').textContent = 'بستنى الطلب…';
    $('ai-typed').textContent = '';
    for (let i = 1; i <= text.length; i++) { $('ai-typed').textContent = text.slice(0, i); await sleep(45); }
    await sleep(350);
    card.classList.add('is-gen');
    $('ai-status').textContent = 'جاري التوليد…';
    for (let i = 0; i < rects.length; i++) {
      rects[i].classList.add('on', 'hot');
      const prev = rects[i - 3]; if (prev) prev.classList.remove('hot');
      $('ai-prog').style.width = `${Math.round(((i + 1) / rects.length) * 100)}%`;
      await sleep(42);
    }
    rects.forEach((r) => r.classList.remove('hot'));
    card.classList.remove('is-gen');
    card.classList.add('is-done');
    $('ai-status').textContent = 'جاهز ✓';
    await sleep(3200);
  }
}
generateLoop();

/* =================== Form =================== */
const form = $('ws-form');
const submitBtn = $('submit-btn');
const statusEl = $('form-status');

$('tool-chips').replaceChildren(...AI_TOOLS.map((t) => {
  const label = document.createElement('label'); label.className = 'tool-chip';
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', name: 'aiTools', value: t.key });
  const span = document.createElement('span'); span.textContent = t.name;
  label.append(input, span);
  return label;
}));
// «لسا ما جربت» can't be combined with a tool
form.addEventListener('change', (e) => {
  if (e.target.name !== 'aiTools' || !e.target.checked) return;
  const boxes = [...form.querySelectorAll('input[name="aiTools"]')];
  if (e.target.value === 'none') boxes.forEach((b) => { if (b !== e.target) b.checked = false; });
  else boxes.find((b) => b.value === 'none').checked = false;
});

const exp = form.elements.expectations;
exp.addEventListener('input', () => { $('exp-count').textContent = exp.value.length; });

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const latinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6F0);
function normalizePhone(v) {
  let s = latinDigits(v).replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (/^05\d{8}$/.test(s)) s = `+970${s.slice(1)}`;
  else if (/^5\d{8}$/.test(s)) s = `+970${s}`;
  else if (/^(970|972)\d{9}$/.test(s)) s = `+${s}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}
const normalizeEmail = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : '';
};

const rules = {
  name: (v) => {
    v = clean(v);
    if (!v) return 'اكتب اسمك الكامل';
    if (v.length < 2) return 'الاسم قصير، اكتبه كامل';
    if (v.length > 80) return 'الاسم طويل (80 حرف كحد أقصى)';
    return '';
  },
  whatsapp: (v) => (!String(v).trim() ? 'اكتب رقم الواتساب عشان نقدر نتواصل معك'
    : normalizePhone(v) ? '' : 'الرقم مش صحيح. مثال: 0591234567 أو ‎+970591234567'),
  email: (v) => (!String(v).trim() || normalizeEmail(v) ? '' : 'الإيميل مش صحيح. مثال: name@example.com'),
  status: (v) => (['tawjihi', 'student', 'graduate', 'other'].includes(v) ? '' : 'اختار حالتك'),
  level: (v) => (['beginner', 'intermediate', 'advanced'].includes(v) ? '' : 'اختار مستواك بالبرمجة'),
  laptop: (v) => (['yes', 'no'].includes(v) ? '' : 'خبّرنا إذا عندك لابتوب'),
  consent: () => (form.elements.consent.checked ? '' : 'لازم توافق عشان نكمّل'),
};

function fieldOf(name) {
  const el = form.elements[name];
  return (el instanceof RadioNodeList ? el[0] : el).closest('.field');
}
function setError(name, msg) {
  fieldOf(name).classList.toggle('has-error', !!msg);
  const errEl = $(`${name}-error`);
  if (errEl) errEl.textContent = msg;
  const el = form.elements[name];
  (el instanceof RadioNodeList ? [...el] : [el]).forEach((i) => {
    i.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (errEl) i.setAttribute('aria-describedby', `${name}-error`);
  });
}
function validateField(name) {
  const el = form.elements[name];
  const msg = rules[name](el instanceof RadioNodeList ? el.value : el.value);
  setError(name, msg);
  return !msg;
}
Object.keys(rules).forEach((name) => {
  const el = form.elements[name];
  (el instanceof RadioNodeList ? [...el] : [el]).forEach((i) => {
    i.addEventListener('blur', () => { if ((i.type !== 'radio' && i.type !== 'checkbox' && i.value) || fieldOf(name).classList.contains('has-error')) validateField(name); });
    i.addEventListener(i.type === 'radio' || i.type === 'checkbox' ? 'change' : 'input', () => {
      if (fieldOf(name).classList.contains('has-error')) validateField(name);
    });
  });
});
form.addEventListener('focusin', () => { getDb().catch(() => {}); }, { once: true });

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle('is-loading', on);
  submitBtn.querySelector('.btn-label').textContent = on ? 'جاري الحجز…' : 'احجز مقعدي';
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  const invalid = Object.keys(rules).filter((n) => !validateField(n));
  if (invalid.length) {
    const first = form.elements[invalid[0]];
    (first instanceof RadioNodeList ? first[0] : first).focus();
    statusEl.textContent = 'في حقول بحاجة تعديل، شوفها فوق.';
    statusEl.classList.add('err');
    return;
  }
  if (form.elements.website.value) { showSuccess(); return; } // honeypot

  if (!wid) { statusEl.textContent = 'ما في ورشة مفتوحة للتسجيل هلأ.'; statusEl.classList.add('err'); return; }
  const f = form.elements;
  const data = {
    workshopId: wid,
    name: clean(f.name.value),
    whatsapp: normalizePhone(f.whatsapp.value),
    status: f.status.value,
    level: f.level.value,
    laptop: f.laptop.value === 'yes',
    aiTools: [...form.querySelectorAll('input[name="aiTools"]:checked')].map((b) => b.value),
    consent: true,
    source: 'web',
  };
  const email = normalizeEmail(f.email.value);
  if (email) data.email = email;
  const expectations = exp.value.trim().slice(0, 500);
  if (expectations) data.expectations = expectations;

  setLoading(true);
  try {
    const { db, fs } = await getDb();
    await fs.addDoc(fs.collection(db, COLLECTION), { ...data, createdAt: fs.serverTimestamp() });
    showSuccess();
  } catch (err) {
    console.error('[workshop register]', err);
    statusEl.textContent = !navigator.onLine
      ? 'ما في اتصال بالإنترنت. تأكد من الاتصال وجرّب كمان مرة.'
      : err && err.code === 'permission-denied'
        ? 'التسجيل بالورشة مسكّر حالياً أو البيانات مش مقبولة. حدّث الصفحة وجرّب.'
        : 'صار خطأ وما وصل التسجيل. جرّب كمان مرة بعد شوي.';
    statusEl.classList.add('err');
  } finally { setLoading(false); }
});

function showSuccess() {
  form.hidden = true;
  $('success').hidden = false;
  $('success').focus();
  $('success').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

$('again-btn').addEventListener('click', () => {
  form.reset();
  Object.keys(rules).forEach((n) => setError(n, ''));
  $('exp-count').textContent = '0';
  $('success').hidden = true;
  form.hidden = false;
  form.elements.name.focus();
});

