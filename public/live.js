// Beit Lahia Tech — /live?w=<workshop id>[&c=<pass code>][#name]: the link posted in an online workshop's group.
// The registrant is recognised (pass code from the link or remembered on this phone, else their WhatsApp number →
// liveKeys), checks in (liveJoins/{code} + the registration marked attended, both checked by the rules: a real
// registration of this online workshop, on its day), and only then gets the Zoom / Meet link from the social
// worker, which keeps it out of Firestore. Opening it again later (dropped call) goes straight back in.
import { getDbLite } from './firebase-init.js';
import { mergeWorkshop, arDate, placeText, accentAI } from './workshop-shared.js';
import { waDigits } from './checkin-shared.js';

const $ = (id) => document.getElementById(id);
const WORKER = (() => { try { return localStorage.getItem('blt-social-worker') || ''; } catch { return ''; } })() || 'https://social.beitlahia.tech';
const WID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const CODE_RE = /^[A-Za-z0-9]{12,40}$/;
const STATES = ['st-known', 'st-phone', 'st-busy', 'st-done', 'st-note'];

const params = new URLSearchParams(location.search);
const wid = WID_RE.test(params.get('w') || '') ? params.get('w') : '';
const passKey = `blt-pass:${wid}`;
const remember = (v) => { try { if (v) localStorage.setItem(passKey, JSON.stringify(v)); else localStorage.removeItem(passKey); } catch { /* private mode */ } };
const remembered = () => { try { const v = JSON.parse(localStorage.getItem(passKey) || 'null'); return v && CODE_RE.test(v.c) ? v : null; } catch { return null; } };

let hashName = '';
try { hashName = decodeURIComponent(location.hash.slice(1)).replace(/\s+/g, ' ').trim().slice(0, 80); } catch { hashName = ''; }
// a pass code in the link wins (and is kept for next time), else the one this phone remembers
let pass = CODE_RE.test(params.get('c') || '') ? { c: params.get('c'), n: hashName } : remembered();
if (pass && params.get('c')) remember(pass);

function show(id) { $('loading').hidden = true; $('live-view').hidden = false; STATES.forEach((s) => { $(s).hidden = s !== id; }); }
function note(title, text) { $('note-title').textContent = title; $('note-text').textContent = text; show('st-note'); }

let ws = null;
let times = null; // { from, to } ms: the admin's open/close times (liveFrom / liveTo), else null
if (!wid) { $('loading').hidden = true; $('missing').hidden = false; }
else start();

async function start() {
  try {
    const { db, fs } = await getDbLite();
    const snap = await fs.getDoc(fs.doc(db, 'workshops', wid));
    if (snap.exists()) {
      const raw = snap.data();
      ws = mergeWorkshop(raw);
      const ms = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
      if (ms(raw.liveFrom) && ms(raw.liveTo)) times = { from: ms(raw.liveFrom), to: ms(raw.liveTo) };
    }
  } catch { /* offline, or not public */ }
  if (!ws) { $('loading').hidden = true; $('missing').hidden = false; return; }
  renderHead();
  if (ws.mode !== 'online') { note('هاي الورشة وجاهية', 'الحضور بيتسجّل عالباب: ورجّي بطاقة الدخول (رمز الـ QR) للفريق يوم الورشة.'); return; }
  const win = times || liveWindow(ws.date);
  if (!win) { note('موعد الورشة لسا ما تحدّد', 'الدخول بيفتح يوم الورشة. تابع الجروب عشان تعرف الموعد.'); return; }
  if (Date.now() < win.from) {
    note('الدخول لسا ما فتح', times
      ? `الرابط بيفتح ${arDate(ws.date)} الساعة ${clock(times.from)} لـ ${clock(times.to)} (بتوقيت غزة). ارجع لهالرابط وقت اللقاء.`
      : `الرابط بيشتغل يوم الورشة (${arDate(ws.date)}${ws.time ? ` · ${ws.time}` : ''}). ارجع لهالرابط وقت اللقاء.`);
    return;
  }
  if (Date.now() >= win.to) { note('اللقاء خلص', 'الدخول عبر هالرابط كان وقت الورشة بس. إذا حضرت وما انسجّل حضورك، تواصل مع الفريق بالجروب.'); return; }
  if (pass) showKnown(); else show('st-phone');
}

const clock = (ms) => new Intl.DateTimeFormat('ar-u-nu-latn', { timeZone: 'Asia/Gaza', hour: 'numeric', minute: '2-digit' }).format(new Date(ms));

/** the workshop's day in Gaza, with a margin: the same window the Firestore rules allow */
function liveWindow(date) {
  const p = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
  if (!p) return null;
  const day = Date.UTC(+p[1], +p[2] - 1, +p[3]);
  return { from: day - 6 * 3600e3, to: day + 28 * 3600e3 };
}

function renderHead() {
  accentAI($('live-ws'), ws.title);
  if (ws.titleAr) { $('live-ws-ar').textContent = ws.titleAr; $('live-ws-ar').hidden = false; }
  const bits = [ws.date ? arDate(ws.date) : '', ws.time, placeText(ws)].filter(Boolean);
  $('live-meta').replaceChildren(...bits.map((b) => Object.assign(document.createElement('span'), { textContent: b })));
  document.title = `ادخل اللقاء — ${ws.titleAr || ws.title} | بيت لاهيا تيك`;
}

function showKnown() {
  const first = String(pass.n || '').split(' ')[0];
  $('known-hi').textContent = first ? `أهلاً ${first} 👋` : 'أهلاً 👋';
  show('st-known');
}

$('known-go').addEventListener('click', () => enter(pass.c, pass.n));
$('known-other').addEventListener('click', () => { pass = null; remember(null); show('st-phone'); $('phone').focus(); });

$('st-phone').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('phone-err');
  err.hidden = true;
  const digits = waDigits($('phone').value);
  if (!digits) { err.textContent = 'اكتب رقم واتساب صحيح، زي 0599123456.'; err.hidden = false; $('phone').focus(); return; }
  $('phone-go').disabled = true;
  try {
    const code = await findByPhone(digits);
    if (!code) {
      err.textContent = 'ما لقينا هالرقم بين المسجّلين بهاي الورشة. اكتب الرقم اللي سجّلت فيه، أو افتح بطاقة الدخول اللي وصلتك بعد التسجيل.';
      err.hidden = false;
      return;
    }
    await enter(code, '');
  } catch {
    err.textContent = navigator.onLine ? 'صار خطأ، جرّب كمان مرة.' : 'ما في اتصال بالإنترنت.';
    err.hidden = false;
  } finally { $('phone-go').disabled = false; }
});

/** liveKeys/{wid}_{digits} → the pass code; tries +970 and +972 for a Gaza number */
async function findByPhone(digits) {
  const { db, fs } = await getDbLite();
  const alt = /^97[02]5\d{8}$/.test(digits) ? `${digits.startsWith('970') ? '972' : '970'}${digits.slice(3)}` : '';
  for (const d of [digits, alt].filter(Boolean)) {
    const snap = await fs.getDoc(fs.doc(db, 'liveKeys', `${wid}_${d}`));
    const id = snap.exists() ? String(snap.data().id || '') : '';
    if (CODE_RE.test(id)) return id;
  }
  return '';
}

async function enter(code, name) {
  show('st-busy');
  $('busy-text').textContent = 'لحظة، عم نسجّل حضورك…';
  try {
    await checkIn(code);
  } catch (e) {
    console.error('[live check-in]', e);
    if (e && e.code === 'permission-denied') {
      remember(null);
      note('ما قدرنا نسجّل حضورك', 'تأكد إنك فاتح رابط ورشتك نفسها ويوم الورشة. إذا المشكلة ضلّت، تواصل مع الفريق بالجروب.');
    } else note('ما وصلنا للسيرفر', navigator.onLine ? 'صار خطأ بالاتصال. حدّث الصفحة وجرّب كمان مرة.' : 'ما في اتصال بالإنترنت. اتصل وجرّب كمان مرة.');
    return;
  }
  pass = { c: code, n: name || (pass && pass.c === code ? pass.n : '') };
  remember(pass);
  await openMeeting(code);
}

/** liveJoins/{code} + the registration marked attended (one write); if an admin already marked it, the join alone */
async function checkIn(code) {
  const { db, fs } = await getDbLite();
  const joinRef = fs.doc(db, 'liveJoins', code);
  const joined = await fs.getDoc(joinRef).then((s) => s.exists()).catch(() => false);
  if (joined) return;
  const join = { workshopId: wid, at: fs.serverTimestamp() };
  try {
    const batch = fs.writeBatch(db);
    batch.set(joinRef, join);
    batch.update(fs.doc(db, 'workshopRegs', code), { attended: true, attendedAt: fs.serverTimestamp(), attendedBy: 'live' });
    await batch.commit();
  } catch (e) {
    if (!e || e.code !== 'permission-denied') throw e;
    await fs.setDoc(joinRef, join); // still refused → not a registration of this workshop / not its day
  }
}

async function openMeeting(code) {
  show('st-done');
  $('done-title').textContent = 'انسجّل حضورك';
  $('done-text').textContent = 'هلأ بنحوّلك على اللقاء…';
  $('done-go').hidden = true;
  $('done-retry').hidden = true;
  let link = '';
  let msg = '';
  try {
    const res = await fetch(`${WORKER}/live/${encodeURIComponent(wid)}/enter`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && /^https:\/\//.test(data.link || '')) link = data.link;
    else msg = data.error || '';
  } catch { msg = ''; }
  if (!link) {
    $('done-text').textContent = msg || 'حضورك انسجّل، بس ما قدرنا نجيب رابط اللقاء هلأ. جرّب كمان شوي.';
    $('done-retry').hidden = false;
    return;
  }
  $('done-go').href = link;
  $('done-go').hidden = false;
  $('done-text').textContent = 'إذا ما انفتح اللقاء لحاله، اضغط الزر.';
  setTimeout(() => { location.href = link; }, 900);
}
$('done-retry').addEventListener('click', () => { if (pass) openMeeting(pass.c); });
