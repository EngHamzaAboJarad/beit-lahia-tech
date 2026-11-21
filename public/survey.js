// Beit Lahia Tech — /survey: which topics students want a workshop/course on → topicSurveys/{id}.
import { getDbLite as getDb } from './firebase-init.js';
import { siteData } from './site-data.js';
import { DEFAULT_SETTINGS, renderFooterLinks } from './content-defaults.js';
import { SURVEY_TOPICS, clean, normalizePhone, wireForm, friendlyError, loadFormConfig, applyFormTexts, topicsFrom } from './forms-shared.js';

const $ = (id) => document.getElementById(id);
const form = $('survey-form');
const submitBtn = $('submit-btn');
const statusEl = $('form-status');

$('year').textContent = new Date().getFullYear();
renderFooterLinks($('footer-social'), null);
// settings + the form's texts: the Worker's edge cache (site-data.js), Firestore if it can't answer
siteData('settings').catch(() => getDb().then(async ({ db, fs }) => {
  const [snap, forms] = await Promise.all([fs.getDoc(fs.doc(db, 'site', 'settings')).catch(() => null), loadFormConfig(db, fs)]);
  return { settings: snap && snap.exists() ? snap.data() : null, forms };
})).then(({ settings, forms }) => {
  const cfg = forms || {};
  if (settings) renderFooterLinks($('footer-social'), { ...DEFAULT_SETTINGS, ...settings });
  if (applyFormTexts(cfg, 'survey', form)) renderTopics(topicsFrom(cfg));
}).catch(() => {});
form.addEventListener('focusin', () => { getDb().catch(() => {}); }, { once: true });

function renderTopics(list) {
  const was = new Set([...form.querySelectorAll('input[name="topics"]:checked')].map((b) => b.value));
  $('topic-chips').replaceChildren(...list.map((t) => {
  const label = document.createElement('label'); label.className = 'tool-chip';
  const input = Object.assign(document.createElement('input'), { type: 'checkbox', name: 'topics', value: t.key });
  const span = document.createElement('span'); span.textContent = t.name;
  input.checked = was.has(t.key);
  label.append(input, span);
  return label;
  }));
}
renderTopics(SURVEY_TOPICS);
const picked = () => [...form.querySelectorAll('input[name="topics"]:checked')].map((b) => b.value);

// the consent box only matters when they leave a name or number
const wantsConsent = () => !!(clean(form.elements.name.value) || form.elements.whatsapp.value.trim());
const syncConsent = () => { $('consent-wrap').hidden = !wantsConsent(); if ($('consent-wrap').hidden) form.elements.consent.checked = false; };
['name', 'whatsapp'].forEach((n) => form.elements[n].addEventListener('input', syncConsent));

const rules = {
  format: (v) => (['workshop', 'course', 'any'].includes(v) ? '' : 'اختار: ورشة، دورة، أو الاثنين'),
  name: (v) => (clean(v).length > 80 ? 'الاسم طويل (80 حرف كحد أقصى)' : ''),
  whatsapp: (v) => (!String(v).trim() || normalizePhone(v) ? '' : 'الرقم مش صحيح. مثال: 0591234567'),
  consent: () => (!wantsConsent() || form.elements.consent.checked ? '' : 'لازم توافق عشان نحفظ اسمك ورقمك'),
};
const { validateAll, setError, fieldOf } = wireForm(form, rules);

// topics aren't a named form control, so they're checked by hand
const topicsField = form.querySelector('#topic-chips').closest('.field');
function topicsError() {
  const bad = picked().length === 0 && !clean(form.elements.other.value);
  topicsField.classList.toggle('has-error', bad);
  $('topics-error').textContent = bad ? 'اختار موضوع واحد على الأقل، أو اكتب موضوعك' : '';
  return !bad;
}
form.addEventListener('change', (e) => { if (e.target.name === 'topics' && topicsField.classList.contains('has-error')) topicsError(); });
form.elements.other.addEventListener('input', () => { if (topicsField.classList.contains('has-error')) topicsError(); });

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.classList.toggle('is-loading', on);
  submitBtn.querySelector('.btn-label').textContent = on ? 'جاري الإرسال…' : 'أرسل رأيي';
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
  const topicsOk = topicsError();
  const restOk = validateAll();
  if (!topicsOk || !restOk) {
    if (!topicsOk) form.querySelector('input[name="topics"]').focus();
    statusEl.textContent = 'في حقول بحاجة تعديل، شوفها فوق.';
    statusEl.classList.add('err');
    return;
  }
  if (form.elements.website.value) { showSuccess(); return; } // honeypot

  const f = form.elements;
  const data = { topics: picked(), format: f.format.value, source: 'web' };
  const other = clean(f.other.value).slice(0, 200);
  if (other) data.other = other;
  if (f.status.value) data.status = f.status.value;
  const name = clean(f.name.value);
  const wa = normalizePhone(f.whatsapp.value);
  if (name) data.name = name;
  if (wa) data.whatsapp = wa;
  if (name || wa) data.consent = true;

  setLoading(true);
  try {
    const { db, fs } = await getDb();
    await fs.addDoc(fs.collection(db, 'topicSurveys'), { ...data, createdAt: fs.serverTimestamp() });
    showSuccess();
  } catch (err) {
    console.error('[survey]', err);
    statusEl.textContent = friendlyError(err);
    statusEl.classList.add('err');
  } finally { setLoading(false); }
});

$('again-btn').addEventListener('click', () => {
  form.reset();
  Object.keys(rules).forEach((n) => setError(n, ''));
  topicsField.classList.remove('has-error');
  $('topics-error').textContent = '';
  syncConsent();
  $('success').hidden = true;
  form.hidden = false;
});
