// Beit Lahia Tech — shared bits of the two small public forms: /trainer (trainers' skills) and /survey (what students want).
// trainers/{id}      → one trainer's registration (name, specialty, age, years of experience, topic, past venues).
// topicSurveys/{id}  → one student's answer (topics they'd like a workshop/course on).
// Topic keys are stored, not labels. The same keys are whitelisted in firestore.rules (isValidSurvey): change both together.

export const SURVEY_TOPICS = [
  { key: 'web', name: 'تطوير المواقع (ويب)' },
  { key: 'mobile', name: 'تطبيقات الموبايل' },
  { key: 'ai', name: 'الذكاء الاصطناعي' },
  { key: 'data', name: 'تحليل البيانات' },
  { key: 'security', name: 'أمن المعلومات' },
  { key: 'uiux', name: 'تصميم UI/UX' },
  { key: 'graphic', name: 'التصميم الجرافيكي' },
  { key: 'video', name: 'المونتاج والفيديو' },
  { key: 'programming', name: 'أساسيات البرمجة' },
  { key: 'database', name: 'قواعد البيانات' },
  { key: 'network', name: 'الشبكات' },
  { key: 'freelance', name: 'العمل الحر (Freelancing)' },
  { key: 'english', name: 'الإنجليزي التقني' },
  { key: 'career', name: 'السيرة الذاتية والمقابلات' },
  { key: 'soft', name: 'المهارات الشخصية' },
  { key: 'startup', name: 'ريادة الأعمال' },
];
export const topicName = (key) => SURVEY_TOPICS.find((t) => t.key === key)?.name || key;

/** what the student prefers */
export const SURVEY_FORMATS = { workshop: 'ورشة قصيرة', course: 'دورة طويلة', any: 'الاثنين عادي' };
export const SURVEY_STATUS = { tawjihi: 'توجيهي', student: 'طالب جامعة', graduate: 'خريج', other: 'غير ذلك' };
/** what a trainer can give */
export const TRAINER_MODES = { workshop: 'ورشة', course: 'دورة', both: 'ورشة ودورة' };

export const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const latinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6F0);

/** "059 123 4567" / "٠٥٩…" / "00970…" → "+970591234567"; '' if it can't be a phone number */
export function normalizePhone(v) {
  let s = latinDigits(v).replace(/[\s\-().]/g, '');
  if (!s) return '';
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (/^05\d{8}$/.test(s)) s = `+970${s.slice(1)}`;
  else if (/^5\d{8}$/.test(s)) s = `+970${s}`;
  else if (/^(970|972)\d{9}$/.test(s)) s = `+${s}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}
export const normalizeEmail = (v) => {
  const s = String(v ?? '').trim().toLowerCase();
  return s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : '';
};
export { latinDigits };

/**
 * Wire a simple form: `rules` = { fieldName: (value) => errorText|'' }. Fields validate on blur and live once they show an error.
 * Returns { validateField, validateAll, setError, fieldOf }.
 */
export function wireForm(form, rules) {
  const fieldOf = (name) => {
    const el = form.elements[name];
    return (el instanceof RadioNodeList ? el[0] : el).closest('.field');
  };
  const inputsOf = (name) => {
    const el = form.elements[name];
    return el instanceof RadioNodeList ? [...el] : [el];
  };
  const valueOf = (name) => {
    const el = form.elements[name];
    return el instanceof RadioNodeList ? el.value : el.value;
  };
  function setError(name, msg) {
    fieldOf(name).classList.toggle('has-error', !!msg);
    const errEl = document.getElementById(`${name}-error`);
    if (errEl) errEl.textContent = msg;
    inputsOf(name).forEach((i) => {
      i.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (errEl) i.setAttribute('aria-describedby', `${name}-error`);
    });
  }
  function validateField(name) {
    const msg = rules[name](valueOf(name));
    setError(name, msg);
    return !msg;
  }
  Object.keys(rules).forEach((name) => {
    inputsOf(name).forEach((i) => {
      const live = i.type === 'radio' || i.type === 'checkbox' || i.tagName === 'SELECT' ? 'change' : 'input';
      i.addEventListener('blur', () => { if ((i.type !== 'radio' && i.type !== 'checkbox' && i.value) || fieldOf(name).classList.contains('has-error')) validateField(name); });
      i.addEventListener(live, () => { if (fieldOf(name).classList.contains('has-error')) validateField(name); });
    });
  });
  /** validates everything, focuses the first bad field; true when all fine */
  function validateAll() {
    const bad = Object.keys(rules).filter((n) => !validateField(n));
    if (bad.length) inputsOf(bad[0])[0].focus();
    return bad.length === 0;
  }
  return { validateField, validateAll, setError, fieldOf };
}

/** a friendly Arabic message for a failed send */
export function friendlyError(err) {
  return !navigator.onLine
    ? 'ما في اتصال بالإنترنت. تأكد من الاتصال وجرّب كمان مرة.'
    : err && err.code === 'permission-denied'
      ? 'البيانات مش مقبولة أو الفورم مسكّر. حدّث الصفحة وجرّب.'
      : 'صار خطأ وما وصل الطلب. جرّب كمان مرة بعد شوي.';
}

/** the admin-editable bits of the two forms (site/forms): { surveyTopics, surveyOpen, surveyTitle, … } — {} when never saved */
export async function loadFormConfig(db, fs) {
  const snap = await fs.getDoc(fs.doc(db, 'site', 'forms')).catch(() => null);
  return snap && snap.exists() ? snap.data() : {};
}
/** title/lead overrides + the closed state; returns true when the form is open */
export function applyFormTexts(cfg, kind, form) {
  const set = (id, v) => { if (typeof v === 'string' && v.trim()) document.getElementById(id).textContent = v.trim(); };
  set('page-title', cfg[`${kind}Title`]);
  set('page-lead', cfg[`${kind}Lead`]);
  if (cfg[`${kind}Open`] === false) {
    set('closed-msg', cfg[`${kind}ClosedMessage`]);
    form.hidden = true;
    document.getElementById('closed').hidden = false;
    return false;
  }
  return true;
}
/** topics for the survey: the admin's list, else the defaults */
export const topicsFrom = (cfg) => (Array.isArray(cfg.surveyTopics) && cfg.surveyTopics.length
  ? cfg.surveyTopics.filter((t) => t && typeof t.key === 'string' && typeof t.name === 'string') : SURVEY_TOPICS);
