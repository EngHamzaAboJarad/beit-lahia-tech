// Beit Lahia Tech — a registrant's check-in pass.
// /pass?c=<registration id>&w=<workshop id>#<name> → the workshop's details (public workshop doc), the name from
// the fragment, and a QR the team scans at the door (admin › الورشات › «سجّل الحضور»). Nothing here reads the
// registration itself: visitors can't read workshopRegs, and the pass works offline once saved as an image.
import { getDbLite } from './firebase-init.js';
import { mergeWorkshop, arDate, placeText, accentAI } from './workshop-shared.js';
import { qrPayload, qrCanvas, parseCheckinCode } from './checkin-shared.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const code = parseCheckinCode(`${location.origin}/pass?${params}`);
let name = '';
try { name = decodeURIComponent(location.hash.slice(1)).replace(/\s+/g, ' ').trim().slice(0, 80); } catch { name = ''; }

function missing() { $('loading').hidden = true; $('missing').hidden = false; }

let ws = null;
if (!code) missing();
else {
  if (code.wid) {
    try {
      const { db, fs } = await getDbLite();
      const snap = await fs.getDoc(fs.doc(db, 'workshops', code.wid));
      if (snap.exists()) ws = mergeWorkshop(snap.data());
    } catch { /* offline or not public yet: the pass still works */ }
  }
  render();
}

function render() {
  $('loading').hidden = true;
  $('pass-view').hidden = false;
  if (ws) {
    accentAI($('pass-ws'), ws.title);
    if (ws.titleAr) { $('pass-ws-ar').textContent = ws.titleAr; $('pass-ws-ar').hidden = false; }
    const bits = [ws.date ? arDate(ws.date) : '', ws.time, placeText(ws)].filter(Boolean);
    $('pass-meta').replaceChildren(...bits.map((b) => Object.assign(document.createElement('span'), { textContent: b })));
    document.title = `بطاقة الدخول — ${ws.titleAr || ws.title} | بيت لاهيا تيك`;
  }
  $('pass-name').textContent = name || 'بطاقة دخول شخصية';
  $('pass-label').hidden = !name;
  const qr = qrCanvas(qrPayload(location.origin, code.id, code.wid), 540, 2);
  if (qr) $('pass-qr').replaceChildren(qr);
  $('pass-code').textContent = code.id;
  if (navigator.share) $('share-btn').hidden = false;
  // remembered on this phone: the group's /live link then knows who's entering
  if (code.wid) { try { localStorage.setItem(`blt-pass:${code.wid}`, JSON.stringify({ c: code.id, n: name })); } catch { /* private mode */ } }
  if (ws && ws.mode === 'online' && code.wid) {
    const live = $('live-btn');
    live.href = `/live?w=${encodeURIComponent(code.wid)}&c=${encodeURIComponent(code.id)}${name ? `#${encodeURIComponent(name)}` : ''}`;
    live.hidden = false;
    $('save-btn').className = 'btn btn-ghost';
    $('pass-tip').textContent = 'الورشة أونلاين: وقت اللقاء اضغط «ادخل اللقاء الأونلاين» (أو رابط الجروب)، فبيتسجّل حضورك وبتدخل. حضورك هو اللي بيطلّعلك الشهادة.';
  }
}

// a 1080×1350 image of the pass (to keep in the gallery and show at the door without internet)
$('save-btn').addEventListener('click', async () => {
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  const W = 1080; const H = 1350;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#0B1020'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#FFFFFF'; roundRect(x, 70, 70, W - 140, H - 140, 48); x.fill();
  x.fillStyle = '#151C2D'; roundRect(x, 70, 70, W - 140, 360, 48, true); x.fill();
  [['#35E69B', 0, 0.3], ['#35E69B', 0.37, 0.67], ['#F22964', 0.74, 1]].forEach(([col, a, b]) => {
    x.fillStyle = col; x.fillRect(W - 70 - (W - 140) * b, 426, (W - 140) * (b - a), 8);
  });
  x.direction = 'rtl'; x.textAlign = 'right';
  x.fillStyle = '#35E69B'; x.font = '700 30px Cairo, sans-serif'; x.fillText('بطاقة دخول · ورشة', W - 130, 150);
  x.fillStyle = '#FFFFFF'; x.font = '800 54px Montserrat, Cairo, sans-serif';
  x.direction = 'ltr'; x.textAlign = 'right'; x.fillText(fit(x, ws ? ws.title : 'Beit Lahia Tech', W - 260), W - 130, 230);
  x.direction = 'rtl';
  if (ws && ws.titleAr) { x.fillStyle = '#B8C2D6'; x.font = '600 32px Cairo, sans-serif'; x.fillText(fit(x, ws.titleAr, W - 260), W - 130, 290); }
  const meta = ws ? [ws.date ? arDate(ws.date) : '', ws.time, placeText(ws)].filter(Boolean).join('  ·  ') : '';
  if (meta) { x.fillStyle = '#E6E9F0'; x.font = '600 28px Cairo, sans-serif'; x.fillText(fit(x, meta, W - 260), W - 130, 360); }
  x.textAlign = 'center';
  if (name) {
    x.fillStyle = '#4A5468'; x.font = '600 28px Cairo, sans-serif'; x.fillText('صاحب البطاقة', W / 2, 520);
    x.fillStyle = '#0B1020'; x.font = '800 52px Cairo, sans-serif'; x.fillText(fit(x, name, W - 260), W / 2, 590);
  }
  const qr = qrCanvas(qrPayload(location.origin, code.id, code.wid), 560, 2);
  if (qr) { x.imageSmoothingEnabled = false; x.drawImage(qr, (W - 560) / 2, 630, 560, 560); }
  x.fillStyle = '#4A5468'; x.font = '500 24px Menlo, Consolas, monospace'; x.direction = 'ltr'; x.fillText(code.id, W / 2, 1230);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `beit-lahia-pass-${code.id.slice(0, 6)}.png`;
  document.body.append(a); a.click(); a.remove();
});

$('share-btn').addEventListener('click', () => {
  navigator.share({ title: 'بطاقة الدخول للورشة', url: location.href }).catch(() => {});
});

function fit(x, text, max) {
  let t = String(text);
  while (t.length > 3 && x.measureText(t).width > max) t = t.slice(0, -2);
  return t === String(text) ? t : `${t}…`;
}
function roundRect(x, X, Y, w, hgt, r, topOnly = false) {
  x.beginPath();
  x.moveTo(X + r, Y); x.lineTo(X + w - r, Y); x.quadraticCurveTo(X + w, Y, X + w, Y + r);
  if (topOnly) { x.lineTo(X + w, Y + hgt); x.lineTo(X, Y + hgt); } else {
    x.lineTo(X + w, Y + hgt - r); x.quadraticCurveTo(X + w, Y + hgt, X + w - r, Y + hgt);
    x.lineTo(X + r, Y + hgt); x.quadraticCurveTo(X, Y + hgt, X, Y + hgt - r);
  }
  x.lineTo(X, Y + r); x.quadraticCurveTo(X, Y, X + r, Y); x.closePath();
}
