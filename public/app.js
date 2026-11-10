// Beit Lahia Tech — registration form → Cloud Firestore.
// The form works the moment the page paints; the (light) Firestore SDK loads afterwards, when the
// browser is idle or as soon as someone starts typing — whichever comes first.
import { getDbLite as getDb } from './firebase-init.js';
import { DEFAULT_SETTINGS } from './content-defaults.js';

const COLLECTION = 'members';

/* ---------- Form ---------- */
const form = document.getElementById('join-form');
const submitBtn = document.getElementById('submit-btn');
const statusEl = document.getElementById('form-status');
const successEl = document.getElementById('success');
const specialty = form.elements.specialty;
const otherWrap = document.getElementById('specialty-other-wrap');
const otherInput = form.elements.specialtyOther;
const notes = form.elements.notes;
const notesCount = document.getElementById('notes-count');

document.getElementById('year').textContent = new Date().getFullYear();

// Registration can be closed from /admin → show the message instead of the form.
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 200));
const afterLoad = (fn) => (document.readyState === 'complete' ? whenIdle(fn) : window.addEventListener('load', () => whenIdle(fn), { once: true }));
afterLoad(async () => {
  try {
    const { db, fs } = await getDb();
    const snap = await fs.getDoc(fs.doc(db, 'site', 'settings'));
    const s = { ...DEFAULT_SETTINGS, ...(snap.exists() ? snap.data() : {}) };
    // optional WhatsApp group link, shown on the success screen
    const group = typeof s.whatsappGroup === 'string' && /^https:\/\/\S+$/.test(s.whatsappGroup.trim()) ? s.whatsappGroup.trim() : '';
    if (group) {
      const btn = document.getElementById('group-btn');
      btn.href = group;
      btn.hidden = false;
      document.getElementById('success-text').textContent = 'صرت من أول أعضاء المجتمع. الخطوة الجاية: انضم لقروب الواتساب عشان توصلك كل الأخبار.';
    }
    if (s.registrationOpen === false) {
      document.getElementById('closed-msg').textContent = s.closedMessage || DEFAULT_SETTINGS.closedMessage;
      form.hidden = true;
      document.getElementById('closed').hidden = false;
    }
  } catch (e) {
    console.warn('[settings]', e); // keep the form usable if settings can't be read
  }
});

// someone started filling the form → fetch the SDK now so "send" is instant
form.addEventListener('focusin', () => { getDb().catch(() => {}); }, { once: true });

// under-18: a gentle note about telling their parents
const minorNote = document.getElementById('minor-note');
form.elements.age.addEventListener('input', () => {
  const n = Number(form.elements.age.value);
  minorNote.hidden = !(n >= 14 && n < 18);
});

specialty.addEventListener('change', () => {
  const isOther = specialty.value === '__other';
  otherWrap.hidden = !isOther;
  otherInput.required = isOther;
  if (isOther) otherInput.focus();
  else clearError('specialtyOther');
});

notes.addEventListener('input', () => { notesCount.textContent = notes.value.length; });

// طالب التوجيهي ما إله جامعة ولا سنوات خبرة: بنخفي الحقلين وبنغيّر سؤال التخصص
const isTawjihi = () => form.elements.status.value === 'tawjihi';
const tawjihiOnly = [document.getElementById('experience-wrap'), document.getElementById('university-wrap')];
const specialtyLabel = document.getElementById('specialty-label');

function applyStatus() {
  const t = isTawjihi();
  tawjihiOnly.forEach((w) => { w.hidden = t; });
  form.elements.experience.required = !t;
  form.elements.university.required = !t;
  if (t) { clearError('experience'); clearError('university'); }
  specialtyLabel.textContent = t ? 'التخصص اللي حابب تدرسه' : 'التخصص';
}
[...form.elements.status].forEach((r) => r.addEventListener('change', applyStatus));

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// "github.com/me" → "https://github.com/me"; returns '' if it isn't a usable web link
function normalizeUrl(v) {
  let s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.') || /\s/.test(s) || s.length > 300) return '';
    return u.href;
  } catch { return ''; }
}

// Arabic-Indic / Persian digits → 0-9 (Arabic keyboards type ٠٥٩…)
const latinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6F0);

// "059 123 4567" / "٠٥٩١٢٣٤٥٦٧" / "00970…" / "+972…" → "+970591234567"; '' if it can't be a phone number
function normalizePhone(v) {
  let s = latinDigits(v).replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (/^05\d{8}$/.test(s)) s = `+970${s.slice(1)}`; // Palestinian mobile (Jawwal / Ooredoo)
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
    if (!v) return 'اكتب اسمك';
    if (v.length < 2) return 'الاسم قصير، اكتبه كامل';
    if (v.length > 80) return 'الاسم طويل (80 حرف كحد أقصى)';
    return '';
  },
  whatsapp: (v) => (!String(v).trim() ? 'اكتب رقم الواتساب عشان نقدر نتواصل معك'
    : normalizePhone(v) ? '' : 'الرقم مش صحيح. مثال: 0591234567 أو ‎+970591234567'),
  email: (v) => (!String(v).trim() || normalizeEmail(v) ? '' : 'الإيميل مش صحيح. مثال: name@example.com'),
  status: (v) => (['tawjihi', 'student', 'graduate'].includes(v) ? '' : 'اختار حالتك: توجيهي، جامعة، أو خريج'),
  specialty: (v) => (v ? '' : 'اختار تخصصك'),
  specialtyOther: (v) => {
    if (specialty.value !== '__other') return '';
    v = clean(v);
    if (v.length < 2) return 'اكتب اسم تخصصك';
    return '';
  },
  age: (v) => {
    if (v === '' || v == null) return 'اكتب عمرك';
    const n = Number(v);
    if (!Number.isInteger(n)) return 'العمر لازم يكون رقم صحيح';
    if (n < 14 || n > 70) return 'العمر لازم يكون بين 14 و 70';
    return '';
  },
  experience: (v) => (isTawjihi() || ['none', 'lt1', '1-2', '3-5', '5+'].includes(v) ? '' : 'اختار سنوات خبرتك'),
  residence: (v) => (clean(v).length >= 2 ? '' : 'اكتب وين مقيم حالياً'),
  portfolio: (v) => (!String(v).trim() || normalizeUrl(v) ? '' : 'الرابط مش صحيح. مثال: github.com/اسمك'),
  university: (v) => (isTawjihi() || clean(v).length >= 2 ? '' : 'اكتب اسم الجامعة أو الكلية'),
  consent: () => (form.elements.consent.checked ? '' : 'لازم توافق على سياسة الخصوصية عشان نكمّل'),
};

function fieldOf(name) {
  const el = form.elements[name];
  const node = el instanceof RadioNodeList ? el[0] : el;
  return node.closest('.field');
}

function setError(name, msg) {
  const field = fieldOf(name);
  const errEl = document.getElementById(`${name}-error`);
  field.classList.toggle('has-error', !!msg);
  if (errEl) errEl.textContent = msg;
  const el = form.elements[name];
  const inputs = el instanceof RadioNodeList ? [...el] : [el];
  inputs.forEach((i) => {
    i.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (errEl) i.setAttribute('aria-describedby', `${name}-error`);
  });
}
const clearError = (name) => setError(name, '');

function validateField(name) {
  const msg = rules[name](form.elements[name].value);
  setError(name, msg);
  return !msg;
}

// validate on blur, re-validate live once a field has shown an error
Object.keys(rules).forEach((name) => {
  const el = form.elements[name];
  const inputs = el instanceof RadioNodeList ? [...el] : [el];
  inputs.forEach((i) => {
    i.addEventListener('blur', () => { if (i.value || fieldOf(name).classList.contains('has-error')) validateField(name); });
    i.addEventListener(i.tagName === 'SELECT' || i.type === 'radio' ? 'change' : 'input', () => {
      if (fieldOf(name).classList.contains('has-error')) validateField(name);
    });
  });
});

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle('is-loading', on);
  submitBtn.querySelector('.btn-label').textContent = on ? 'جاري الإرسال…' : 'أرسل التسجيل';
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

  // Honeypot: bots fill hidden fields — pretend success, store nothing.
  if (form.elements.website.value) { showSuccess(); return; }

  const f = form.elements;
  const data = {
    name: clean(f.name.value),
    whatsapp: normalizePhone(f.whatsapp.value),
    status: f.status.value,
    specialty: specialty.value === '__other' ? clean(otherInput.value) : specialty.value,
    age: Number(f.age.value),
    residence: clean(f.residence.value),
    notes: notes.value.trim().slice(0, 1000),
    consent: true,
    source: 'web',
  };
  if (!isTawjihi()) {
    data.experience = f.experience.value;
    data.university = clean(f.university.value);
  }
  const portfolio = normalizeUrl(f.portfolio.value);
  if (portfolio) data.portfolio = portfolio;
  const email = normalizeEmail(f.email.value);
  if (email) data.email = email;

  setLoading(true);
  try {
    const { db, fs } = await getDb();
    await fs.addDoc(fs.collection(db, COLLECTION), { ...data, createdAt: fs.serverTimestamp() });
    showSuccess();
  } catch (err) {
    console.error('[register]', err);
    statusEl.textContent = !navigator.onLine
      ? 'ما في اتصال بالإنترنت. تأكد من الاتصال وجرّب كمان مرة.'
      : err && err.code === 'permission-denied'
        ? 'التسجيل مسكّر حالياً أو البيانات مش مقبولة. حدّث الصفحة وجرّب.'
        : 'صار خطأ وما وصل التسجيل. جرّب كمان مرة بعد شوي.';
    statusEl.classList.add('err');
  } finally {
    setLoading(false);
  }
});

function showSuccess() {
  form.hidden = true;
  successEl.hidden = false;
  successEl.focus();
  successEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

document.getElementById('again-btn').addEventListener('click', () => {
  form.reset();
  Object.keys(rules).forEach(clearError);
  otherWrap.hidden = true;
  otherInput.required = false;
  minorNote.hidden = true;
  applyStatus();
  notesCount.textContent = '0';
  successEl.hidden = true;
  form.hidden = false;
  form.elements.name.focus();
});
