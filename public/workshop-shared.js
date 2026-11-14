// Beit Lahia Tech — workshop + certificate: defaults and the certificate renderer.
// workshops/{wid} (public read when live/done, admin write) holds one workshop's info and its certificate
// template; site/settings.currentWorkshop says which one /workshop shows. certificates/{id} holds one
// issued certificate ({ name, no, date, workshopId }). The same renderer draws the certificate on
// /certificate and the live preview in /admin, so both always look the same.

export const AI_TOOLS = [
  { key: 'chatgpt', name: 'ChatGPT' },
  { key: 'claude', name: 'Claude' },
  { key: 'gemini', name: 'Gemini' },
  { key: 'copilot', name: 'GitHub Copilot' },
  { key: 'cursor', name: 'Cursor' },
  { key: 'none', name: 'لسا ما جربت' },
];
export const WS_STATUS = { tawjihi: 'طالب توجيهي', student: 'طالب جامعة', graduate: 'خريج', other: 'غير ذلك' };
export const WS_LEVEL = { beginner: 'مبتدئ', intermediate: 'متوسط', advanced: 'متقدم' };
/** workshop lifecycle: draft (admins only) → live (on the site, can take registrations) → done (archive) */
export const WS_STATES = { draft: 'مسودة', live: 'منشورة', done: 'انتهت' };

export const DEFAULT_WORKSHOP = {
  status: 'live',
  open: true,
  title: 'AI-Powered Development',
  titleAr: 'التطوير البرمجي المدعوم بالذكاء الاصطناعي',
  description: 'ورشة عملية بنتعلم فيها كيف نخلّي أدوات الذكاء الاصطناعي شريك حقيقي بالبرمجة: من كتابة الفكرة، لكتابة الكود، لمراجعته وتصليحه، لحد ما يطلع مشروع شغّال.',
  date: '',
  time: '',
  place: '',
  hours: 3,
  // محاور الورشة: عنوان + وصف قصير + مدة (اختيارية). بتتعدّل من تبويب «الورشات».
  topics: [
    { title: 'كتابة Prompts بتطلّع كود صح', desc: 'كيف توصف المطلوب للـ AI بدقة، مع أمثلة جيدة وسيئة، عشان يطلع الكود صح من أول مرة.', time: '30 دقيقة' },
    { title: 'نبني مشروع من الصفر مع الـ AI', desc: 'تطبيق عملي: من الفكرة لمشروع صغير شغّال، خطوة بخطوة مع مساعد ذكاء اصطناعي.', time: '75 دقيقة' },
    { title: 'مراجعة الكود وتصليح الأخطاء', desc: 'نخلّي الـ AI يراجع الكود، يشرح الأخطاء، ويقترح حلول، وإحنا نقرر.', time: '45 دقيقة' },
    { title: 'متى نثق بالـ AI ومتى لا', desc: 'حدود الأدوات، أمان الكود والبيانات، وأفضل الممارسات بالشغل الحقيقي.', time: '30 دقيقة' },
  ],
  whatsappGroup: '',
  closedMessage: 'التسجيل بالورشة مسكّر حالياً. تابعنا عشان توصلك الورشات الجاية.',
  cert: {
    title: 'شهادة',
    titleAccent: 'إنجاز',
    titleEn: 'CERTIFICATE OF COMPLETION',
    intro: 'تُمنح هذه الشهادة بكل فخر إلى',
    reason: 'تقديرًا لإتمام ورشة العمل التدريبية بنجاح',
    numberPrefix: 'BLT-AI-2026-',
    place: 'بيت لاهيا — فلسطين',
    tagline1: 'معاً نبني جيلاً',
    tagline2: 'تقنياً',
    signers: [
      { role: 'إدارة بيت لاهيا تيك', name: '', en: 'Beit Lahia Tech', sig: '' },
      { role: 'مدرّب الورشة', name: '', en: 'Workshop Instructor', sig: '' },
    ],
  },
};

const str = (v, fallback) => (typeof v === 'string' ? v : fallback);

/** a topic is { title, desc, time }; older saves stored plain strings */
export function normalizeTopic(t) {
  if (typeof t === 'string') return { title: t.trim(), desc: '', time: '' };
  if (!t || typeof t !== 'object') return { title: '', desc: '', time: '' };
  return { title: str(t.title, '').trim(), desc: str(t.desc, '').trim(), time: str(t.time, '').trim() };
}

/** Saved doc (possibly partial or old) + defaults → a complete workshop object. */
export function mergeWorkshop(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  const d = DEFAULT_WORKSHOP;
  const c = s.cert && typeof s.cert === 'object' ? s.cert : {};
  const signers = d.cert.signers.map((def, i) => {
    const x = Array.isArray(c.signers) && c.signers[i] && typeof c.signers[i] === 'object' ? c.signers[i] : {};
    return { role: str(x.role, def.role), name: str(x.name, def.name), en: str(x.en, def.en), sig: /^data:image\/(png|jpeg|webp);base64,/.test(x.sig || '') ? x.sig : '' };
  });
  const cert = {};
  Object.keys(d.cert).forEach((k) => { if (k !== 'signers') cert[k] = str(c[k], d.cert[k]); });
  cert.signers = signers;
  const hours = Number.isFinite(Number(s.hours)) && Number(s.hours) > 0 ? Number(s.hours) : d.hours;
  return {
    status: s.status in WS_STATES ? s.status : d.status,
    open: s.open !== false,
    title: str(s.title, d.title) || d.title,
    titleAr: str(s.titleAr, d.titleAr),
    description: str(s.description, d.description),
    date: /^\d{4}-\d{2}-\d{2}$/.test(s.date || '') ? s.date : '',
    time: str(s.time, ''),
    place: str(s.place, ''),
    hours,
    topics: (Array.isArray(s.topics) ? s.topics : d.topics).map(normalizeTopic).filter((t) => t.title),
    whatsappGroup: str(s.whatsappGroup, ''),
    closedMessage: str(s.closedMessage, d.closedMessage) || d.closedMessage,
    cert,
  };
}

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
/** "2026-11-14" (or a Date) → "14 نوفمبر 2026" */
export function arDate(v) {
  let y, m, d;
  if (v instanceof Date) { y = v.getFullYear(); m = v.getMonth(); d = v.getDate(); }
  else {
    const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    if (!p) return '';
    y = +p[1]; m = +p[2] - 1; d = +p[3];
  }
  return `${d} ${MONTHS[m]} ${y}`;
}

/** 1 → ساعة, 2 → ساعتان, 3-10 → ساعات, 11+ → ساعة (Arabic counting) */
export function hoursWord(n) {
  n = Number(n);
  if (n === 1) return 'ساعة تدريبية';
  if (n === 2) return 'ساعتان تدريبيتان';
  if (n >= 3 && n <= 10) return 'ساعات تدريبية';
  return 'ساعة تدريبية';
}

/** "AI-Powered Development" → text nodes with every standalone "AI" wrapped in <em> */
export function accentAI(el, text) {
  el.replaceChildren();
  String(text || '').split(/\b(AI)\b/).forEach((part, i) => {
    if (!part) return;
    if (i % 2) { const em = document.createElement('em'); em.textContent = part; el.append(em); } else el.append(part);
  });
}

const SHEET = `
<section class="cert-main">
  <i class="cert-corner tr"></i><i class="cert-corner br"></i><i class="cert-corner tl"></i><i class="cert-corner bl"></i>
  <div class="cert-top">
    <div class="cert-kicker"><i></i><i></i><i></i><span data-k="titleEn"></span></div>
    <div class="cert-no"><small>CERTIFICATE NO.</small><b data-k="no"></b></div>
  </div>
  <div class="cert-title"><span data-k="title"></span> <span class="acc" data-k="titleAccent"></span></div>
  <p class="cert-intro" data-k="intro"></p>
  <div class="cert-name" data-k="name"></div>
  <div class="cert-px" aria-hidden="true"></div>
  <p class="cert-reason" data-k="reason"></p>
  <div class="cert-ws">
    <div class="cert-ws-title">
      <span class="cert-ws-tag">WORKSHOP</span>
      <span class="cert-ws-name" data-k="wsTitle"></span>
      <span class="cert-ws-ar" data-k="wsAr"></span>
    </div>
    <div class="cert-ws-hours"><b data-k="hours"></b><span data-k="hoursWord"></span></div>
  </div>
  <div class="cert-signs">
    <div class="cert-sig" data-sig="0"><span class="cert-sig-label">التوقيع</span><div class="cert-sig-space"></div><div class="cert-sig-line"></div><div class="cert-sig-role"></div><div class="cert-sig-name"></div><div class="cert-sig-en"></div></div>
    <div class="cert-sig" data-sig="1"><span class="cert-sig-label">التوقيع</span><div class="cert-sig-space"></div><div class="cert-sig-line"></div><div class="cert-sig-role"></div><div class="cert-sig-name"></div><div class="cert-sig-en"></div></div>
    <div class="cert-sig"><span class="cert-sig-label">تاريخ الإصدار</span><div class="cert-sig-space is-val" data-k="date"></div><div class="cert-sig-line"></div><div class="cert-sig-role" data-k="place"></div><div class="cert-sig-name"></div><div class="cert-sig-en">Date of Issue</div></div>
  </div>
</section>
<aside class="cert-panel">
  <div class="cert-p-brand"><div class="n">بيت لاهيا <span>تيك</span></div><div class="e">BEIT LAHIA TECH</div></div>
  <svg class="cert-p-logo" viewBox="0 0 236 266" aria-hidden="true"><use href="#logo"/></svg>
  <p class="cert-p-tag"><span data-k="tagline1"></span><br data-k-br><b data-k="tagline2"></b></p>
  <div class="cert-p-url"><i></i>beitlahia.tech</div>
</aside>
<div class="cert-dissolve" aria-hidden="true"></div>`;

/**
 * Draw a certificate into `host` (replaces its content).
 * ws = mergeWorkshop(...) ; data = { name, no, date } (all optional → blank certificate)
 * Returns a `refresh()` that re-measures the name (call it once the sheet is visible / fonts loaded).
 */
export function renderCertificate(host, ws, data = {}) {
  let sheet = host.querySelector(':scope > .cert');
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.className = 'cert';
    sheet.innerHTML = SHEET; // static markup only; every value below goes in through textContent
    host.replaceChildren(sheet);
    drawDissolve(sheet.querySelector('.cert-dissolve'));
  }
  const c = ws.cert;
  const set = (k, v) => sheet.querySelectorAll(`[data-k="${k}"]`).forEach((el) => { el.textContent = v ?? ''; });
  set('titleEn', c.titleEn);
  set('no', data.no || '');
  sheet.querySelector('.cert-no').style.visibility = data.no ? '' : 'hidden';
  set('title', c.title);
  set('titleAccent', c.titleAccent);
  set('intro', c.intro);
  const nameEl = sheet.querySelector('.cert-name');
  nameEl.textContent = data.name || '';
  nameEl.classList.toggle('is-blank', !data.name);
  set('reason', c.reason);
  accentAI(sheet.querySelector('[data-k="wsTitle"]'), ws.title);
  set('wsAr', ws.titleAr);
  set('hours', String(ws.hours));
  set('hoursWord', hoursWord(ws.hours));
  set('date', data.date || '');
  set('place', c.place);
  set('tagline1', c.tagline1);
  set('tagline2', c.tagline2);
  sheet.querySelector('[data-k-br]').hidden = !c.tagline1 || !c.tagline2;
  c.signers.forEach((s, i) => {
    const box = sheet.querySelector(`[data-sig="${i}"]`);
    if (!box) return;
    box.querySelector('.cert-sig-role').textContent = s.role;
    box.querySelector('.cert-sig-name').textContent = s.name;
    box.querySelector('.cert-sig-en').textContent = s.en;
    const space = box.querySelector('.cert-sig-space');
    if (s.sig) {
      let img = space.querySelector('img');
      if (!img) { img = document.createElement('img'); img.alt = ''; space.replaceChildren(img); }
      if (img.getAttribute('src') !== s.sig) img.src = s.sig;
    } else space.replaceChildren();
  });

  const refresh = () => {
    // shrink a long name to fit, then draw the pixel underline to the name's width
    let size = 46;
    nameEl.style.fontSize = `${size}px`;
    const max = nameEl.parentElement.clientWidth - 122;
    if (max > 0) while (nameEl.scrollWidth > max && size > 26) { size -= 1; nameEl.style.fontSize = `${size}px`; }
    const w = data.name ? nameEl.getBoundingClientRect().width / (sheetScale(sheet) || 1) : 420;
    const px = sheet.querySelector('.cert-px');
    const count = Math.max(14, Math.min(60, Math.round(w / 12)));
    px.replaceChildren(...Array.from({ length: count }, (_, i) => {
      const b = document.createElement('b');
      if (i === 1 || i === 3) b.className = 'r';
      b.style.opacity = Math.max(0.12, 1 - (i / count) * 0.95).toFixed(2);
      return b;
    }));
  };
  refresh();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  return refresh;
}

function sheetScale(sheet) {
  const r = sheet.getBoundingClientRect();
  return sheet.offsetWidth ? r.width / sheet.offsetWidth : 1;
}

// the pixel edge between the dark panel and the white page (fixed seed → identical every time)
function drawDissolve(host) {
  const H = 794, cell = 15, rows = Math.ceil(H / cell);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < 3; col++) {
      if (rnd() > [0.8, 0.42, 0.16][col]) continue;
      const b = document.createElement('b');
      b.style.top = `${r * cell + 2}px`;
      b.style.left = `${col * cell + 2}px`;
      const t = rnd();
      b.className = t < 0.08 ? 'r' : t < 0.2 ? 'e' : '';
      out.push(b);
    }
  }
  host.replaceChildren(...out);
}

/** Scale a fixed-size A4 sheet to fill its wrapper's width (screen only; print uses the real size). */
export function fitSheet(wrap) {
  const apply = () => {
    const sheet = wrap.querySelector('.cert');
    if (!sheet || !wrap.clientWidth) return;
    const s = wrap.clientWidth / sheet.offsetWidth;
    wrap.style.setProperty('--s', s);
    wrap.style.height = `${sheet.offsetHeight * s}px`;
  };
  apply();
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(wrap);
  else window.addEventListener('resize', apply);
  return apply;
}
