// Beit Lahia Tech — public certificate page.
// /certificate?id=<certificates doc id> → that person's certificate (template from site/workshop).
// /certificate (no id) → a blank certificate for printing and filling in by hand.
import { getDbLite } from './firebase-init.js';
import { mergeWorkshop, renderCertificate, fitSheet } from './workshop-shared.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id') || '';

function missing(msg) {
  $('loading').hidden = true;
  if (msg) $('missing-msg').textContent = msg;
  $('missing').hidden = false;
}

try {
  const { db, fs } = await getDbLite();
  const validId = /^[A-Za-z0-9]{6,40}$/.test(id);
  const [wsSnap, certSnap] = await Promise.all([
    fs.getDoc(fs.doc(db, 'site', 'workshop')),
    validId ? fs.getDoc(fs.doc(db, 'certificates', id)) : Promise.resolve(null),
  ]);
  const ws = mergeWorkshop(wsSnap.exists() ? wsSnap.data() : null);

  if (id && !(certSnap && certSnap.exists())) {
    missing();
  } else {
    const cert = certSnap ? certSnap.data() : {};
    $('loading').hidden = true;
    $('cert-view').hidden = false;
    const fit = $('cert-fit');
    const refresh = renderCertificate(fit, ws, { name: cert.name, no: cert.no, date: cert.date });
    const refit = fitSheet(fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { refresh(); refit(); });

    if (cert.name) {
      document.title = `شهادة إنجاز — ${cert.name} | بيت لاهيا تيك`;
      $('verify-text').replaceChildren(
        'شهادة صادرة من ', Object.assign(document.createElement('b'), { textContent: 'بيت لاهيا تيك' }),
        ` باسم ${cert.name}، رقم `, Object.assign(document.createElement('bdi'), { textContent: cert.no || '' }), '.',
      );
      $('copy-btn').hidden = false;
    } else {
      $('verify').classList.add('is-blank');
      $('verify-text').textContent = 'نسخة فارغة من الشهادة، للطباعة والكتابة باليد.';
    }
    $('print-btn').hidden = false;
  }
} catch (e) {
  console.error('[certificate]', e);
  missing(navigator.onLine ? 'صار خطأ بتحميل الشهادة. حدّث الصفحة وجرّب كمان مرة.' : 'ما في اتصال بالإنترنت.');
}

$('print-btn').addEventListener('click', () => window.print());
$('copy-btn').addEventListener('click', async () => {
  const btn = $('copy-btn');
  try { await navigator.clipboard.writeText(location.href); btn.textContent = 'انسخ ✓'; } catch { btn.textContent = 'انسخه من شريط العنوان'; }
  setTimeout(() => { btn.textContent = 'انسخ الرابط'; }, 2000);
});
