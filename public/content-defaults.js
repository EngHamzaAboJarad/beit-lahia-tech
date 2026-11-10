import { iconSvg } from './icons.js';

// النصوص الافتراضية للاندج بيج. لوحة الإدارة بتحفظ نسخة معدّلة منها في Firestore (site/content).
// لازم تضل مطابقة للنص الموجود في index.html (اللي بيظهر قبل ما تحمّل البيانات أو بدون JavaScript).
export const DEFAULT_CONTENT = {
  hero: {
    eyebrow: 'مبادرة جديدة — التسجيل مفتوح',
    titleLead: 'معاً نبني جيلاً تقنياً',
    titleAccent: 'من بيت لاهيا',
    lead: 'مجتمع تقني يجمع أبناء بيت لاهيا من المبرمجين وطلاب وخريجي التخصصات التقنية، لنبني شبكة تواصل قوية، نتبادل الخبرات، ونجهّز بعض لسوق العمل.',
  },
  about: {
    kicker: 'Beit Lahia Tech Community',
    title: 'من نحن',
    text: 'نحن مجتمع بيت لاهيا التقني، مبادرة شبابية من قلب بيت لاهيا، هدفها سد الفجوة التقنية في المدينة وبناء جيل تقني قادر على التعلم والعمل والإنتاج.',
    text2: 'بدأنا بـ 16 عضو مؤسس، ونعمل على توسيع المجتمع ليشمل كل تقني في بيت لاهيا، من المبتدئ للمحترف، في مجالات البرمجة، الذكاء الاصطناعي، الشبكات، الأمن السيبراني، والتصميم.',
    statNumber: '16',
    statLabel: 'عضو مؤسس',
    visionTitle: 'رؤيتنا',
    vision: 'أن تصبح بيت لاهيا مرجعاً تقنياً في غزة، وأن لا يضطر أي طالب فيها أن يبدأ طريقه التقني وحده.',
  },
  goalsHead: {
    title: 'أهدافنا',
    text: 'ستة محاور بنشتغل عليها مع بعض، من أول خطوة بالتوجيهي لحد أول شغل.',
  },
  goals: [
    { title: 'التواصل', text: 'شبكة قوية تجمع تقنيي بيت لاهيا في مكان واحد، وين ما كانوا اليوم.' },
    { title: 'تبادل الخبرات', text: 'نتعلم من تجارب بعض، ونختصر الطريق على الجدد بالمجال.' },
    { title: 'توجيه طلاب التوجيهي', text: 'إرشاد أكاديمي للحابين يدخلوا التقنية: شو التخصصات، وشو الفرق بينها، وكيف تختار صح.' },
    { title: 'دعم الجامعيين', text: 'متابعة طلاب السنوات الأولى ومساعدتهم يبدأوا صح ويبنوا مهارات بيطلبها السوق.' },
    { title: 'فريق بيت لاهيا', text: 'فريق تقني متكامل بيحمل اسم البلد، وبيشتغل على مشاريع حقيقية بتدخل البورتفوليو.' },
    { title: 'فرص ودورات', text: 'تشبيك مع جهات داعمة لدورات وتدريب وفرص عمل، ومنها الشغل عن بُعد.' },
  ],
  journeyHead: {
    title: 'لمين المجتمع؟ لكل مرحلة من رحلتك',
    text: 'من أول ما تفكر بالتقنية بالتوجيهي، لحد ما تلاقي شغلك. بنمشي معك كل خطوة.',
  },
  journey: [
    { title: 'طالب توجيهي', text: 'تتعرف على التخصصات التقنية وتختار عن معرفة، مش عن سماع.' },
    { title: 'طالب جامعة', text: 'تبني مهاراتك صح من أول سنة، مع متابعة من ناس سبقوك.' },
    { title: 'خريج', text: 'تشتغل مع فريق بيت لاهيا على مشاريع حقيقية بتقوّي البورتفوليو.' },
    { title: 'سوق العمل', text: 'فرص ودورات وشغل عن بُعد، وبترجع تشارك خبرتك مع اللي بعدك.' },
  ],
  eventsHead: {
    title: 'فعاليات وإعلانات',
    text: 'آخر الأخبار والأنشطة بالمجتمع.',
  },
  galleryHead: {
    title: 'معرض الصور',
    text: 'لحظات من لقاءات وأنشطة المجتمع.',
  },
  membersHead: {
    title: 'أعضاء المجتمع',
    text: 'وجوه من مجتمعنا: ناس بيتعلموا، وبيشتغلوا، وبيساعدوا اللي بعدهم.',
  },
  fieldsHead: {
    title: 'مجالات بنجمعها',
    text: 'لما تسجّل مجالك بنعرف شو الخبرات الموجودة، وعلى أساسها بنبني المجموعات والفرق.',
  },
  fields: [
    'تطوير الواجهات', 'تطوير الخوادم', 'تطبيقات الموبايل', 'ذكاء اصطناعي وبيانات', 'تصميم UI/UX',
    'أمن المعلومات', 'الشبكات', 'DevOps وسحابة', 'اختبار البرمجيات', 'وغيرها…',
  ],
  cta: {
    title: 'إنت من بيت لاهيا وبتدرس أو بتشتغل بالتقنية؟',
    text: 'المجتمع لسا بأوله. سجّل اليوم وكون من الأعضاء المؤسسين.',
    button: 'عبّي النموذج',
  },
  faq: [
    { q: 'المجتمع جديد؟ شو بصير بعد ما أسجّل؟', a: 'آه، إحنا بالبداية. بنجمع بيانات الأعضاء عشان نعرف مين معنا وشو التخصصات والخبرات الموجودة، وبعدها بنتواصل معك لما نطلق المجموعات والأنشطة.' },
    { q: 'لازم أكون مقيم ببيت لاهيا؟', a: 'المجتمع لأبناء بيت لاهيا، سواء مقيمين فيها أو نازحين أو برا البلد. لهيك بنسأل «وين مقيم حالياً».' },
    { q: 'أنا لسا ببدأ، بنفعني المجتمع؟', a: 'أكيد. المجتمع لكل المستويات، والمبتدئين من أكثر الناس اللي بدنا نساعدهم.' },
    { q: 'بقدر أساعد أو أشارك بخبرتي؟', a: 'هاد اللي بدنا ياه. اكتب بخانة الملاحظات بالنموذج كيف حابب تساعد: توجيه، تدريب، مراجعة مشاريع، أو تشبيك مع جهات.' },
    { q: 'وين بتروح بياناتي؟', a: 'بتنحفظ بقاعدة بيانات محمية ما بيقدر يقرأها غير فريق إدارة المجتمع، وبتستخدم بس للتنظيم والتواصل.' },
  ],
};

export const DEFAULT_SETTINGS = {
  registrationOpen: true,
  showMembers: false, // the «أعضاء المجتمع» section stays hidden until /admin › الأعضاء turns it on
  closedMessage: 'التسجيل مسكّر حالياً. تابعنا، رح نفتحه قريباً.',
  whatsappGroup: '', // https://chat.whatsapp.com/… — shown after a successful registration
  contactWhatsapp: '+972599341871', // "contact us" in the footer and on /privacy (used whenever /admin leaves it empty)
  contactEmail: '', // shown in the footer and on /privacy
  // https:// links (Facebook, Instagram…) shown in the footer (used whenever /admin leaves them empty)
  socialLinks: ['https://www.facebook.com/profile.php?id=61596526973886'],
};

export const isEmail = (v) => typeof v === 'string' && v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

/** Platforms the footer knows (order = order in /admin and in the footer). `example` is the input placeholder. */
export const SOCIAL_PLATFORMS = [
  { key: 'facebook', name: 'فيسبوك', domain: 'facebook.com', re: /(^|\.)(facebook|fb)\.com$/, example: 'https://facebook.com/…' },
  { key: 'instagram', name: 'إنستغرام', domain: 'instagram.com', re: /(^|\.)instagram\.com$/, example: 'https://instagram.com/…' },
  { key: 'linkedin', name: 'لينكدإن', domain: 'linkedin.com', re: /(^|\.)linkedin\.com$/, example: 'https://linkedin.com/company/…' },
  { key: 'x', name: 'X (تويتر)', domain: 'x.com', re: /(^|\.)(x|twitter)\.com$/, example: 'https://x.com/…' },
  { key: 'telegram', name: 'تيليغرام', domain: 't.me', re: /(^|\.)(t\.me|telegram\.me)$/, example: 'https://t.me/…' },
  { key: 'youtube', name: 'يوتيوب', domain: 'youtube.com', re: /(^|\.)(youtube\.com|youtu\.be)$/, example: 'https://youtube.com/@…' },
  { key: 'tiktok', name: 'تيك توك', domain: 'tiktok.com', re: /(^|\.)tiktok\.com$/, example: 'https://tiktok.com/@…' },
  { key: 'github', name: 'GitHub', domain: 'github.com', re: /(^|\.)github\.com$/, example: 'https://github.com/…' },
  { key: 'whatsapp', name: 'قناة الواتساب', domain: 'whatsapp.com', re: /(^|\.)(whatsapp\.com|wa\.me)$/, example: 'https://whatsapp.com/channel/…' },
];
export function socialInfo(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    const hit = SOCIAL_PLATFORMS.find((p) => p.re.test(host));
    return hit ? { name: hit.name, icon: hit.key } : { name: host, icon: 'link' };
  } catch { return null; }
}
export const socialName = (url) => socialInfo(url)?.name || '';

/** The public ways to reach the community, from /admin › الإعدادات (only well-formed values). */
export function contactLinks(s) {
  const out = [];
  s = s || {};
  const wa = typeof s.contactWhatsapp === 'string' ? s.contactWhatsapp : DEFAULT_SETTINGS.contactWhatsapp; // never saved → default
  if (/^\+\d{8,15}$/.test(wa)) {
    out.push({ kind: 'whatsapp', icon: 'whatsapp', href: `https://wa.me/${wa.slice(1)}`, label: 'تواصل معنا على الواتساب' });
  }
  if (isEmail(s.contactEmail)) out.push({ kind: 'email', icon: 'email', href: `mailto:${s.contactEmail}`, label: `راسلنا: ${s.contactEmail}` });
  const social = Array.isArray(s.socialLinks) ? s.socialLinks : DEFAULT_SETTINGS.socialLinks; // never saved → default
  social.slice(0, 12).forEach((u) => {
    const href = safeUrl(u);
    const info = href && socialInfo(href);
    if (info) out.push({ kind: 'social', icon: info.icon, href, label: info.name });
  });
  return out;
}

/** Fill the footer's icon row (#footer-social) with the contact and social links. */
export function renderFooterLinks(row, s) {
  if (!row) return;
  const links = contactLinks(s);
  row.replaceChildren(...links.map((l) => {
    const a = document.createElement('a');
    a.className = `social-btn social-${l.icon}`;
    a.href = l.href;
    a.setAttribute('aria-label', l.label);
    a.title = l.label;
    if (l.kind !== 'email') { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    a.append(iconSvg(l.icon));
    return a;
  }));
  const box = row.closest('.footer-connect');
  if (box) box.hidden = !links.length;
}

export const EVENT_TYPES = { event: 'فعالية', course: 'دورة', announcement: 'إعلان' };

/** Deep-merge saved content over the defaults, so new keys always have a value. */
export function withDefaults(saved, defaults = DEFAULT_CONTENT) {
  if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults;
  if (defaults && typeof defaults === 'object') {
    const out = {};
    for (const k of Object.keys(defaults)) out[k] = withDefaults(saved ? saved[k] : undefined, defaults[k]);
    return out;
  }
  return typeof saved === typeof defaults ? saved : defaults;
}

/** Only http(s) links are ever rendered. */
export const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : '');
