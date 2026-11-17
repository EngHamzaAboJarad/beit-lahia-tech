// Beit Lahia Tech — /trainer: a trainer's registration → trainers/{id}.
import { getDbLite as getDb } from './firebase-init.js';
import { DEFAULT_SETTINGS, renderFooterLinks } from './content-defaults.js';
import { clean, normalizePhone, normalizeEmail, wireForm, friendlyError, loadFormConfig, applyFormTexts } from './forms-shared.js';

const $ = (id) => document.getElementById(id);
const form = $('trainer-form');
const submitBtn = $('submit-btn');
const statusEl = $('form-status');

$('year').textContent = new Date().getFullYear();
renderFooterLinks($('footer-social'), null);
getDb().then(async ({ db, fs }) => {
  const [snap, cfg] = await Promise.all([fs.getDoc(fs.doc(db, 'site', 'settings')).catch(() => null), loadFormConfig(db, fs)]);
  if (snap && snap.exists()) renderFooterLinks($('footer-social'), { ...DEFAULT_SETTINGS, ...snap.data() });
  applyFormTexts(cfg, 'trainer', form);
}).catch(() => {});
form.addEventListener('focusin', () => { getDb().catch(() => {}); }, { once: true });

const counter = (input, out) => input.addEventListener('input', () => { $(out).textContent = input.value.length; });
counter(form.elements.topic, 'topic-count');
counter(form.elements.venues, 'venues-count');

const intIn = (v, min, max) => { const n = Number(v); return v !== '' && Number.isInteger(n) && n >= min && n <= max; };
const rules = {
  name: (v) => (clean(v).length < 2 ? 'اكتب اسمك الكامل' : clean(v).length > 80 ? 'الاسم طويل (80 حرف كحد أقصى)' : ''),
  whatsapp: (v) => (!String(v).trim() ? 'اكتب رقم الواتساب عشان نقدر نتواصل معك' : normalizePhone(v) ? '' : 'الرقم مش صحيح. مثال: 0591234567'),
  email: (v) => (!String(v).trim() || normalizeEmail(v) ? '' : 'الإيميل مش صحيح. مثال: name@example.com'),
  specialty: (v) => (clean(v).length < 2 ? 'اكتب تخصصك' : ''),
  age: (v) => (intIn(v, 16, 80) ? '' : 'اكتب عمرك بالأرقام (بين 16 و 80)'),
  years: (v) => (intIn(v, 0, 60) ? '' : 'اكتب سنوات الخبرة بالأرقام (0 إذا لسا ببدأ)'),
  mode: (v) => (['workshop', 'course', 'both'].includes(v) ? '' : 'اختار: ورشة، دورة، أو الاثنين'),
  topic: (v) => (clean(v).length < 2 ? 'اكتب اسم الدورة أو مجال الورشة' : ''),
  consent: () => (form.elements.consent.checked ? '' : 'لازم توافق على سياسة الخصوصية عشان نكمّل'),
};
const { validateAll, setError } = wireForm(form, rules);

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle('is-loading', on);
  submitBtn.querySelector('.btn-label').textContent = on ? 'جاري الإرسال…' : 'أرسل بياناتي';
}

function showSuccess() {
  form.hidden = true;
  $('success').hidden = false;
  $('success').focus();
  $('success').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  statusEl.textContent = '';
  statusEl.className = 'form-status';
  if (!validateAll()) {
    statusEl.textContent = 'في حقول بحاجة تعديل، شوفها فوق.';
    statusEl.classList.add('err');
    return;
  }
  if (form.elements.website.value) { showSuccess(); return; } // honeypot
  const f = form.elements;
  const data = {
    name: clean(f.name.value),
    whatsapp: normalizePhone(f.whatsapp.value),
    specialty: clean(f.specialty.value),
    age: Number(f.age.value),
    years: Number(f.years.value),
    mode: f.mode.value,
    topic: f.topic.value.trim().slice(0, 300),
    consent: true,
    source: 'web',
  };
  const email = normalizeEmail(f.email.value);
  if (email) data.email = email;
  const venues = f.venues.value.trim().slice(0, 500);
  if (venues) data.venues = venues;

  setLoading(true);
  try {
    const { db, fs } = await getDb();
    await fs.addDoc(fs.collection(db, 'trainers'), { ...data, createdAt: fs.serverTimestamp() });
    showSuccess();
  } catch (err) {
    console.error('[trainer]', err);
    statusEl.textContent = friendlyError(err);
    statusEl.classList.add('err');
  } finally { setLoading(false); }
});

$('again-btn').addEventListener('click', () => {
  form.reset();
  Object.keys(rules).forEach((n) => setError(n, ''));
  $('topic-count').textContent = '0';
  $('venues-count').textContent = '0';
  $('success').hidden = true;
  form.hidden = false;
  form.elements.name.focus();
});
