// Beit Lahia Tech — check-in passes (QR) and phone numbers, shared by /workshop, /pass and /admin.
// A registration's check-in code is its workshopRegs document id (random, 20 characters). The QR holds the
// pass link /pass?c=<id>&w=<workshop id>, so a normal phone camera opens the pass, and the admin scanner
// reads the code out of it. The person's name rides in the #fragment (never sent to the server).

/** the link printed in the QR (no name: the QR stays short and has nothing personal in it) */
export const qrPayload = (origin, regId, wid) => `${origin}/pass?c=${encodeURIComponent(regId)}${wid ? `&w=${encodeURIComponent(wid)}` : ''}`;

/** the link sent to the person (the pass page shows their name from the fragment) */
export const passLink = (origin, regId, wid, name = '') => `${qrPayload(origin, regId, wid)}${name ? `#${encodeURIComponent(name)}` : ''}`;

const ID_RE = /^[A-Za-z0-9]{12,40}$/;
const WID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/** whatever the scanner read (a pass link or a bare code) → { id, wid } or null */
export function parseCheckinCode(text) {
  const s = String(text || '').trim();
  if (ID_RE.test(s)) return { id: s, wid: '' };
  try {
    const u = new URL(s);
    const id = u.searchParams.get('c') || '';
    const wid = u.searchParams.get('w') || '';
    if (ID_RE.test(id)) return { id, wid: WID_RE.test(wid) ? wid : '' };
  } catch { /* not a link */ }
  return null;
}

/** QR image (data: URL) for any text; needs /vendor/qrcode.js on the page */
export function qrDataUrl(text, cell = 8, margin = 2) {
  if (typeof window === 'undefined' || typeof window.qrcode !== 'function') return '';
  try { const q = window.qrcode(0, 'M'); q.addData(String(text)); q.make(); return q.createDataURL(cell, margin); } catch { return ''; }
}

/** draw the QR on a canvas (crisp, any size) — used for «save the pass as an image» */
export function qrCanvas(text, size = 512, margin = 4) {
  if (typeof window.qrcode !== 'function') return null;
  const q = window.qrcode(0, 'M'); q.addData(String(text)); q.make();
  const n = q.getModuleCount(); const cells = n + margin * 2; const s = Math.floor(size / cells) || 1;
  const c = document.createElement('canvas'); c.width = c.height = s * cells;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.fillStyle = '#0B1020';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) x.fillRect((k + margin) * s, (r + margin) * s, s, s);
  return c;
}

const latinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660).replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6F0);

/**
 * Any way a Gaza / Palestine number gets written → international digits for wa.me (no "+"), or '' if it isn't a number.
 *   0599 123 456 · 599123456 · 00970599123456 · +970 0599123456 · ‎+972-59-912-3456 → 970599123456 / 972599123456
 * Local numbers (05x / 5x, 9 digits) become +970. A number already written with +972 stays +972 (some people
 * use it on WhatsApp); a stray 0 after the country code is dropped. Other countries pass through unchanged.
 */
export function waDigits(v) {
  let s = latinDigits(v).replace(/[\s\-().\u200E\u200F\u202A-\u202E]/g, '');
  if (!s) return '';
  if (s.startsWith('+')) s = s.slice(1);
  else if (s.startsWith('00')) s = s.slice(2);
  else if (/^0?5\d{8}$/.test(s)) s = `970${s.replace(/^0/, '')}`;
  s = s.replace(/^(970|972)0(?=5\d{8}$)/, '$1');
  return /^[1-9]\d{7,14}$/.test(s) ? s : '';
}
/** "+970599123456" style (what the site's forms store), or '' */
export const intlPhone = (v) => { const d = waDigits(v); return d ? `+${d}` : ''; };
