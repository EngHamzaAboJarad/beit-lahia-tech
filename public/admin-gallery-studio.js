// Admin › «استوديو المعرض»: turn workshop photos and screen captures (Meet, Zoom…) into gallery
// pictures in the brand look. Upload / drop / paste many at once, crop away the window and meeting
// bars, pixelate faces or names, pick a background (night, aurora, strawberry, sand, the photo itself
// blurred, Beit Lahia at night…), a size and the texts, then save them all to the gallery as drafts
// or download them. Nothing is stored until you save: the photos live in memory, and the look you
// picked is remembered in this browser.
// «بوست جاهز»: a post / carousel designed elsewhere. The pictures stay as they are (crop and pixelate
// only, no background or texts), in the order you set, each with its caption, under one description.
import { NIGHT, NIGHT2, MINT, BERRY, MOSAICS, renderElement } from './social-templates.js';
import { fontCss, measure, fontsReady, toDataUrl } from './admin-social.js?v=13';
import { arDate } from './workshop-shared.js';

const $ = (id) => document.getElementById(id);
const STORE = 'blt-gstudio-v1';
const MAX_PHOTOS = 40;

export const SIZES = {
  wide: [1920, 1080, 'أفقي 16:9'],
  classic: [1600, 1200, 'أفقي 4:3'],
  square: [1080, 1080, 'مربع 1:1'],
  post: [1080, 1350, 'منشور 4:5'],
  story: [1080, 1920, 'ستوري 9:16'],
};
// text = titles, sub = second line + footer, accent = the card's edge, card = behind the photo
const THEMES = {
  night: { name: 'ليل', bg: NIGHT, text: '#FFFFFF', sub: '#C3CCDA', accent: MINT, grid: '#FFFFFF', glow: true },
  aurora: { name: 'شفق', stops: ['#0B1020', '#0D3B35', '#0E7A5C'], text: '#FFFFFF', sub: '#CFF7E6', accent: MINT, grid: '#FFFFFF', glow: true },
  berry: { name: 'فراولة', stops: ['#2A0815', '#8E0F35', '#F22964'], text: '#FFFFFF', sub: '#FFD6E1', accent: '#FFFFFF', grid: '#FFFFFF' },
  deep: { name: 'كحلي', stops: ['#070A14', '#1E2A44'], text: '#FFFFFF', sub: '#AEB9CC', accent: BERRY, grid: '#FFFFFF', glow: true },
  sand: { name: 'رملي', bg: '#F4F1ED', text: NIGHT, sub: '#4A5468', accent: '#047857', grid: NIGHT, light: true },
  mint: { name: 'نعناع', stops: ['#A0F6D9', '#35E69B'], text: NIGHT, sub: '#065F46', accent: NIGHT, grid: NIGHT, light: true },
  blur: { name: 'الصورة مموّهة', photo: 'self', dim: 0.45, text: '#FFFFFF', sub: '#E5E9F0', accent: '#FFFFFF' },
  city: { name: 'بيت لاهيا', photo: '/img/beit-lahia-night.jpg', dim: 0.5, text: '#FFFFFF', sub: '#E5E9F0', accent: MINT },
};
const DEFAULTS = {
  theme: 'night', size: 'wide', title: '', sub: '', tag: '',
  logo: true, mosaic: true, chrome: false, footer: true, border: true, fit: 'contain', pad: 6, radius: 26,
  capOn: false, // write each photo's caption on the picture too, under the card
  asIs: false, // «بوست جاهز»: the pictures as they are, no frame
};
const SOCIAL_MAX = 10; // a carousel on Instagram
export const CAP_MAX = 280; // a photo's caption
export const DESC_MAX = 600; // the post (album) description

let deps; // { h, toast, setBusy, saveToGallery(files, captions, album, desc) → { done, failed }, workshops(), albums(), albumDesc(name) }
let started = false;
const state = {
  st: (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; } catch { return { ...DEFAULTS }; } })(),
  photos: [], // { id, name, img, nw, nh, crop, blurs, caption, cw, ch, fullBlob, fullUrl, smallBlob, smallUrl }
  cur: -1,
};
const st = () => state.st;
const curPhoto = () => state.photos[state.cur];
function saveStyle() { try { localStorage.setItem(STORE, JSON.stringify(state.st)); } catch { /* private mode */ } }

/* =================== photos in, cropped and pixelated =================== */
const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const toBlob = (c, type = 'image/jpeg', q = 0.92) => new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), type, q));
const blobToDataUrl = (b) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(b); });
const loadImg = (blob) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(blob); const img = new Image();
  img.onload = () => resolve(img); // the URL stays: the photo keeps drawing from it
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
  img.src = url;
});

// the cropped photo with its pixelated areas, longest side ≤ maxSide
function drawCropped(p, maxSide) {
  const sx = p.crop.x * p.nw; const sy = p.crop.y * p.nh; const sw = p.crop.w * p.nw; const sh = p.crop.h * p.nh;
  const k = Math.min(1, maxSide / Math.max(sw, sh));
  const c = canvasOf(sw * k, sh * k); const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(p.img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  for (const b of p.blurs) {
    const x0 = Math.max(0, (b.x * p.nw - sx) * k); const y0 = Math.max(0, (b.y * p.nh - sy) * k);
    const x1 = Math.min(c.width, ((b.x + b.w) * p.nw - sx) * k); const y1 = Math.min(c.height, ((b.y + b.h) * p.nh - sy) * k);
    const w = x1 - x0; const h = y1 - y0;
    if (w < 2 || h < 2) continue;
    const block = Math.max(6, Math.round(Math.max(w, h) / 9), Math.round(c.width / 110)); // big blocks: the brand's pixels
    const tiny = canvasOf(Math.ceil(w / block), Math.ceil(h / block));
    tiny.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, tiny.width, tiny.height);
    g.imageSmoothingEnabled = false;
    g.drawImage(tiny, 0, 0, tiny.width, tiny.height, x0, y0, w, h);
    g.imageSmoothingEnabled = true;
  }
  return c;
}
async function rebuild(p) {
  const full = drawCropped(p, 2400); const small = drawCropped(p, 720);
  const [fb, sb] = await Promise.all([toBlob(full, 'image/jpeg', 0.93), toBlob(small, 'image/jpeg', 0.82)]);
  if (p.fullUrl) URL.revokeObjectURL(p.fullUrl);
  if (p.smallUrl) URL.revokeObjectURL(p.smallUrl);
  Object.assign(p, { cw: full.width, ch: full.height, fullBlob: fb, smallBlob: sb, fullUrl: URL.createObjectURL(fb), smallUrl: URL.createObjectURL(sb) });
}

async function addFiles(list) {
  const files = [...list].filter((f) => /^image\/(jpeg|png|webp|gif|bmp)$/.test(f.type));
  if (!files.length) { deps.toast('اختار صور (JPG أو PNG أو WebP)', true); return; }
  const room = MAX_PHOTOS - state.photos.length;
  if (room <= 0) { deps.toast(`الاستوديو بياخد ${MAX_PHOTOS} صورة بالمرة. احفظ أو احذف شوي أول.`, true); return; }
  if (st().asIs) files.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
  const take = files.slice(0, room);
  const prog = $('gs-progress');
  let failed = 0;
  for (let i = 0; i < take.length; i++) {
    prog.hidden = false; prog.textContent = `جاري تجهيز ${i + 1} من ${take.length}…`;
    try {
      const img = await loadImg(take[i]);
      const p = { id: Math.random().toString(36).slice(2, 10), name: take[i].name || 'لقطة شاشة', img, nw: img.naturalWidth, nh: img.naturalHeight, crop: { x: 0, y: 0, w: 1, h: 1 }, blurs: [], caption: '' };
      // same screen size as a photo already here? take its crop and blur areas (all the captures from one meeting)
      const twin = state.photos.find((q) => q.nw === p.nw && q.nh === p.nh && (q.crop.w < 1 || q.crop.h < 1 || q.blurs.length));
      if (twin) { p.crop = { ...twin.crop }; p.blurs = twin.blurs.map((b) => ({ ...b })); }
      await rebuild(p);
      state.photos.push(p);
      if (state.cur < 0) state.cur = 0;
    } catch (e) { console.error(e); failed++; }
  }
  prog.textContent = failed ? `انضافت ${take.length - failed}، وما قدرت أفتح ${failed}.` : '';
  prog.hidden = !failed;
  if (files.length > take.length) deps.toast(`انضاف أول ${take.length} بس (الحد ${MAX_PHOTOS} صورة)`, true);
  if (state.cur < 0 && state.photos.length) state.cur = 0;
  else if (take.length - failed > 0) state.cur = state.photos.length - (take.length - failed);
  refresh();
}

function moveCurrent(d) {
  const k = state.cur; const j = k + d;
  if (k < 0 || j < 0 || j >= state.photos.length) return;
  [state.photos[k], state.photos[j]] = [state.photos[j], state.photos[k]];
  state.cur = j; refresh();
}
function removeCurrent() {
  const p = curPhoto(); if (!p) return;
  [p.fullUrl, p.smallUrl, p.img.src].forEach((u) => u && URL.revokeObjectURL(u));
  state.photos.splice(state.cur, 1);
  state.cur = Math.min(state.cur, state.photos.length - 1);
  refresh();
}

/* =================== the frame: one photo on the brand background, as SVG =================== */
function layout(p, s) {
  const [W, H] = SIZES[s.size] || SIZES.wide;
  const u = Math.min(W, H) / 1080;
  const m = Math.round(Math.min(W, H) * s.pad / 100);
  const narrow = W < 1300; // the logo goes on its own row above the title
  const title = s.title.trim(); const sub = s.sub.trim();
  const titleSize = Math.round((narrow ? 60 : 56) * u); const subSize = Math.round(30 * u);
  const logoH = Math.round((narrow ? 78 : 84) * u);
  const textH = (title ? titleSize * 1.2 : 0) + (sub ? subSize * 1.55 : 0);
  let headH = 0;
  if (narrow) headH = (s.logo ? logoH : 0) + (s.logo && textH ? 34 * u : 0) + textH;
  else headH = Math.max(s.logo ? logoH : 0, textH);
  const footH = s.footer || s.tag.trim() ? Math.round(40 * u) : 0;
  const gap = Math.round(38 * u);
  // the caption under the card: one or two lines
  const capSize = Math.round(32 * u);
  const capLines = s.capOn && p ? capWrap((p.caption || '').trim(), capSize, W - 2 * m) : [];
  const capH = capLines.length ? Math.round(capLines.length * capSize * 1.4 + gap * 0.55) : 0;
  const ax = m; const ay = m + (headH ? headH + gap : 0);
  const aw = W - 2 * m; const ah = H - m - (footH ? footH + gap * 0.8 : 0) - capH - ay;
  const bar = s.chrome ? Math.round(46 * u) : 0;
  const ar = p ? p.cw / p.ch : 16 / 9;
  let iw; let ih;
  if (s.fit === 'cover') { iw = aw; ih = ah - bar; } else { iw = Math.min(aw, (ah - bar) * ar); ih = iw / ar; }
  const card = { x: ax + (aw - iw) / 2, y: ay + (ah - ih - bar) / 2, w: iw, h: ih + bar, bar };
  return { W, H, u, m, narrow, title, sub, titleSize, subSize, logoH, headH, footH, card, capSize, capLines, gap };
}
// a caption as at most two balanced lines that fit maxW (the renderer shrinks whatever still doesn't)
function capWrap(text, size, maxW) {
  if (!text) return [];
  const one = text.replace(/\s+/g, ' ');
  if (measure(one, size, 700, 'Cairo') <= maxW) return [one];
  const words = one.split(' ');
  if (words.length < 2) return [one];
  let best = null;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(' '); const b = words.slice(k).join(' ');
    const w = Math.max(measure(a, size, 700, 'Cairo'), measure(b, size, 700, 'Cairo'));
    if (!best || w < best.w) best = { w, lines: [a, b] };
  }
  return best.lines;
}

const f1 = (n) => Math.round(n * 10) / 10;
// src: { photo, bg, cityBg } — the URLs to draw (blob: on screen, data: when exporting)
let svgSeq = 0; // every SVG on the page needs its own ids (the preview and the thumbnails sit side by side)
function frameSvg(p, s, src, css = '') {
  const q = `g${(svgSeq++).toString(36)}`;
  const L = layout(p, s); const { W, H, u, m, card } = L;
  const th = THEMES[s.theme] || THEMES.night;
  let defs = ''; let out = ''; let n = 0;
  const el = (e) => renderElement(e, { measure }, 900 + n++);

  // background
  if (th.photo) {
    const href = th.photo === 'self' ? src.bg : src.cityBg;
    const blur = th.photo === 'self' ? 42 : 10;
    defs += `<filter id="${q}bl" x="0" y="0" width="100%" height="100%"><feGaussianBlur stdDeviation="${f1(blur * u)}"/></filter>`;
    out += `<rect width="${W}" height="${H}" fill="${NIGHT}"/>`;
    if (href) out += `<image href="${href}" x="${f1(-W * 0.08)}" y="${f1(-H * 0.08)}" width="${f1(W * 1.16)}" height="${f1(H * 1.16)}" preserveAspectRatio="xMidYMid slice" filter="url(#${q}bl)"/>`;
    out += `<rect width="${W}" height="${H}" fill="${NIGHT}" opacity="${th.dim}"/>`;
  } else if (th.stops) {
    defs += `<linearGradient id="${q}bg" x1="0" y1="0" x2=".45" y2="1">${th.stops.map((c, k) => `<stop offset="${k / (th.stops.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
    out += `<rect width="${W}" height="${H}" fill="url(#${q}bg)"/>`;
  } else out += `<rect width="${W}" height="${H}" fill="${th.bg}"/>`;
  if (th.glow) {
    defs += `<radialGradient id="${q}gm"><stop offset="0" stop-color="${MINT}" stop-opacity=".2"/><stop offset="1" stop-color="${MINT}" stop-opacity="0"/></radialGradient>`
      + `<radialGradient id="${q}gb"><stop offset="0" stop-color="${BERRY}" stop-opacity=".16"/><stop offset="1" stop-color="${BERRY}" stop-opacity="0"/></radialGradient>`;
    const r = Math.max(W, H) * 0.42;
    out += `<circle cx="${W}" cy="0" r="${f1(r)}" fill="url(#${q}gm)"/><circle cx="0" cy="${H}" r="${f1(r)}" fill="url(#${q}gb)"/>`;
  }
  if (th.grid) {
    const g = Math.round(54 * u);
    defs += `<pattern id="${q}gr" width="${g}" height="${g}" patternUnits="userSpaceOnUse"><path d="M${g} 0H0V${g}" fill="none" stroke="${th.grid}" stroke-opacity="${th.light ? 0.05 : 0.04}" stroke-width="${f1(2 * u)}"/></pattern>`;
    out += `<rect width="${W}" height="${H}" fill="url(#${q}gr)"/>`;
  }

  // pixels peeking out from behind the card (top-left and bottom-right corners)
  if (s.mosaic && p) {
    const c = Math.round(26 * u);
    out += el({ type: 'mosaic', pattern: MOSAICS.corner, x: Math.round(card.x - c), y: Math.round(card.y - c), cell: c });
    out += el({ type: 'mosaic', pattern: MOSAICS.thick, x: Math.round(card.x + card.w - 4 * c), y: Math.round(card.y + card.h - 3 * c), cell: c });
  }

  // the card: glow, shadow, window bar, photo, edge
  if (p) {
    const r = Math.min(Math.round(s.radius * u), card.w / 4, card.h / 4);
    const { x, y, w, h, bar } = card;
    if (!th.light) {
      defs += `<filter id="${q}gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${f1(70 * u)}"/></filter>`;
      out += `<rect x="${f1(x + w * 0.06)}" y="${f1(y + h * 0.1)}" width="${f1(w * 0.88)}" height="${f1(h * 0.85)}" rx="${r}" fill="${th.accent}" opacity=".22" filter="url(#${q}gl)"/>`;
    }
    defs += `<filter id="${q}sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="${f1(22 * u)}" stdDeviation="${f1(28 * u)}" flood-color="#000" flood-opacity="${th.light ? 0.2 : 0.5}"/></filter>`
      + `<clipPath id="${q}cl"><rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}"/></clipPath>`;
    out += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}" fill="${th.light ? '#FFFFFF' : NIGHT2}" filter="url(#${q}sh)"/>`;
    out += `<g clip-path="url(#${q}cl)">`;
    if (bar) {
      const cy = y + bar / 2; const dot = 7 * u;
      out += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${bar}" fill="${th.light ? '#ECE8E2' : '#161E33'}"/>`;
      [BERRY, '#FFD166', MINT].forEach((c, k) => { out += `<circle cx="${f1(x + 30 * u + k * 26 * u)}" cy="${f1(cy)}" r="${f1(dot)}" fill="${c}"/>`; });
      const pw = Math.min(w * 0.4, 440 * u); const ph = bar * 0.56;
      out += `<rect x="${f1(x + w / 2 - pw / 2)}" y="${f1(cy - ph / 2)}" width="${f1(pw)}" height="${f1(ph)}" rx="${f1(ph / 2)}" fill="${th.light ? '#FFFFFF' : '#0B1020'}" opacity=".85"/>`;
      out += `<text class="en" x="${f1(x + w / 2)}" y="${f1(cy + bar * 0.11)}" font-size="${f1(bar * 0.3)}" font-weight="600" fill="${th.light ? '#4A5468' : '#9AA6BC'}" text-anchor="middle" direction="ltr">beitlahia.tech</text>`;
    }
    out += `<image href="${src.photo}" x="${f1(x)}" y="${f1(y + bar)}" width="${f1(w)}" height="${f1(h - bar)}" preserveAspectRatio="xMidYMid slice"/></g>`;
    if (s.border) out += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}" fill="none" stroke="${th.accent}" stroke-opacity="${th.light ? 0.5 : 0.42}" stroke-width="${f1(3 * u)}"/>`;
  }

  // the caption, centred under the card
  if (p && L.capLines.length) {
    const cy = card.y + card.h + L.gap * 0.55 + L.capSize * 0.95;
    out += el({ type: 'text', text: L.capLines.join('\n'), x: W / 2, y: Math.round(cy), size: L.capSize, weight: 700, color: th.text, align: 'middle', font: 'ar', maxW: W - 2 * m, lh: 1.4 });
  }

  // header: logo + title + second line (Arabic, right-aligned)
  const lock = { type: 'lockup', x: m, y: m, h: L.logoH, color: th.text };
  if (s.logo) out += el(lock);
  const tTop = L.narrow && s.logo ? m + L.logoH + 34 * u : m;
  const logoW = s.logo && !L.narrow ? L.logoH * 3.9 + 40 * u : 0;
  const maxW = W - 2 * m - logoW;
  let ty = tTop + L.titleSize * 0.92;
  if (L.title) { out += el({ type: 'text', text: L.title, x: W - m, y: Math.round(ty), size: L.titleSize, weight: 800, color: th.text, align: 'right', font: 'ar', maxW, lh: 1.2 }); ty += L.subSize * 1.55; }
  else ty = tTop + L.subSize;
  if (L.sub) out += el({ type: 'text', text: L.sub, x: W - m, y: Math.round(L.title ? ty + L.subSize * 0.1 : ty), size: L.subSize, weight: 600, color: th.sub, align: 'right', font: 'ar', maxW, lh: 1.2 });

  // footer: the tag on the right, the site on the left
  if (L.footH) {
    const fy = Math.round(H - m - L.footH * 0.18); const fs = Math.round(27 * u);
    if (s.tag.trim()) out += el({ type: 'text', text: s.tag.trim(), x: W - m, y: fy, size: fs, weight: 700, color: th.sub, align: 'right', font: 'ar', maxW: s.footer ? W / 2 - m : W - 2 * m });
    if (s.footer) {
      const sq = Math.round(12 * u);
      out += `<rect x="${m}" y="${f1(fy - fs * 0.62)}" width="${sq}" height="${sq}" fill="${MINT}"/><rect x="${m + sq}" y="${f1(fy - fs * 0.62 + sq)}" width="${sq}" height="${sq}" fill="${BERRY}"/>`;
      out += el({ type: 'text', text: 'beitlahia.tech', x: m + sq * 3, y: fy, size: fs, weight: 700, color: th.sub, align: 'left', font: 'en' });
    }
  }

  const style = `${css}.ar{font-family:Cairo,Tahoma,sans-serif}.en{font-family:Montserrat,Arial,sans-serif}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${style}</style><defs>${defs}</defs>${out}</svg>`;
}
// «بوست جاهز»: just the picture (cropped and pixelated), at its own size
function plainSvg(p, href) {
  const W = p ? p.cw : 1080; const H = p ? p.ch : 1350;
  const body = p ? `<image href="${href}" width="${W}" height="${H}" preserveAspectRatio="none"/>` : `<rect width="${W}" height="${H}" fill="${NIGHT2}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;
}
const screenSrc = (p) => ({ photo: p?.fullUrl, bg: p?.smallUrl, cityBg: THEMES.city.photo });
const thumbSrc = (p) => ({ photo: p?.smallUrl, bg: p?.smallUrl, cityBg: THEMES.city.photo });

/* =================== export: the frame as a JPEG =================== */
async function exportPhoto(p) {
  const s = st();
  if (s.asIs) return p.fullBlob; // a ready design: the picture itself
  const [W, H] = SIZES[s.size] || SIZES.wide;
  const th = THEMES[s.theme] || THEMES.night;
  const [css, photo, bg, cityBg] = await Promise.all([
    fontCss().catch(() => ''), blobToDataUrl(p.fullBlob),
    th.photo === 'self' ? blobToDataUrl(p.smallBlob) : '', th.photo && th.photo !== 'self' ? toDataUrl(th.photo) : '',
  ]);
  await fontsReady;
  const svg = frameSvg(p, s, { photo, bg, cityBg }, css);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image(); img.src = url; await img.decode();
    await new Promise((r) => setTimeout(r, 120)); // let the inlined fonts settle inside the SVG image
    const c = canvasOf(W, H); const g = c.getContext('2d');
    g.fillStyle = NIGHT; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0, W, H);
    return await toBlob(c, 'image/jpeg', 0.92);
  } finally { URL.revokeObjectURL(url); }
}
function download(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fileName = (k) => `beitlahia-gallery-${String(k + 1).padStart(2, '0')}.jpg`;

async function downloadCurrent() {
  const p = curPhoto(); if (!p) return;
  const b = $('gs-dl'); deps.setBusy(b, true);
  try { download(await exportPhoto(p), fileName(state.cur)); } catch (e) { console.error(e); deps.toast('ما زبط التنزيل، جرّب كمان مرة', true); } finally { deps.setBusy(b, false); }
}
async function downloadAll() {
  if (!state.photos.length) return;
  const b = $('gs-dl-all'); deps.setBusy(b, true);
  const prog = $('gs-progress'); prog.hidden = false;
  try {
    for (let k = 0; k < state.photos.length; k++) {
      prog.textContent = `جاري تنزيل ${k + 1} من ${state.photos.length}…`;
      download(await exportPhoto(state.photos[k]), fileName(k));
      await new Promise((r) => setTimeout(r, 350)); // browsers drop downloads fired too close together
    }
    prog.textContent = 'نزلوا كلهم. إذا المتصفح سألك عن «تنزيل ملفات متعددة» اسمحله.';
  } catch (e) { console.error(e); prog.textContent = 'وقف التنزيل بالنص، جرّب كمان مرة.'; } finally { deps.setBusy(b, false); }
}
async function saveAll() {
  const n = state.photos.length; if (!n) return;
  const b = $('gs-save'); deps.setBusy(b, true);
  const prog = $('gs-progress'); prog.hidden = false;
  try {
    const files = []; const caps = [];
    for (let k = 0; k < n; k++) {
      prog.textContent = `جاري تجهيز ${k + 1} من ${n}…`;
      const p = state.photos[k];
      files.push(new File([await exportPhoto(p)], fileName(k), { type: 'image/jpeg' }));
      caps.push((p.caption || '').trim().slice(0, CAP_MAX));
    }
    prog.textContent = 'جاري الرفع على المعرض…';
    const album = ($('gs-album').value.trim() || fallbackAlbum()).slice(0, 80);
    const desc = $('gs-desc').value.trim().slice(0, DESC_MAX);
    const { done, failed, ids = [] } = await deps.saveToGallery(files, caps, album, desc);
    // «اقترحها على السوشيال»: the saved photos wait in the social studio, to publish or cancel there
    let suggested = false;
    if (ids.length && $('gs-suggest')?.checked && deps.suggestToSocial) {
      try { await deps.suggestToSocial(ids, album, desc); suggested = true; } catch (e) { console.error(e); deps.toast('انحفظت بالمعرض، بس ما قدرنا نقترحها على السوشيال', true); }
    }
    prog.replaceChildren(
      failed ? `انرفعت ${done}، وفشلت ${failed}. ` : `انحفظت ${done} صورة بألبوم «${album || 'صور متنوعة'}» كمسودات. انشرها من تبويب المعرض لما تكون جاهزة. `,
      suggested ? 'وانبعتت كاقتراح لاستوديو السوشيال. ' : '',
      deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', 'data-goto': 'gallery' }, 'روح للمعرض'),
      suggested && deps.canStudio ? ' ' : '',
      suggested && deps.canStudio ? deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', 'data-goto': 'studio' }, 'روح للسوشيال') : '',
    );
  } catch (e) { console.error(e); prog.textContent = 'صار خطأ بالحفظ، جرّب كمان مرة.'; } finally { deps.setBusy(b, false); }
}

/* =================== the screen =================== */
function renderStage() {
  const s = st(); const p = curPhoto();
  const stage = $('gs-stage');
  if (s.asIs) {
    const W = p ? p.cw : 1080; const H = p ? p.ch : 1350;
    stage.style.setProperty('--ar', String(H / W));
    $('gs-size').textContent = p ? `${W} × ${H}` : '';
    stage.classList.toggle('is-empty', !p);
    stage.innerHTML = p ? plainSvg(p, p.fullUrl)
      : plainSvg(null).replace('</svg>', `<text x="540" y="640" font-size="44" font-weight="700" fill="#9AA6BC" text-anchor="middle" direction="rtl" font-family="Cairo,Tahoma,sans-serif">ارفع صور البوست الجاهز</text><text x="540" y="710" font-size="32" font-weight="600" fill="#6B7891" text-anchor="middle" direction="rtl" font-family="Cairo,Tahoma,sans-serif">(كاروسيل: بترتيب أسماء الملفات)</text></svg>`);
    renderNav(p);
    return;
  }
  const [W, H] = SIZES[s.size] || SIZES.wide;
  stage.style.setProperty('--ar', String(H / W));
  $('gs-size').textContent = `${W} × ${H}`;
  if (!p) {
    stage.classList.add('is-empty');
    stage.innerHTML = frameSvg(null, s, {}).replace('</svg>', '') // the empty frame with a hint in the middle
      + `<text class="ar" x="${W / 2}" y="${H / 2}" font-size="${Math.min(W, H) / 22}" font-weight="700" fill="${THEMES[s.theme]?.light ? '#4A5468' : '#9AA6BC'}" text-anchor="middle" direction="rtl">ارفع صور أو الصق لقطة شاشة (Ctrl+V)</text></svg>`;
  } else {
    stage.classList.remove('is-empty');
    stage.innerHTML = frameSvg(p, s, screenSrc(p)); // texts are escaped by the renderer
  }
  renderNav(p);
}
function renderNav(p) {
  $('gs-count').textContent = state.photos.length ? `${state.cur + 1} / ${state.photos.length}` : '';
  ['gs-prev', 'gs-next', 'gs-crop-btn', 'gs-del', 'gs-move-prev', 'gs-move-next'].forEach((id) => { $(id).disabled = !p; });
  if (p) {
    $('gs-prev').disabled = $('gs-move-prev').disabled = state.cur === 0;
    $('gs-next').disabled = $('gs-move-next').disabled = state.cur === state.photos.length - 1;
  }
}
function renderStrip() {
  const s = st();
  const items = state.photos.map((p, k) => {
    const b = deps.h('button', { type: 'button', class: 'gs-thumb', 'aria-current': String(k === state.cur), 'aria-label': `صورة ${k + 1}`, onclick: () => { state.cur = k; refresh(); } });
    const art = deps.h('span', { class: 'gs-thumb-art', 'aria-hidden': 'true' });
    art.innerHTML = s.asIs ? plainSvg(p, p.smallUrl) : frameSvg(p, s, thumbSrc(p));
    b.append(art, deps.h('span', { class: 'gs-n' }, String(k + 1)));
    if (p.blurs.length) b.append(deps.h('span', { class: 'gs-flag', title: 'فيها تمويه' }, '▦'));
    if ((p.caption || '').trim()) b.append(deps.h('span', { class: 'gs-capflag', title: p.caption.trim() }, 'كابشن'));
    return b;
  });
  const add = deps.h('label', { class: 'gs-thumb gs-add', title: 'ضيف صور' },
    deps.h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => { addFiles(e.target.files); e.target.value = ''; } }),
    deps.h('span', { 'aria-hidden': 'true' }, '+'), deps.h('span', { class: 'visually-hidden' }, 'ضيف صور'));
  $('gs-strip').replaceChildren(...items, add);
  $('gs-strip').querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function renderForm() {
  const s = st(); const n = state.photos.length; const p = curPhoto();
  document.querySelectorAll('#gs-themes .gs-theme').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === s.theme)));
  document.querySelectorAll('#gs-sizes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === s.size)));
  [['gs-title', 'title'], ['gs-sub', 'sub'], ['gs-tag', 'tag']].forEach(([id, k]) => { if (document.activeElement !== $(id)) $(id).value = s[k]; });
  [['gs-logo', 'logo'], ['gs-mosaic', 'mosaic'], ['gs-chrome', 'chrome'], ['gs-footer', 'footer'], ['gs-border', 'border']].forEach(([id, k]) => { $(id).checked = !!s[k]; });
  $('gs-fit').value = s.fit; $('gs-pad').value = s.pad; $('gs-radius').value = s.radius;
  $('gs-photo-box').hidden = !p;
  document.querySelectorAll('.gs-mode [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String((b.id === 'gs-mode-ready') === !!s.asIs)));
  $('gs-mode-note').hidden = !s.asIs;
  $('gs-frame-opts').hidden = !!s.asIs;
  $('gs-cap-on-box').hidden = !!s.asIs;
  $('gs-album-note').textContent = s.asIs
    ? `صور البوست بتنحفظ مع بعض بهالألبوم، بنفس الترتيب، وعلى الموقع بتطلع ككرت واحد.${n > SOCIAL_MAX ? ` على السوشيال الكاروسيل لحد ${SOCIAL_MAX} صور: أول ${SOCIAL_MAX} بس بتنتشر.` : ''}`
    : 'الصور بتنحفظ مع بعض بهالألبوم، وعلى الموقع بتطلع ككرت واحد بيفتح عليهم. فاضي = العنوان.';
  if (p && document.activeElement !== $('gs-caption')) $('gs-caption').value = p.caption;
  $('gs-cap-on').checked = !!s.capOn;
  capCount();
  $('gs-cap-all').disabled = n < 2;
  $('gs-album').placeholder = s.asIs ? 'مثلاً: 5 نصائح لأول مشروع' : s.title.trim() || 'صور متنوعة';
  descCount();
  $('gs-save-label').textContent = s.asIs ? (n ? `احفظ البوست (${n} ${n === 1 ? 'صورة' : n === 2 ? 'صورتين' : 'صور'})` : 'احفظ البوست') : n ? `احفظ بالمعرض (${n})` : 'احفظ بالمعرض';
  ['gs-save', 'gs-dl-all'].forEach((id) => { $(id).disabled = !n; });
  $('gs-dl').disabled = !p;
}
function refresh() { renderForm(); renderStage(); renderStrip(); }
const fallbackAlbum = () => (st().asIs ? '' : st().title.trim());
const capCount = () => { const v = $('gs-caption').value.length; $('gs-cap-n').textContent = v ? `${v} / ${CAP_MAX}` : ''; };
const descCount = () => { const v = $('gs-desc').value.length; $('gs-desc-n').textContent = v ? `${v} / ${DESC_MAX}` : ''; };
// picking an album that already has a description brings it back (unless you've written your own)
let descTyped = false;
function albumChanged() {
  if (descTyped && $('gs-desc').value.trim()) return;
  const name = $('gs-album').value.trim() || fallbackAlbum();
  const saved = deps.albumDesc?.(name) || '';
  $('gs-desc').value = saved; descTyped = false;
  $('gs-desc-note').textContent = saved ? 'هاد الوصف المحفوظ لهالألبوم. عدّله هون وبيتحدّث للبوست كله.' : 'بيطلع فوق صور الألبوم على الموقع. اختياري.';
  descCount();
}
let raf = 0;
const refreshSoon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { renderStage(); renderForm(); clearTimeout(refreshSoon.t); refreshSoon.t = setTimeout(renderStrip, 250); }); };
function setStyle(patch) { Object.assign(state.st, patch); saveStyle(); refreshSoon(); }

function buildPickers() {
  $('gs-themes').replaceChildren(...Object.entries(THEMES).map(([k, t]) => {
    const sw = deps.h('span', { class: 'gs-sw', 'aria-hidden': 'true' });
    sw.style.background = t.photo ? (t.photo === 'self' ? 'linear-gradient(135deg,#3a4660,#0B1020)' : `linear-gradient(rgba(11,16,32,.45),rgba(11,16,32,.45)), url("${t.photo}") center/cover`)
      : t.stops ? `linear-gradient(160deg, ${t.stops.join(', ')})` : t.bg;
    sw.append(deps.h('i', { style: `background:${t.accent}` }));
    return deps.h('button', { type: 'button', class: 'gs-theme', role: 'radio', 'data-k': k, onclick: () => setStyle({ theme: k }) }, sw, deps.h('span', {}, t.name));
  }));
  $('gs-sizes').replaceChildren(...Object.entries(SIZES).map(([k, [w, h, name]]) => deps.h('button', { type: 'button', class: 'gs-size', 'data-k': k, title: `${w}×${h}`, onclick: () => setStyle({ size: k }) },
    deps.h('i', { 'aria-hidden': 'true', style: `aspect-ratio:${w}/${h}` }), deps.h('span', {}, name))));
}
function fillAlbums() {
  $('gs-albums').replaceChildren(...(deps.albums?.() || []).map((a) => deps.h('option', { value: a })));
}
function fillWorkshops() {
  const list = (deps.workshops?.() || []).filter((w) => w.titleAr || w.title)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const sel = $('gs-ws');
  sel.replaceChildren(deps.h('option', { value: '' }, list.length ? 'عبّي من ورشة…' : 'ما في ورشات'), ...list.map((w) => deps.h('option', { value: w.id }, w.titleAr || w.title)));
  sel.disabled = !list.length;
  sel.onchange = () => {
    const w = list.find((x) => x.id === sel.value); sel.value = '';
    if (!w) return;
    const d = w.date ? arDate(w.date) : '';
    setStyle({ title: w.titleAr || w.title, sub: [d, w.place].filter(Boolean).join(' · ') || st().sub });
    renderForm();
  };
}

/* =================== crop + pixelate dialog =================== */
const crop = { p: null, box: null, blurs: [], mode: 'crop', aspect: 0, drag: null };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function openCrop() {
  const p = curPhoto(); if (!p) return;
  Object.assign(crop, { p, box: { ...p.crop }, blurs: p.blurs.map((b) => ({ ...b })), mode: 'crop', aspect: 0 });
  $('gs-crop-img').src = p.img.src;
  $('gs-aspect').value = '0';
  setCropMode('crop');
  drawCrop();
  $('gs-crop-dlg').showModal();
}
function setCropMode(mode) {
  crop.mode = mode;
  document.querySelectorAll('#gs-crop-modes [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('gs-crop-stage').dataset.mode = mode;
  $('gs-crop-hint').textContent = mode === 'crop'
    ? 'اسحب الإطار لتحرّكه، والزوايا والأطراف لتكبّره وتصغّره. اللي برا الإطار رح ينقص (أشرطة ميت وويندوز مثلاً).'
    : 'ارسم مربع فوق أي وجه أو اسم أو رقم بدك تخفيه، وبيصير بكسلات. اضغط × لتشيل المربع.';
}
const pct = (v) => `${(v * 100).toFixed(3)}%`;
function drawCrop() {
  const b = crop.box; const box = $('gs-crop-box');
  Object.assign(box.style, { left: pct(b.x), top: pct(b.y), width: pct(b.w), height: pct(b.h) });
  box.classList.toggle('is-locked', !!crop.aspect);
  // everything outside the box goes dark (a frame with a hole: even-odd polygon)
  const [l, t, r, btm] = [b.x, b.y, b.x + b.w, b.y + b.h].map(pct);
  $('gs-crop-dim').style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l} ${t}, ${r} ${t}, ${r} ${btm}, ${l} ${btm}, ${l} ${t})`;
  $('gs-crop-blurs').replaceChildren(...crop.blurs.map((r, k) => {
    const d = deps.h('div', { class: 'gs-blur', style: `left:${pct(r.x)};top:${pct(r.y)};width:${pct(r.w)};height:${pct(r.h)}` },
      deps.h('button', { type: 'button', class: 'gs-blur-x', 'aria-label': 'شيل التمويه', onpointerdown: (e) => e.stopPropagation(), onclick: () => { crop.blurs.splice(k, 1); drawCrop(); } }, '×'));
    return d;
  }));
  const p = crop.p;
  $('gs-crop-size').textContent = `${Math.round(b.w * p.nw)} × ${Math.round(b.h * p.nh)}`;
}
// the biggest box of the chosen aspect inside the current one, centred
function applyAspect() {
  if (!crop.aspect) { drawCrop(); return; }
  const p = crop.p; const rn = crop.aspect * p.nh / p.nw; const b = crop.box;
  let w = b.w; let h = w / rn;
  if (h > b.h) { h = b.h; w = h * rn; }
  if (w > 1) { w = 1; h = w / rn; } if (h > 1) { h = 1; w = h * rn; }
  crop.box = { x: clamp(b.x + (b.w - w) / 2, 0, 1 - w), y: clamp(b.y + (b.h - h) / 2, 0, 1 - h), w, h };
  drawCrop();
}
function cropPointer() {
  const stage = $('gs-crop-stage');
  const at = (e) => { const r = stage.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)]; };
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const [x, y] = at(e);
    const handle = e.target.dataset?.h;
    if (crop.mode === 'blur') {
      const r = { x, y, w: 0, h: 0 }; crop.blurs.push(r);
      crop.drag = { kind: 'blur', r, x0: x, y0: y };
    } else if (handle) crop.drag = { kind: 'resize', h: handle, start: { ...crop.box } };
    else if (e.target.closest('#gs-crop-box')) crop.drag = { kind: 'move', start: { ...crop.box }, x0: x, y0: y };
    else return;
    e.preventDefault(); stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', (e) => {
    const d = crop.drag; if (!d) return;
    const [x, y] = at(e); const MIN = 0.04;
    if (d.kind === 'blur') {
      Object.assign(d.r, { x: Math.min(x, d.x0), y: Math.min(y, d.y0), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) });
    } else if (d.kind === 'move') {
      const s = d.start;
      crop.box = { ...s, x: clamp(s.x + x - d.x0, 0, 1 - s.w), y: clamp(s.y + y - d.y0, 0, 1 - s.h) };
    } else {
      const s = d.start; let l = s.x; let t = s.y; let r = s.x + s.w; let b = s.y + s.h;
      if (d.h.includes('w')) l = clamp(x, 0, r - MIN);
      if (d.h.includes('e')) r = clamp(x, l + MIN, 1);
      if (d.h.includes('n')) t = clamp(y, 0, b - MIN);
      if (d.h.includes('s')) b = clamp(y, t + MIN, 1);
      if (crop.aspect && d.h.length === 2) { // corners keep the ratio, anchored on the opposite corner
        const rn = crop.aspect * crop.p.nh / crop.p.nw;
        let w = r - l; let h = w / rn;
        const maxH = d.h.includes('n') ? s.y + s.h : 1 - s.y;
        if (h > maxH) { h = maxH; w = h * rn; }
        if (d.h.includes('w')) l = r - w; else r = l + w;
        if (d.h.includes('n')) t = b - h; else b = t + h;
      }
      crop.box = { x: l, y: t, w: r - l, h: b - t };
    }
    drawCrop();
  });
  const end = () => {
    const d = crop.drag; crop.drag = null;
    if (d?.kind === 'blur' && (d.r.w < 0.01 || d.r.h < 0.01)) { crop.blurs.splice(crop.blurs.indexOf(d.r), 1); drawCrop(); }
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
}
// trim borders that are one flat colour (black bars around a shared screen, empty margins)
function autoTrim() {
  const p = crop.p; const k = 480 / Math.max(p.nw, p.nh);
  const c = canvasOf(p.nw * k, p.nh * k); const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(p.img, 0, 0, c.width, c.height);
  const { data, width: w, height: h } = g.getImageData(0, 0, c.width, c.height);
  const lum = (i) => data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  const flat = (cells) => { let s = 0; let s2 = 0; cells.forEach((v) => { s += v; s2 += v * v; }); const mu = s / cells.length; return Math.sqrt(Math.max(0, s2 / cells.length - mu * mu)) < 6; };
  const row = (y, x0, x1) => { const a = []; for (let x = x0; x < x1; x++) a.push(lum((y * w + x) * 4)); return a; };
  const col = (x, y0, y1) => { const a = []; for (let y = y0; y < y1; y++) a.push(lum((y * w + x) * 4)); return a; };
  let t = 0; let b = h - 1; let l = 0; let r = w - 1;
  while (t < h * 0.45 && flat(row(t, 0, w))) t++;
  while (b > h * 0.55 && flat(row(b, 0, w))) b--;
  while (l < w * 0.45 && flat(col(l, t, b + 1))) l++;
  while (r > w * 0.55 && flat(col(r, t, b + 1))) r--;
  if (!t && !l && b === h - 1 && r === w - 1) { deps.toast('ما لقيت حواف فاضية. استعمل الإطار تقص بإيدك.'); return; }
  crop.box = { x: l / w, y: t / h, w: (r - l + 1) / w, h: (b - t + 1) / h };
  applyAspect();
}
async function finishCrop(all) {
  const p = crop.p; const box = { ...crop.box }; const blurs = crop.blurs.filter((r) => r.w >= 0.01 && r.h >= 0.01);
  const targets = all ? state.photos.filter((q) => q === p || (q.nw === p.nw && q.nh === p.nh)) : [p];
  $('gs-crop-dlg').close();
  for (const q of targets) {
    q.crop = { ...box };
    // pixelated areas follow the crop to photos of the same size only when they come from this one
    if (q === p) q.blurs = blurs;
    else if (all && $('gs-crop-blurs-all').checked) q.blurs = blurs.map((r) => ({ ...r }));
    await rebuild(q);
  }
  if (all) deps.toast(targets.length > 1 ? `انطبق على ${targets.length} صور بنفس المقاس` : 'ما في صور تانية بنفس المقاس، انطبق على هاي بس');
  refresh();
}

/* =================== wiring =================== */
function wire() {
  $('gs-input').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
  const drops = [$('gs-drop'), document.querySelector('.gs-preview')];
  drops.forEach((dz) => {
    ['dragenter', 'dragover'].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => dz.addEventListener(t, () => dz.classList.remove('is-over')));
    dz.addEventListener('drop', (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); });
  });
  document.addEventListener('paste', (e) => {
    if ($('tab-gstudio').hidden || $('gs-crop-dlg').open) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault(); addFiles(files);
  });
  [['gs-title', 'title'], ['gs-sub', 'sub'], ['gs-tag', 'tag']].forEach(([id, k]) => $(id).addEventListener('input', (e) => setStyle({ [k]: e.target.value })));
  [['gs-logo', 'logo'], ['gs-mosaic', 'mosaic'], ['gs-chrome', 'chrome'], ['gs-footer', 'footer'], ['gs-border', 'border']].forEach(([id, k]) => $(id).addEventListener('change', (e) => setStyle({ [k]: e.target.checked })));
  $('gs-fit').addEventListener('change', (e) => setStyle({ fit: e.target.value }));
  $('gs-pad').addEventListener('input', (e) => setStyle({ pad: +e.target.value }));
  $('gs-radius').addEventListener('input', (e) => setStyle({ radius: +e.target.value }));
  $('gs-reset').addEventListener('click', () => { state.st = { ...DEFAULTS, title: st().title, sub: st().sub, tag: st().tag }; saveStyle(); refresh(); });
  $('gs-caption').addEventListener('input', (e) => {
    const p = curPhoto(); if (!p) return;
    p.caption = e.target.value; capCount();
    if (st().capOn) refreshSoon(); // the caption is on the picture: redraw it
    else { clearTimeout(refreshSoon.t); refreshSoon.t = setTimeout(renderStrip, 400); } // the strip's «كابشن» flag
  });
  $('gs-caption').addEventListener('keydown', (e) => { // Ctrl+Enter: the next photo, straight to its caption
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && state.cur < state.photos.length - 1) { e.preventDefault(); state.cur++; refresh(); $('gs-caption').focus(); }
  });
  $('gs-cap-on').addEventListener('change', (e) => setStyle({ capOn: e.target.checked }));
  $('gs-cap-all').addEventListener('click', () => {
    const p = curPhoto(); if (!p) return;
    const v = (p.caption || '').trim();
    if (!v) { deps.toast('اكتب كابشن للصورة الحالية أول'); $('gs-caption').focus(); return; }
    state.photos.forEach((q) => { q.caption = v; });
    deps.toast(`صار نفس الكابشن على ${state.photos.length} صور`);
    refresh();
  });
  $('gs-desc').addEventListener('input', () => { descTyped = true; descCount(); });
  $('gs-album').addEventListener('change', albumChanged);
  $('gs-title').addEventListener('change', () => { if (!$('gs-album').value.trim()) albumChanged(); });
  $('gs-prev').addEventListener('click', () => { if (state.cur > 0) { state.cur--; refresh(); } });
  $('gs-next').addEventListener('click', () => { if (state.cur < state.photos.length - 1) { state.cur++; refresh(); } });
  $('gs-del').addEventListener('click', removeCurrent);
  $('gs-move-prev').addEventListener('click', () => moveCurrent(-1));
  $('gs-move-next').addEventListener('click', () => moveCurrent(1));
  $('gs-mode-frame').addEventListener('click', () => { setStyle({ asIs: false }); refresh(); });
  $('gs-mode-ready').addEventListener('click', () => { setStyle({ asIs: true }); refresh(); });
  $('gs-crop-btn').addEventListener('click', openCrop);
  $('gs-stage').addEventListener('dblclick', openCrop);
  $('gs-stage').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'PageDown') $('gs-next').click(); // RTL: left is next
    else if (e.key === 'ArrowRight' || e.key === 'PageUp') $('gs-prev').click();
    else if (e.key === 'Delete') removeCurrent();
    else if (e.key === 'Enter') openCrop();
    else return;
    e.preventDefault();
  });
  $('gs-dl').addEventListener('click', downloadCurrent);
  $('gs-dl-all').addEventListener('click', downloadAll);
  $('gs-save').addEventListener('click', saveAll);
  // the crop dialog
  cropPointer();
  document.querySelectorAll('#gs-crop-modes [role="tab"]').forEach((b) => b.addEventListener('click', () => setCropMode(b.dataset.mode)));
  $('gs-aspect').addEventListener('change', (e) => { crop.aspect = +e.target.value; applyAspect(); });
  $('gs-crop-full').addEventListener('click', () => { crop.box = { x: 0, y: 0, w: 1, h: 1 }; applyAspect(); });
  $('gs-crop-trim').addEventListener('click', autoTrim);
  $('gs-crop-clear').addEventListener('click', () => { crop.blurs = []; drawCrop(); });
  $('gs-crop-ok').addEventListener('click', () => finishCrop(false));
  $('gs-crop-all').addEventListener('click', () => finishCrop(true));
}

export function initGalleryStudio(d) {
  deps = d;
}
export async function showGalleryStudio() {
  if (!started) {
    started = true;
    buildPickers(); wire();
    await fontsReady;
  }
  fillWorkshops(); fillAlbums();
  refresh();
  albumChanged();
}
