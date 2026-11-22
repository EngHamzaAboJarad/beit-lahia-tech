// Admin › people tools: QR check-in at the door, bulk WhatsApp messages, the member profile, registrant e-mails.
//
// • Check-in: every workshopRegs doc id is that person's pass code (QR on /workshop after registering, on /pass,
//   and in the pass e-mail). «سجّل الحضور» opens the camera; a scan marks the registration attended with the
//   server time and the scanning admin's e-mail (rules check both). While the scanner is open the selected
//   workshop's registrations are live (onSnapshot), so two phones at the door see each other's scans.
// • Messages (tab «رسائل جماعية»): pick an audience (registered / attended / missed a workshop, community members,
//   everyone) + filters, a ready template with {placeholders}, then one wa.me link per person or copy them all.
// • Profile: one drawer per person (merged by WhatsApp number / e-mail like «الإجمالي العام»): community
//   registration, workshops + attendance, certificates, and private admin notes (memberNotes, «members» only).
// • E-mails (through the social worker › /mail): check-in passes, and certificates right after they're issued.
// • Online workshops: the Zoom / Meet link lives in the social worker (› /live/:wid), never in Firestore. The group
//   gets /live?w=<id>; a registrant checks in there (pass code, or WhatsApp number → liveKeys) and only then gets it.
import { waDigits, passLink, parseCheckinCode } from './checkin-shared.js';
import { mergeWorkshop, arDate, placeText, WS_STATUS, WS_LEVEL } from './workshop-shared.js';
import { ask, askText } from './admin-dialog.js?v=1';

const $ = (id) => document.getElementById(id);
const WORKER = (() => { try { return localStorage.getItem('blt-social-worker') || ''; } catch { return ''; } })() || 'https://social.beitlahia.tech';
const JSQR = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
const STATUS = { tawjihi: 'طالب توجيهي', student: 'طالب جامعة', graduate: 'خريج', other: 'غير ذلك' };
const EXPERIENCE = { none: 'لسا ببدأ', lt1: 'أقل من سنة', '1-2': '1 – 2 سنة', '3-5': '3 – 5 سنوات', '5+': 'أكثر من 5 سنوات' };
const timeFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
const dayTimeFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const tsMs = (t) => (t && typeof t.toMillis === 'function' ? t.toMillis() : 0);
const mailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const arNorm = (s) => String(s || '').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
  .replace(/\s+/g, ' ').trim().toLowerCase();

let d; // deps from admin.js
/**
 * deps: { h, toast, setBusy, db, fs, can, isFull, email(), getToken(), state(), onRegsChanged(), wsName(w), certUrl(id), wsUrl(id) }
 * state() → { allRegs, allCerts, members, workshops, selId, currentId }
 */
export function initPeople(deps) { d = deps; }

/** wa.me link for any stored number (normalised to +970/+972), with an optional message */
export function waHref(phone, text = '') {
  const n = waDigits(phone);
  return n ? `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ''}` : '';
}
const shownPhone = (p) => { const n = waDigits(p); return n ? `+${n}` : String(p || ''); };
const wsById = (id) => d.state().workshops.find((w) => w.id === id);
const wsLabel = (id) => { const w = wsById(id); return w ? d.wsName(w) : 'ورشة محذوفة'; };
const passUrlOf = (r) => passLink(location.origin, r.id, r.workshopId, r.name);
const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
/** 1 → «ورشة وحدة», 2 → «ورشتين», 3–10 → «3 ورشات», 11+ → «11 ورشة» */
const arCount = (n, one, two, few) => (n === 1 ? `${one} وحدة` : n === 2 ? two : n >= 3 && n <= 10 ? `${n} ${few}` : `${n} ${one}`);

/* =================== registrant e-mails (social worker › /mail) =================== */
async function workerPost(path, body) {
  const token = await d.getToken();
  const res = await fetch(`${WORKER}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}
async function workerCall(method, path, body) {
  const token = await d.getToken();
  const res = await fetch(`${WORKER}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `خطأ ${res.status}`);
  return data;
}

/* =================== online workshops: the meeting link + WhatsApp keys =================== */
/** the saved Zoom / Meet link of a workshop ('' = none) */
export async function getLiveLink(wid) { return (await workerCall('GET', `/live/${encodeURIComponent(wid)}`)).link || ''; }
/** save it ('' removes it) → the saved link */
export async function saveLiveLink(wid, link) { return (await workerCall('PUT', `/live/${encodeURIComponent(wid)}`, { link })).link || ''; }
/** the link registrants open (posted in the group instead of the meeting link) */
export const liveShareUrl = (wid) => `${location.origin}/live?w=${encodeURIComponent(wid)}`;

const keysSynced = new Set();
/**
 * liveKeys/{wid}_{WhatsApp digits} = { id } for every registration of an online workshop, so /live can find a
 * registrant by number. Idempotent; once per workshop per page load unless forced (after saving the workshop).
 */
export async function syncLiveKeys(wid, { force = false } = {}) {
  if (!wid || (!force && keysSynced.has(wid))) return 0;
  const regs = d.state().allRegs.filter((r) => r.workshopId === wid);
  const seen = new Set();
  const rows = regs.map((r) => ({ id: r.id, key: `${wid}_${waDigits(r.whatsapp)}` }))
    .filter((x) => /_\d{8,15}$/.test(x.key) && !seen.has(x.key) && seen.add(x.key));
  for (let i = 0; i < rows.length; i += 400) {
    const batch = d.fs.writeBatch(d.db);
    rows.slice(i, i + 400).forEach((x) => batch.set(d.fs.doc(d.db, 'liveKeys', x.key), { id: x.id }));
    await batch.commit();
  }
  keysSynced.add(wid);
  return rows.length;
}

function wsForMail(wid) {
  const m = mergeWorkshop(wsById(wid) || null);
  return { title: m.title, titleAr: m.titleAr, date: m.date ? arDate(m.date) : '', time: m.time, place: placeText(m) };
}
/** items: [{ reg, to, name, url }] of one workshop → sends in batches of 50; marks the regs; returns { ok, failed, firstError } */
async function sendMails(kind, wid, items) {
  let ok = 0; let failed = 0; let firstError = '';
  const flag = kind === 'pass' ? 'passMailedAt' : 'certMailedAt';
  for (let i = 0; i < items.length; i += 50) {
    const part = items.slice(i, i + 50);
    let res;
    try {
      res = await workerPost('/mail/workshop', { kind, workshop: wsForMail(wid), items: part.map((x) => ({ id: x.reg.id, to: x.to, name: x.name, url: x.url })) });
    } catch (e) {
      failed += items.length - i; firstError = firstError || e.message;
      break;
    }
    for (const r of res.results || []) {
      const it = part.find((x) => x.reg.id === r.id);
      if (!it) continue;
      if (r.ok) {
        ok++;
        it.reg[flag] = d.fs.Timestamp.now();
        d.fs.updateDoc(d.fs.doc(d.db, 'workshopRegs', it.reg.id), { [flag]: d.fs.serverTimestamp() }).catch((e) => console.warn('[mail flag]', e));
      } else { failed++; firstError = firstError || r.error; }
    }
  }
  return { ok, failed, firstError };
}

/** right after certificates are issued: e-mail each attendee (registrations with an e-mail) their link */
export async function mailCerts(made, { quiet = false } = {}) {
  const st = d.state();
  const items = made.map((c) => {
    const reg = c.regId ? st.allRegs.find((r) => r.id === c.regId) : null;
    return reg && mailOk(reg.email) && !reg.certMailedAt ? { reg, to: reg.email, name: c.name, url: d.certUrl(c.id), wid: c.workshopId } : null;
  }).filter(Boolean);
  if (!items.length) return { ok: 0, failed: 0 };
  const res = await sendMails('cert', items[0].wid, items);
  if (!quiet || res.failed) {
    d.toast(res.failed
      ? `الشهادات بالإيميل: وصلت لـ ${res.ok} وما وصلت لـ ${res.failed}. السبب: ${res.firstError}`
      : `انبعتت الشهادة بالإيميل لـ ${res.ok} ${res.ok === 1 ? 'شخص' : 'أشخاص'} ✓`, !!res.failed && !res.ok);
  }
  d.onRegsChanged();
  return res;
}

/** attendees of the selected workshop whose certificate wasn't e-mailed yet */
export function pendingCertMails() {
  const st = d.state();
  return st.allRegs.filter((r) => r.workshopId === st.selId && r.attended && r.certId && mailOk(r.email) && !r.certMailedAt
    && st.allCerts.some((c) => c.id === r.certId));
}
export async function mailPendingCerts(btn) {
  const st = d.state();
  const list = pendingCertMails();
  if (!list.length) { d.toast('ما في شهادات مستنية إيميل: يا انبعتت، يا ما إلهم إيميل'); return; }
  if (!(await ask(`إرسال الشهادة بالإيميل لـ ${list.length} من الحاضرين؟`, { tone: 'publish', ok: 'أرسل' }))) return;
  d.setBusy(btn, true);
  try {
    await mailCerts(list.map((r) => st.allCerts.find((c) => c.id === r.certId)));
  } finally { d.setBusy(btn, false); d.onRegsChanged(); }
}

/** the selected workshop's registrations that have an e-mail and haven't got their pass by e-mail yet */
export function pendingPassMails() {
  const st = d.state();
  return st.allRegs.filter((r) => r.workshopId === st.selId && mailOk(r.email) && !r.passMailedAt);
}
export async function mailPasses(btn) {
  const st = d.state();
  const list = pendingPassMails();
  if (!list.length) { d.toast('كل اللي إلهم إيميل وصلتهم بطاقة الدخول'); return; }
  if (!(await ask(`إرسال بطاقة الدخول (رمز QR) بالإيميل لـ ${list.length} مسجّل؟`, { tone: 'publish', ok: 'أرسل' }))) return;
  d.setBusy(btn, true);
  try {
    const res = await sendMails('pass', st.selId, list.map((r) => ({ reg: r, to: r.email, name: r.name, url: passUrlOf(r) })));
    d.toast(res.failed
      ? `بطاقات الدخول: وصلت لـ ${res.ok} وما وصلت لـ ${res.failed}. السبب: ${res.firstError}`
      : `انبعتت بطاقة الدخول بالإيميل لـ ${res.ok} ${res.ok === 1 ? 'شخص' : 'أشخاص'} ✓`, !!res.failed && !res.ok);
  } finally { d.setBusy(btn, false); d.onRegsChanged(); }
}

/* =================== attendance =================== */
/** mark/unmark one registration (local first, then Firestore; reverted if the write is refused) */
export function setAttendance(r, value) {
  const before = { attended: r.attended, attendedAt: r.attendedAt, attendedBy: r.attendedBy };
  const email = d.email();
  r.attended = value;
  r.attendedAt = value ? d.fs.Timestamp.now() : null;
  r.attendedBy = value ? email : '';
  const patch = value
    ? { attended: true, attendedAt: d.fs.serverTimestamp(), attendedBy: email }
    : { attended: false, attendedAt: d.fs.deleteField(), attendedBy: d.fs.deleteField() };
  return d.fs.updateDoc(d.fs.doc(d.db, 'workshopRegs', r.id), patch).catch((e) => {
    Object.assign(r, before);
    d.onRegsChanged();
    throw e;
  });
}
export const attendedText = (r) => {
  const t = tsMs(r.attendedAt);
  return [t ? `الساعة ${timeFmt.format(new Date(t))}` : '', r.attendedBy === 'live' ? 'دخل من رابط اللقاء' : r.attendedBy ? `سجّله ${r.attendedBy}` : ''].filter(Boolean).join(' · ');
};

/* =================== scanner =================== */
const sc = { dlg: null, stream: null, timer: 0, detector: null, canvas: null, last: '', lastAt: 0, unsub: null, hideTimer: 0, audio: null };

function scannerDom() {
  if (sc.dlg) return sc.dlg;
  const { h } = d;
  sc.dlg = h('dialog', { class: 'scan-dlg', id: 'scan-dlg', 'aria-labelledby': 'scan-title' },
    h('div', { class: 'scan-box' },
      h('div', { class: 'scan-head' },
        h('div', {}, h('strong', { id: 'scan-title' }, 'تسجيل الحضور'), h('span', { class: 'scan-ws', id: 'scan-ws' })),
        h('span', { class: 'scan-count', id: 'scan-count' }),
        h('button', { type: 'button', class: 'icon-btn scan-close', 'aria-label': 'إغلاق', onclick: () => sc.dlg.close() }, '✕')),
      h('div', { class: 'scan-stage', id: 'scan-stage' },
        h('video', { id: 'scan-video', playsinline: true, muted: true, autoplay: true }),
        h('div', { class: 'scan-frame', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')),
        h('p', { class: 'scan-cam-msg', id: 'scan-cam-msg', hidden: true })),
      h('div', { class: 'scan-result', id: 'scan-result', role: 'status', 'aria-live': 'assertive', hidden: true },
        h('span', { class: 'scan-result-icon', id: 'scan-result-icon' }),
        h('div', {}, h('strong', { id: 'scan-result-title' }), h('span', { id: 'scan-result-sub' })),
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-xs', id: 'scan-result-open', hidden: true }, 'الملف')),
      h('div', { class: 'scan-manual' },
        h('label', { for: 'scan-q', class: 'small muted' }, 'ما في QR؟ دوّر بالاسم أو الرقم:'),
        h('input', {
          id: 'scan-q', type: 'search', placeholder: 'مثلاً: محمد أو 0599…', autocomplete: 'off', oninput: renderManual,
          // a USB / Bluetooth QR reader types the pass link + Enter (so does pasting one)
          onkeydown: (e) => { if (e.key === 'Enter' && parseCheckinCode(e.target.value)) { e.preventDefault(); sc.last = ''; onScan(e.target.value.trim()); e.target.value = ''; renderManual(); } },
        }),
        h('ul', { class: 'scan-list', id: 'scan-list' }))));
  sc.dlg.addEventListener('close', stopScanner);
  document.body.append(sc.dlg);
  return sc.dlg;
}

export async function openScanner() {
  const st = d.state();
  if (!st.selId) { d.toast('اختار ورشة أول', true); return; }
  const dlg = scannerDom();
  $('scan-ws').textContent = wsLabel(st.selId);
  $('scan-q').value = '';
  $('scan-result').hidden = true;
  renderManual();
  updateCount();
  dlg.showModal();
  // live list of this workshop's registrations (other door phones' scans show up here too)
  try {
    sc.unsub = d.fs.onSnapshot(d.fs.query(d.fs.collection(d.db, 'workshopRegs'), d.fs.where('workshopId', '==', st.selId)), (snap) => {
      const all = d.state().allRegs;
      snap.docChanges().forEach((ch) => {
        const data = { id: ch.doc.id, ...ch.doc.data() };
        const i = all.findIndex((x) => x.id === data.id);
        if (ch.type === 'removed') { if (i >= 0) all.splice(i, 1); } else if (i >= 0) Object.assign(all[i], data); else all.push(data);
      });
      updateCount(); renderManual();
    }, (e) => console.warn('[scan live]', e));
  } catch (e) { console.warn('[scan live]', e); }
  startCamera();
}

async function startCamera() {
  const msg = $('scan-cam-msg');
  msg.hidden = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camError('المتصفح ما بيدعم الكاميرا هون. استعمل البحث تحت.'); return; }
  try {
    sc.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    camError(e && e.name === 'NotAllowedError'
      ? 'ما في إذن للكاميرا. اسمح للموقع يستعمل الكاميرا من إعدادات المتصفح (رمز القفل جنب الرابط)، وبعدين افتح الماسح من جديد.'
      : 'ما قدرت أفتح الكاميرا. تأكد إنه ما في تطبيق ثاني فاتحها، أو استعمل البحث تحت.');
    return;
  }
  if (!sc.dlg.open) { stopScanner(); return; }
  const video = $('scan-video');
  video.srcObject = sc.stream;
  try { await video.play(); } catch { /* autoplay muted is allowed */ }
  try { sc.detector = await makeDetector(); } catch (e) {
    console.warn('[scan]', e);
    camError('ما قدرت أحمّل قارئ الـ QR (بدها نت). استعمل البحث تحت.');
    return;
  }
  tick();
}
function camError(text) { const m = $('scan-cam-msg'); m.textContent = text; m.hidden = false; }

async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const bd = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => { const codes = await bd.detect(video); return codes[0]?.rawValue || ''; };
      }
    } catch { /* fall back */ }
  }
  // Safari on iPhone / Firefox: a small decoder from the CDN
  if (!window.jsQR) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSQR; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = resolve; s.onerror = () => reject(new Error('jsQR'));
      document.head.append(s);
    });
  }
  sc.canvas = sc.canvas || document.createElement('canvas');
  const ctx = sc.canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth; const hh = video.videoHeight;
    if (!w || !hh) return '';
    const scale = Math.min(1, 720 / Math.max(w, hh));
    sc.canvas.width = Math.round(w * scale); sc.canvas.height = Math.round(hh * scale);
    ctx.drawImage(video, 0, 0, sc.canvas.width, sc.canvas.height);
    const img = ctx.getImageData(0, 0, sc.canvas.width, sc.canvas.height);
    return window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || '';
  };
}

function tick() {
  if (!sc.dlg || !sc.dlg.open || !sc.detector) return;
  const video = $('scan-video');
  const go = async () => {
    if (video.readyState >= 2) {
      try { const text = await sc.detector(video); if (text) onScan(text); } catch { /* a bad frame */ }
    }
    if (sc.dlg.open) sc.timer = setTimeout(tick, 140);
  };
  go();
}

function stopScanner() {
  clearTimeout(sc.timer);
  if (sc.stream) sc.stream.getTracks().forEach((t) => t.stop());
  sc.stream = null; sc.detector = null;
  const v = $('scan-video'); if (v) v.srcObject = null;
  if (sc.unsub) { sc.unsub(); sc.unsub = null; }
  d.onRegsChanged();
}

function onScan(text) {
  const now = Date.now();
  if (text === sc.last && now - sc.lastAt < 3000) return; // the same code still in front of the camera
  sc.last = text; sc.lastAt = now;
  const code = parseCheckinCode(text);
  if (!code) { feedback('bad', 'هاد مش رمز دخول', 'الرمز اللي انمسح مش بطاقة دخول من موقعنا.'); return; }
  checkIn(code.id);
}

async function checkIn(id, fromList = false) {
  const st = d.state();
  let r = st.allRegs.find((x) => x.id === id);
  if (!r && !fromList) {
    try {
      const snap = await d.fs.getDoc(d.fs.doc(d.db, 'workshopRegs', id));
      if (snap.exists()) { r = { id, ...snap.data() }; st.allRegs.push(r); }
    } catch { /* offline: only the loaded list */ }
  }
  if (!r) { feedback('bad', 'مش مسجّل', 'ما لقينا تسجيل بهاد الرمز. يمكن انحذف، أو البطاقة مش من هالموقع. دوّر عليه بالاسم تحت.'); return; }
  if (r.workshopId !== st.selId) { feedback('bad', `${r.name}: مش مسجّل بهاي الورشة`, `تسجيله بورشة «${wsLabel(r.workshopId)}».`, r); return; }
  if (r.attended) { feedback('dup', `${r.name}: انمسح قبل هيك`, attendedText(r) || 'حضوره متسجّل من قبل.', r); return; }
  setAttendance(r, true).catch((e) => feedback('bad', `ما انحفظ حضور ${r.name}`, e && e.code === 'permission-denied' ? 'ما عندك صلاحية الورشات.' : 'صار خطأ بالحفظ، جرّب كمان مرة.', r));
  feedback('ok', `✓ ${r.name}`, `أهلاً وسهلاً! انسجّل حضوره الساعة ${timeFmt.format(new Date())}.`, r);
  updateCount(); renderManual();
}

function feedback(kind, title, sub, r = null) {
  const box = $('scan-result');
  box.hidden = false;
  box.className = `scan-result is-${kind}`;
  $('scan-result-icon').textContent = kind === 'ok' ? '✓' : kind === 'dup' ? '!' : '✕';
  $('scan-result-title').textContent = title;
  $('scan-result-sub').textContent = sub;
  const open = $('scan-result-open');
  open.hidden = !r;
  open.onclick = r ? () => openProfile({ wa: r.whatsapp, email: r.email, name: r.name }) : null;
  try { navigator.vibrate?.(kind === 'ok' ? 80 : [70, 60, 70, 60, 70]); } catch { /* ignore */ }
  beep(kind);
  clearTimeout(sc.hideTimer);
  sc.hideTimer = setTimeout(() => { box.classList.add('is-fading'); }, kind === 'ok' ? 3500 : 6000);
}
function beep(kind) {
  try {
    sc.audio = sc.audio || new (window.AudioContext || window.webkitAudioContext)();
    const a = sc.audio; const t0 = a.currentTime;
    (kind === 'ok' ? [[880, 0, 0.12]] : [[300, 0, 0.14], [300, 0.2, 0.14]]).forEach(([f, at, len]) => {
      const o = a.createOscillator(); const g = a.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0 + at); g.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      o.connect(g).connect(a.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.02);
    });
  } catch { /* no sound */ }
}

function selRegs() { const st = d.state(); return st.allRegs.filter((r) => r.workshopId === st.selId); }
function updateCount() {
  const list = selRegs();
  const el = $('scan-count');
  if (el) el.textContent = `حضر ${list.filter((r) => r.attended).length} من ${list.length}`;
}
function renderManual() {
  const ul = $('scan-list'); if (!ul) return;
  const q = arNorm($('scan-q').value);
  const qd = $('scan-q').value.replace(/\D/g, '');
  if (!q) { ul.replaceChildren(); return; }
  const hits = selRegs().filter((r) => arNorm(r.name).includes(q) || (qd.length >= 3 && String(waDigits(r.whatsapp)).includes(qd.replace(/^0/, '')))
    || String(r.email || '').toLowerCase().includes(q)).slice(0, 8);
  const { h } = d;
  ul.replaceChildren(...(hits.length ? hits.map((r) => h('li', { class: r.attended ? 'is-in' : '' },
    h('div', {}, h('strong', {}, r.name), h('bdi', { dir: 'ltr', class: 'muted small' }, shownPhone(r.whatsapp))),
    r.attended
      ? h('span', { class: 'badge badge-src-member', title: attendedText(r) }, `✓ ${tsMs(r.attendedAt) ? timeFmt.format(new Date(tsMs(r.attendedAt))) : 'حضر'}`)
      : h('button', { type: 'button', class: 'btn btn-primary btn-xs', onclick: () => checkIn(r.id, true) }, 'سجّل حضوره')))
    : [h('li', { class: 'muted small' }, 'ما في حدا بهالاسم مسجّل بهاي الورشة.')]));
}

/* =================== bulk WhatsApp messages =================== */
const TEMPLATES = [
  { key: 'remind', label: 'تذكير بالورشة', text: 'أهلاً {الاسم_الأول} 👋\nبنذكّرك بورشة «{الورشة}» {الموعد}{المكان}.\nبطاقة دخولك (فيها رمز QR، ورجّيها للفريق عالباب):\n{بطاقة_الدخول}\nبنشوفك هناك! 💚\n— بيت لاهيا تيك' },
  { key: 'pass', label: 'بطاقة الدخول', text: 'أهلاً {الاسم_الأول}، تسجيلك بورشة «{الورشة}» مؤكد ✅\nهاي بطاقة دخولك، احفظها وورجّيها عالباب يوم الورشة:\n{بطاقة_الدخول}\nالشهادة بتنصدر للي حضروا 🎓\n— بيت لاهيا تيك' },
  { key: 'thanks', label: 'شكراً على الحضور + الشهادة', text: 'شكراً {الاسم_الأول} على حضورك ورشة «{الورشة}» 🙏\nشهادتك جاهزة:\n{الشهادة}\nبنشوفك بالورشات الجاية! 💚\n— بيت لاهيا تيك' },
  { key: 'missed', label: 'فاتتك الورشة', text: 'أهلاً {الاسم_الأول}، افتقدناك بورشة «{الورشة}» 💚\nولا يهمك، تابعنا عشان توصلك الورشة الجاية أول بأول:\n{رابط_الورشة}\n— بيت لاهيا تيك' },
  { key: 'invite', label: 'دعوة لورشة جديدة', text: 'أهلاً {الاسم_الأول} 👋\nعنا ورشة جديدة: «{الورشة}» {الموعد}{المكان}.\nالمقاعد محدودة، احجز مقعدك من هون:\n{رابط_الورشة}\n— بيت لاهيا تيك' },
  { key: 'free', label: 'رسالة حرة', text: 'أهلاً {الاسم_الأول}،\n\n— بيت لاهيا تيك' },
];
const PLACEHOLDERS = ['الاسم', 'الاسم_الأول', 'الورشة', 'الموعد', 'المكان', 'رابط_الورشة', 'بطاقة_الدخول', 'الشهادة'];
const MSG_SENT_KEY = 'blt-msg-sent';
let msgWired = false;

/** audience → [{ name, phone, email, reg?, member?, status, specialty, residence }] (one per WhatsApp number) */
function audience() {
  const st = d.state();
  const src = $('msg-audience').value;
  const [kind, wid] = src.split(':');
  let people = [];
  const fromReg = (r) => ({ name: r.name, phone: r.whatsapp, email: r.email, reg: r, status: r.status, specialty: r.major || '', residence: '', level: r.level });
  const fromMember = (m) => ({ name: m.name, phone: m.whatsapp, email: m.email, member: m, status: m.status, specialty: [m.specialty, m.university].filter(Boolean).join(' '), residence: m.residence || '', level: '' });
  if (kind === 'reg') people = st.allRegs.filter((r) => r.workshopId === wid).map(fromReg);
  else if (kind === 'att') people = st.allRegs.filter((r) => r.workshopId === wid && r.attended).map(fromReg);
  else if (kind === 'abs') people = st.allRegs.filter((r) => r.workshopId === wid && !r.attended).map(fromReg);
  else if (kind === 'members') people = st.members.map(fromMember);
  else if (kind === 'all') people = [...st.members.map(fromMember), ...(d.can('workshops') ? st.allRegs.map(fromReg) : [])];
  // filters
  const status = $('msg-status').value;
  const words = (id) => $(id).value.split(/[,،]/).map(arNorm).filter(Boolean);
  const spec = words('msg-spec'); const res = words('msg-res');
  people = people.filter((p) => (!status || p.status === status)
    && (!spec.length || spec.some((w) => arNorm(p.specialty).includes(w)))
    && (!res.length || res.some((w) => arNorm(p.residence).includes(w))));
  // one row per number (a member's own record wins over a workshop registration)
  const byNum = new Map(); const noNum = [];
  people.forEach((p) => {
    const n = waDigits(p.phone);
    if (!n) { noNum.push(p); return; }
    const was = byNum.get(n);
    if (!was) byNum.set(n, { ...p, num: n });
    else { if (!was.reg && p.reg) was.reg = p.reg; if (!was.member && p.member) { was.member = p.member; was.name = p.name; } }
  });
  return { list: [...byNum.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar')), noNum, wid: kind === 'reg' || kind === 'att' || kind === 'abs' ? wid : '' };
}

function fillMessage(tpl, p, msgWid) {
  const st = d.state();
  const w = mergeWorkshop(wsById(msgWid) || null);
  const cert = p.reg && p.reg.certId && p.reg.workshopId === msgWid ? st.allCerts.find((c) => c.id === p.reg.certId) : null;
  const vals = {
    الاسم: p.name, الاسم_الأول: firstName(p.name), الورشة: w.titleAr || w.title,
    الموعد: [w.date ? arDate(w.date) : '', w.time].filter(Boolean).join(' '), المكان: placeText(w) ? ` · ${placeText(w)}` : '',
    رابط_الورشة: msgWid ? d.wsUrl(msgWid) : `${location.origin}/workshop`,
    بطاقة_الدخول: p.reg && p.reg.workshopId === msgWid ? passUrlOf(p.reg) : '',
    الشهادة: cert ? d.certUrl(cert.id) : '',
  };
  return tpl.replace(/\{([^{}]+)\}/g, (m, k) => (k in vals ? vals[k] : m)).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function msgSent() { try { return new Set(JSON.parse(localStorage.getItem(MSG_SENT_KEY) || '[]')); } catch { return new Set(); } }
function markMsgSent(k) { try { const s = msgSent(); s.add(k); localStorage.setItem(MSG_SENT_KEY, JSON.stringify([...s].slice(-3000))); } catch { /* ignore */ } }
const sentKey = (num, text) => `${num}|${text.length}|${[...text].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7)}`;

function wireMessages() {
  if (msgWired) return;
  msgWired = true;
  const { h } = d;
  $('msg-template').replaceChildren(...TEMPLATES.map((t) => h('option', { value: t.key }, t.label)));
  $('msg-template').addEventListener('change', () => { $('msg-text').value = TEMPLATES.find((t) => t.key === $('msg-template').value).text; renderMessageList(); });
  $('msg-text').value = TEMPLATES[0].text;
  $('msg-chips').replaceChildren(...PLACEHOLDERS.map((p) => h('button', { type: 'button', class: 'chip-btn', onclick: () => insertAtCursor($('msg-text'), `{${p}}`) }, `{${p}}`)));
  ['msg-audience', 'msg-ws', 'msg-status', 'msg-spec', 'msg-res', 'msg-text'].forEach((id) => $(id).addEventListener('input', () => {
    if (id === 'msg-audience') syncMsgWs();
    renderMessageList();
  }));
  $('msg-copy-nums').addEventListener('click', () => {
    const { list } = audience();
    copy(list.map((p) => `+${p.num}`).join('\n'), `انسخت ${list.length} رقم`);
  });
  $('msg-copy-all').addEventListener('click', () => {
    const { list } = audience();
    const tpl = $('msg-text').value; const wid = $('msg-ws').value;
    copy(list.map((p) => { const t = fillMessage(tpl, p, wid); return `${p.name} (+${p.num})\n${t}\n${waHref(p.num, t)}`; }).join('\n\n— — —\n\n'), `انسخت ${list.length} رسالة`);
  });
  $('msg-reset-sent').addEventListener('click', () => { try { localStorage.removeItem(MSG_SENT_KEY); } catch { /* ignore */ } renderMessageList(); });
}
function insertAtCursor(ta, text) {
  const s = ta.selectionStart ?? ta.value.length; const e = ta.selectionEnd ?? s;
  ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
  ta.focus(); ta.selectionStart = ta.selectionEnd = s + text.length;
  renderMessageList();
}
async function copy(text, ok) {
  try { await navigator.clipboard.writeText(text); d.toast(ok); } catch { d.toast('ما قدرت أنسخ', true); }
}

function syncMsgWs() {
  const [kind, wid] = $('msg-audience').value.split(':');
  if (wid && ['reg', 'att', 'abs'].includes(kind)) $('msg-ws').value = wid;
  const tpl = { att: 'thanks', abs: 'missed', reg: 'remind', members: 'invite', all: 'invite' }[kind];
  if (tpl && $('msg-template').value !== 'free') { $('msg-template').value = tpl; $('msg-text').value = TEMPLATES.find((t) => t.key === tpl).text; }
}

/** the tab «رسائل جماعية» (called when it opens and when data reloads) */
export function renderMessages() {
  if (!d || $('tab-messages').hidden) return;
  wireMessages();
  const { h } = d;
  const st = d.state();
  const sorted = [...st.workshops].sort((a, b) => String(b.date || '9999').localeCompare(String(a.date || '9999')));
  const aud = $('msg-audience'); const keep = aud.value;
  const opts = [];
  if (d.can('workshops')) {
    sorted.forEach((w) => {
      const name = d.wsName(w);
      opts.push(h('optgroup', { label: `ورشة: ${name}` },
        h('option', { value: `reg:${w.id}` }, `سجّلوا بورشة «${name}»`),
        h('option', { value: `att:${w.id}` }, `حضروا ورشة «${name}»`),
        h('option', { value: `abs:${w.id}` }, `سجّلوا بـ «${name}» وما حضروا`)));
    });
  }
  if (d.can('members')) opts.unshift(h('option', { value: 'members' }, 'كل أعضاء المجتمع'));
  if (d.can('members') && d.can('workshops')) opts.unshift(h('option', { value: 'all' }, 'الكل: المجتمع + كل الورشات (بدون تكرار)'));
  aud.replaceChildren(...opts);
  const first = st.selId && d.can('workshops') ? `reg:${st.selId}` : (aud.querySelector('option') || {}).value || '';
  aud.value = [...aud.querySelectorAll('option')].some((o) => o.value === keep) ? keep : first;
  const msgWs = $('msg-ws'); const keepWs = msgWs.value;
  msgWs.replaceChildren(...sorted.map((w) => h('option', { value: w.id }, d.wsName(w))));
  msgWs.value = sorted.some((w) => w.id === keepWs) ? keepWs : (st.selId || st.currentId || (sorted[0] || {}).id || '');
  if (!keep) syncMsgWs();
  renderMessageList();
}

function renderMessageList() {
  const { h } = d;
  const { list, noNum } = audience();
  const tpl = $('msg-text').value; const wid = $('msg-ws').value;
  const sent = msgSent();
  const missing = { pass: 0, cert: 0 };
  const rows = list.map((p) => {
    const text = fillMessage(tpl, p, wid);
    if (tpl.includes('{بطاقة_الدخول}') && !(p.reg && p.reg.workshopId === wid)) missing.pass++;
    if (tpl.includes('{الشهادة}') && !text.includes('/certificate?id=')) missing.cert++;
    const key = sentKey(p.num, text);
    const li = h('li', { class: sent.has(key) ? 'is-sent' : '' },
      h('div', { class: 'msg-who' },
        h('button', { type: 'button', class: 'link-btn msg-name', onclick: () => openProfile({ wa: p.phone, email: p.email, name: p.name }) }, p.name),
        h('bdi', { dir: 'ltr', class: 'muted small' }, `+${p.num}`)),
      h('details', { class: 'msg-preview' }, h('summary', {}, text.split('\n')[0].slice(0, 70)), h('p', {}, text)),
      h('a', {
        class: 'btn btn-xs wa-send', href: waHref(p.num, text), target: '_blank', rel: 'noopener noreferrer',
        onclick: () => { markMsgSent(key); li.classList.add('is-sent'); },
      }, sent.has(key) ? 'انبعتت ✓' : 'واتساب'));
    return li;
  });
  $('msg-count').textContent = `${list.length} شخص برقم واتساب${noNum.length ? ` · ${noNum.length} بدون رقم صالح` : ''}`;
  const warn = [missing.pass ? `${missing.pass} ما إلهم بطاقة دخول بهاي الورشة` : '', missing.cert ? `${missing.cert} ما إلهم شهادة بهاي الورشة` : ''].filter(Boolean);
  $('msg-warn').textContent = warn.length ? `انتبه: ${warn.join('، ')} (الرابط رح يطلع فاضي عندهم).` : '';
  $('msg-warn').hidden = !warn.length;
  $('msg-list').replaceChildren(...rows);
  $('msg-empty').hidden = list.length > 0;
  $('msg-nonum').replaceChildren(...(noNum.length ? [h('summary', {}, `بدون رقم واتساب صالح (${noNum.length})`), h('ul', {}, noNum.map((p) => h('li', {}, `${p.name} · `, h('bdi', { dir: 'ltr' }, String(p.phone || '—')))))] : []));
  $('msg-nonum').hidden = !noNum.length;
  $('msg-copy-nums').disabled = !list.length;
  $('msg-copy-all').disabled = !list.length;
}

/* =================== member profile =================== */
let pf = { dlg: null, seed: null, keys: [] };

/** everything that is the same person: members + workshop registrations sharing a WhatsApp number or e-mail */
function gather(seed) {
  const st = d.state();
  const mem = d.can('members') ? st.members : [];
  const regs = d.can('workshops') ? st.allRegs : [];
  const nums = new Set(); const mails = new Set();
  const addKeys = (x) => { const n = waDigits(x.whatsapp ?? x.wa); if (n) nums.add(n); const e = String(x.email || '').toLowerCase(); if (mailOk(e)) mails.add(e); };
  addKeys(seed);
  const hit = (x) => nums.has(waDigits(x.whatsapp)) || mails.has(String(x.email || '').toLowerCase());
  let M = []; let R = [];
  if (nums.size || mails.size) {
    for (let grew = true; grew;) {
      const m2 = mem.filter(hit); const r2 = regs.filter(hit);
      grew = m2.length !== M.length || r2.length !== R.length;
      M = m2; R = r2; [...M, ...R].forEach(addKeys);
    }
  } else {
    const n = arNorm(seed.name);
    M = mem.filter((x) => arNorm(x.name) === n); R = regs.filter((x) => arNorm(x.name) === n);
  }
  const certs = d.can('workshops') ? st.allCerts.filter((c) => (c.regId && R.some((r) => r.id === c.regId))
    || (!c.regId && arNorm(c.name) === arNorm(seed.name))) : [];
  const keys = [...[...nums].map((n) => `p${n}`), ...[...mails].map((e) => `e:${e}`)];
  if (!keys.length) keys.push(`n:${arNorm(seed.name)}`.slice(0, 140));
  return { members: M, regs: R.sort((a, b) => tsMs(b.createdAt) - tsMs(a.createdAt)), certs, keys: keys.slice(0, 30), nums: [...nums], mails: [...mails] };
}

function profileDom() {
  if (pf.dlg) return pf.dlg;
  const { h } = d;
  pf.dlg = h('dialog', { class: 'pf-dlg', id: 'pf-dlg', 'aria-labelledby': 'pf-name' },
    h('div', { class: 'pf-box' },
      h('div', { class: 'pf-head' },
        h('span', { class: 'pf-avatar', id: 'pf-avatar', 'aria-hidden': 'true' }),
        h('div', { class: 'pf-title' }, h('h2', { id: 'pf-name' }), h('div', { class: 'pf-badges', id: 'pf-badges' })),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'إغلاق', onclick: () => pf.dlg.close() }, '✕')),
      h('div', { class: 'pf-contact', id: 'pf-contact' }),
      h('div', { class: 'pf-body', id: 'pf-body' })));
  pf.dlg.addEventListener('click', (e) => { if (e.target === pf.dlg) pf.dlg.close(); }); // backdrop
  document.body.append(pf.dlg);
  return pf.dlg;
}

/** seed: { wa, email, name } — any record of the person */
export function openProfile(seed) {
  if (!d.can('members') && !d.can('workshops')) return;
  pf.seed = seed;
  const dlg = profileDom();
  renderProfile();
  if (!dlg.open) dlg.showModal();
}

function section(title, ...kids) { return d.h('section', { class: 'pf-sec' }, d.h('h3', {}, title), ...kids); }
function kv(label, value) { return value ? d.h('div', { class: 'pf-kv' }, d.h('dt', {}, label), d.h('dd', {}, value)) : null; }

function renderProfile() {
  const { h } = d;
  const p = gather(pf.seed);
  pf.keys = p.keys;
  const name = p.members[0]?.name || p.regs[0]?.name || pf.seed.name || 'بدون اسم';
  $('pf-avatar').textContent = [...String(name).trim()][0] || '؟';
  $('pf-name').textContent = name;
  const attended = p.regs.filter((r) => r.attended).length;
  $('pf-badges').replaceChildren(...[
    p.members.length ? h('span', { class: 'badge badge-src-member' }, 'عضو بالمجتمع') : null,
    p.regs.length ? h('span', { class: 'badge badge-src-ws' }, `${arCount(p.regs.length, 'ورشة', 'ورشتين', 'ورشات')} · حضر ${attended}`) : null,
    p.certs.length ? h('span', { class: 'badge' }, arCount(p.certs.length, 'شهادة', 'شهادتين', 'شهادات')) : null,
  ].filter(Boolean));
  $('pf-contact').replaceChildren(
    ...p.nums.map((n) => h('a', { class: 'wa-btn', href: waHref(n), target: '_blank', rel: 'noopener noreferrer', title: 'فتح محادثة واتساب' }, h('bdi', { dir: 'ltr' }, `+${n}`))),
    ...p.mails.map((e) => h('a', { class: 'mail-link', href: `mailto:${e}`, dir: 'ltr' }, e)));

  const body = [];
  // community registration
  if (d.can('members')) {
    body.push(section('التسجيل بالمجتمع', p.members.length ? p.members.map((m) => h('dl', { class: 'pf-dl' },
      kv('الحالة', STATUS[m.status] || m.status), kv('التخصص', m.specialty), kv('العمر', m.age ? String(m.age) : ''),
      kv('الخبرة', EXPERIENCE[m.experience] || ''), kv('وين مقيم', m.residence), kv('الجامعة', m.university),
      kv('معرض الأعمال', /^https?:\/\//.test(m.portfolio || '') ? h('a', { href: m.portfolio, target: '_blank', rel: 'noopener noreferrer nofollow', dir: 'ltr' }, m.portfolio) : ''),
      kv('كتب بالتسجيل', m.notes), kv('تاريخ التسجيل', tsMs(m.createdAt) ? dayFmt.format(new Date(tsMs(m.createdAt))) : ''),
      kv('التواصل', m.contacted ? 'تواصلنا معه ✓' : 'لسا ما تواصلنا'), m.deletedAt ? kv('ملاحظة', 'بسلة المحذوفات') : null))
      : h('p', { class: 'muted small' }, 'مش مسجّل بفورم المجتمع (بس بالورشات).')));
  }
  // workshops + attendance
  if (d.can('workshops')) {
    const st = d.state();
    body.push(section('الورشات والحضور', p.regs.length ? h('ul', { class: 'pf-list' }, p.regs.map((r) => {
      const c = r.certId ? st.allCerts.find((x) => x.id === r.certId) : null;
      return h('li', {},
        h('div', { class: 'pf-li-main' },
          h('strong', {}, wsLabel(r.workshopId)),
          h('span', { class: 'muted small' }, [tsMs(r.createdAt) ? `سجّل ${dayFmt.format(new Date(tsMs(r.createdAt)))}` : '', WS_LEVEL[r.level] || '', WS_STATUS[r.status] || ''].filter(Boolean).join(' · '))),
        h('div', { class: 'pf-li-side' },
          r.attended
            ? h('span', { class: 'badge badge-src-member', title: attendedText(r) }, `حضر ✓${tsMs(r.attendedAt) ? ` ${dayTimeFmt.format(new Date(tsMs(r.attendedAt)))}` : ''}`)
            : h('span', { class: 'badge badge-dup' }, 'ما تسجّل حضوره'),
          c ? h('a', { class: 'btn btn-ghost-dark btn-xs', href: d.certUrl(c.id), target: '_blank', rel: 'noopener' }, `شهادة ${c.no}`) : null,
          h('a', { class: 'btn btn-ghost-dark btn-xs', href: passUrlOf(r), target: '_blank', rel: 'noopener', title: 'بطاقة الدخول (QR)' }, 'البطاقة')),
        r.expectations ? h('p', { class: 'pf-quote' }, `توقعاته: ${r.expectations}`) : null);
    })) : h('p', { class: 'muted small' }, 'ما سجّل بأي ورشة لسا.')));
    const manual = p.certs.filter((c) => !c.regId);
    if (manual.length) {
      body.push(section('شهادات إصدار يدوي (بنفس الاسم)', h('ul', { class: 'pf-list' }, manual.map((c) => h('li', {},
        h('div', { class: 'pf-li-main' }, h('strong', {}, wsLabel(c.workshopId)), h('span', { class: 'muted small' }, c.date || '')),
        h('div', { class: 'pf-li-side' }, h('a', { class: 'btn btn-ghost-dark btn-xs', href: d.certUrl(c.id), target: '_blank', rel: 'noopener' }, `شهادة ${c.no}`)))))));
    }
  }
  // private notes
  if (d.can('members')) {
    const ta = h('textarea', { id: 'pf-note', rows: 3, maxlength: 2000, placeholder: 'مثلاً: مهتم بالباك إند، بيقدر يساعد بتنظيم الورشة الجاية…' });
    const btn = h('button', { type: 'submit', class: 'btn btn-primary btn-sm' }, h('span', { class: 'btn-label' }, 'أضف الملاحظة'), h('span', { class: 'spinner', 'aria-hidden': 'true' }));
    body.push(section('ملاحظات الإدارة',
      h('p', { class: 'muted small' }, 'خاصة بالمشرفين اللي معهم صلاحية «التسجيلات»، وما بتطلع لصاحبها.'),
      h('ul', { class: 'pf-notes', id: 'pf-notes' }, h('li', { class: 'muted small' }, 'جاري التحميل…')),
      h('form', { class: 'pf-note-form', onsubmit: (e) => { e.preventDefault(); addNote(ta, btn, name); } }, ta, btn)));
  }
  $('pf-body').replaceChildren(...body);
  if (d.can('members')) loadNotes();
}

async function loadNotes() {
  const ul = $('pf-notes'); if (!ul) return;
  const keys = pf.keys;
  try {
    const snap = await d.fs.getDocs(d.fs.query(d.fs.collection(d.db, 'memberNotes'), d.fs.where('person', 'in', keys)));
    if (keys !== pf.keys) return; // another profile opened meanwhile
    const notes = snap.docs.map((x) => ({ id: x.id, ...x.data() })).sort((a, b) => tsMs(b.at) - tsMs(a.at));
    renderNotes(notes);
  } catch (e) {
    console.error('[notes]', e);
    ul.replaceChildren(d.h('li', { class: 'muted small' }, e && e.code === 'permission-denied' ? 'ما عندك صلاحية تشوف الملاحظات.' : 'ما قدرت أحمّل الملاحظات.'));
  }
}
function renderNotes(notes) {
  const { h } = d;
  const me = d.email();
  $('pf-notes').replaceChildren(...(notes.length ? notes.map((n) => h('li', {},
    h('p', {}, n.text),
    h('div', { class: 'pf-note-meta' },
      h('span', {}, [n.by, tsMs(n.at) ? dayTimeFmt.format(new Date(tsMs(n.at))) : 'هلأ'].filter(Boolean).join(' · ')),
      n.by === me || d.isFull() ? h('button', { type: 'button', class: 'link-btn', onclick: () => deleteNote(n) }, 'حذف') : null)))
    : [h('li', { class: 'muted small' }, 'ما في ملاحظات لسا.')]));
}
async function addNote(ta, btn, name) {
  const text = ta.value.trim();
  if (!text) { ta.focus(); return; }
  d.setBusy(btn, true);
  try {
    await d.fs.addDoc(d.fs.collection(d.db, 'memberNotes'), { person: pf.keys[0], text: text.slice(0, 2000), name: String(name).slice(0, 80), by: d.email(), at: d.fs.serverTimestamp() });
    ta.value = '';
    await loadNotes();
    d.toast('انحفظت الملاحظة');
  } catch (e) { console.error(e); d.toast(e && e.code === 'permission-denied' ? 'ما عندك صلاحية تضيف ملاحظات.' : 'ما انحفظت الملاحظة، جرّب كمان مرة.', true); } finally { d.setBusy(btn, false); }
}
async function deleteNote(n) {
  if (!(await ask('حذف الملاحظة؟', { tone: 'danger' }))) return;
  try { await d.fs.deleteDoc(d.fs.doc(d.db, 'memberNotes', n.id)); await loadNotes(); } catch (e) { d.toast(e && e.code === 'permission-denied' ? 'بس كاتب الملاحظة بيحذفها.' : 'ما انحذفت.', true); }
}
