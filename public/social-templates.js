// Beit Lahia Tech — social media designs.
// A design is plain data: { v, id, name, w, h, bg: { color, grid }, els: [ element, … ] }.
// Every element has a `type` and its own geometry; renderDesign() turns a design into SVG, and the
// admin studio edits the same data (move, resize, recolour, add, delete). The 8 approved templates
// are built-in designs made of these elements.
import { ICONS } from './icons.js';

export const NIGHT = '#0B1020', NIGHT2 = '#151C2D', NIGHT3 = '#1E2A44', CARD = '#121A2B', EDGE = '#26324A';
export const MINT = '#35E69B', BERRY = '#F22964', MUTED = '#C3CCDA';
export const BRAND_COLORS = ['#FFFFFF', MINT, BERRY, NIGHT, NIGHT2, CARD, MUTED, '#E5E9F0', '#9AA6BC', '#FFD166', '#A0F6D9', '#047857'];
export const FONT_URL = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Montserrat:wght@500;600;700;800&display=swap';
export const SIZES = { post: [1080, 1350, 'منشور 4:5'], square: [1080, 1080, 'مربع 1:1'], story: [1080, 1920, 'ستوري 9:16'] };
export const DEFAULT_PHOTO = '/img/beit-lahia-night.jpg';

/* ---------- the strawberry (same grid as the site logo) ---------- */
const BERRY_GRID = [
  '......MM......', '......MM......', '..GGL....LGG..', '..GGLL..LLGD..',
  '....GGTTDD....', 'RRRRkkTTkkRRQQ', 'RRRRkkTTkkRRQQ', 'RRSSPPkkPPSSQQ',
  'RRkkPPkkPPkkQQ', 'RRkkPPSSPPkkQQ', '..RRSSRRSSQQ..', '..RRSSRRSSQQ..',
  '....RRkkQQ....', '....RRkkQQ....', '......RQ......', '......RQ......',
];
const BERRY_FILL = {
  M: '#35F0B4', G: '#1AC08E', L: '#A0F6D9', D: '#0E8A70', T: '#E45C7E',
  R: '#F22865', Q: '#DE1D5A', P: '#FF5A8A', S: '#C3134C', k: NIGHT,
};

/* ---------- pixel art ---------- */
export const ART = {
  megaphone: {
    name: 'ميكروفون',
    fill: { w: '#F4F6FA', g: '#C9D2E0', b: BERRY, m: MINT },
    rows: [
      'bb..............', 'bwb.............', 'bwwbb...........', 'bwwwwbb.........',
      'bwwwwwwbbbbb....', 'bwwwwwwwwwwwbmm.', 'bgwwwwwwwwwwbmm.', 'bggggggbbbbb....',
      'bggggbb..mm.....', 'bggbb....mm.....', 'bgb......mmm....', 'bb..............',
    ],
  },
  rocket: {
    name: 'صاروخ',
    fill: { w: '#F4F6FA', g: '#C9D2E0', b: BERRY, m: MINT, k: NIGHT, l: '#A0F6D9' },
    rows: [
      '....b....', '...bbb...', '...www...', '..wwwww..', '..wkkkw..', '..wklkw..', '..wkkkw..',
      '..wwwww..', '..wwwww..', '..gwwwg..', '.bgwwwgb.', 'bbgwwwgbb', 'bb.mmm.bb', '...mmm...',
      '....m....', '...m.m...',
    ],
  },
  heart: { name: 'قلب', mono: true, rows: ['.mm...mm.', 'm..m.m..m', 'm...m...m', 'm.......m', '.m.....m.', '..m...m..', '...m.m...', '....m....'] },
  quote: { name: 'علامة اقتباس', mono: true, rows: ['.mm..mm', 'mm..mm.', 'mmm.mmm', 'mmm.mmm', 'mmm.mmm', 'mmm.mmm'] },
  star: { name: 'نجمة', mono: true, rows: ['...m...', '...m...', 'mmmmmmm', '.mmmmm.', '..mmm..', '.mm.mm.', 'm.....m'] },
  code: { name: '</>', rows: ['..m...b..m..', '.m....b...m.', 'm....b.....m', '.m..b.....m.', '..m.b....m..'], fill: { m: MINT, b: BERRY } },
};

/* ---------- line icons (24 × 24, stroked) ---------- */
export const LINE_ICONS = {
  code: { name: 'برمجة', d: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16' },
  design: { name: 'تصميم', d: 'M3 4h14v11H3zM8 19h6M11 15v4M14.5 11.5l6-6 2 2-6 6h-2z' },
  idea: { name: 'فكرة', d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.4 1 2.5h6c0-1.1.3-1.8 1-2.5A6 6 0 0 0 12 3zM3 9H2M22 9h-1M5 3l1 1M19 3l-1 1' },
  gear: { name: 'إعدادات', d: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1' },
  users: { name: 'مجتمع', d: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c0-4 3-7 7-7s7 3 7 7M17 3.5a4 4 0 0 1 0 7.5M19 14c2 1 3 3.5 3 7' },
  learn: { name: 'تعلّم', d: 'M2 9l10-5 10 5-10 5zM6 11v5c3.5 2.5 8.5 2.5 12 0v-5' },
  chat: { name: 'تواصل', d: 'M21 12a8 8 0 0 1-12 7l-6 2 2-5.5A8 8 0 1 1 21 12z' },
  work: { name: 'عمل', d: 'M3 7h18v13H3zM8 7V4h8v3M3 12h18' },
  ai: { name: 'ذكاء اصطناعي', d: 'M7 7h10v10H7zM10 2v5M14 2v5M10 17v5M14 17v5M2 10h5M2 14h5M17 10h5M17 14h5' },
  shield: { name: 'أمن', d: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z' },
  calendar: { name: 'تقويم', d: 'M3 5h18v16H3zM3 10h18M8 2v5M16 2v5' },
  pin: { name: 'مكان', d: 'M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
  clock: { name: 'ساعة', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2' },
  link: { name: 'رابط', d: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1' },
  globe: { name: 'موقع إنترنت', d: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9s-1.3 6.5-3.8 9M12 3c-2.5 2.5-3.8 5.6-3.8 9s1.3 6.5 3.8 9' },
  timer: { name: 'مؤقّت', d: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2.5 1.5M10 2h4M12 2v4M19 6l1.5-1.5' },
  video: { name: 'أونلاين', d: 'M3 6h12v12H3zM15 10l6-3v10l-6-3' },
};
export const SOCIAL_ICON_KEYS = ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'telegram', 'whatsapp', 'github'];

/* ---------- element types: what the editor may change ---------- */
// pos: fields moved by dragging · scale: fields multiplied by resizing · props: the properties panel
const P = {
  text: ['text', 'textarea', 'النص'], size: ['size', 'number', 'الحجم'], color: ['color', 'color', 'اللون'],
  weight: ['weight', 'weight', 'السماكة'], align: ['align', 'align', 'المحاذاة'], font: ['font', 'font', 'الخط'],
  maxW: ['maxW', 'number', 'أقصى عرض (يصغّر النص لحاله)'], ls: ['ls', 'number', 'تباعد الحروف'], lh: ['lh', 'decimal', 'تباعد الأسطر'],
  opacity: ['opacity', 'range', 'الشفافية'], w: ['w', 'number', 'العرض'], h: ['h', 'number', 'الارتفاع'], rx: ['rx', 'number', 'تدوير الزوايا'],
  fill: ['fill', 'color', 'التعبئة'], stroke: ['stroke', 'color', 'لون الإطار'], sw: ['sw', 'number', 'سماكة الخط'],
  textColor: ['textColor', 'color', 'لون النص'], chevron: ['chevron', 'bool', 'سهم'], rotate: ['rotate', 'number', 'الدوران'],
  cell: ['cell', 'number', 'حجم البكسل'], art: ['art', 'art', 'الرسمة'], icon: ['icon', 'icon', 'الأيقونة'],
  src: ['src', 'image', 'الصورة'], gray: ['gray', 'bool', 'أبيض وأسود'], fade: ['fade', 'fade', 'تلاشي الحواف'],
  pattern: ['pattern', 'mosaic', 'النمط'], platforms: ['platforms', 'platforms', 'المنصات'], r: ['r', 'number', 'حجم الدائرة'],
  tilt: ['tilt', 'number', 'الميلان'],
};

/* ---------- story things (Instagram-style): text backgrounds, effects, filters, stickers, music, pen ---------- */
export const TEXT_BG = [['none', 'بدون'], ['solid', 'خلفية'], ['soft', 'خلفية شفافة']];
export const TEXT_FX = [['none', 'بدون'], ['neon', 'نيون'], ['shadow', 'ظل']];
// photo filters: saturation + a linear tone curve per channel (SVG feColorMatrix + feComponentTransfer)
export const FILTERS = {
  none: { name: 'بدون' },
  clarendon: { name: 'Clarendon', sat: 1.35, r: [1.15, -0.05], g: [1.15, -0.05], b: [1.2, -0.04] },
  juno: { name: 'Juno (دافي)', sat: 1.2, r: [1.12, 0.02], g: [1.05, 0], b: [0.9, 0] },
  lark: { name: 'Lark (فاتح)', sat: 0.85, r: [1.08, 0.06], g: [1.08, 0.06], b: [1.02, 0.08] },
  moon: { name: 'Moon (أبيض وأسود)', sat: 0, r: [1.25, -0.1], g: [1.25, -0.1], b: [1.25, -0.1] },
  gingham: { name: 'Gingham (باهت)', sat: 0.75, r: [0.85, 0.12], g: [0.85, 0.12], b: [0.8, 0.15] },
  valencia: { name: 'Valencia', sat: 1.08, r: [1.05, 0.08], g: [0.98, 0.05], b: [0.85, 0.06] },
  cool: { name: 'بارد', sat: 1, r: [0.9, 0], g: [1, 0.02], b: [1.15, 0.05] },
};
export const GRADIENTS = {
  none: { name: 'بدون (لون واحد)' },
  night: { name: 'ليل', stops: ['#0B1020', '#2A1B4F'] },
  aurora: { name: 'شفق', stops: ['#0B1020', '#0E5E4A', '#35E69B'] },
  berry: { name: 'فراولة', stops: ['#4A0F26', '#F22964'] },
  sunset: { name: 'غروب', stops: ['#F22964', '#FF8A3D'] },
  ocean: { name: 'بحر', stops: ['#0B1020', '#1F4E9A', '#35B8E6'] },
  mint: { name: 'نعناع', stops: ['#0E8A70', '#35E69B', '#A0F6D9'] },
  insta: { name: 'إنستغرام', stops: ['#4F2DA8', '#C13584', '#F77737'] },
};
export const STICKERS = {
  mention: { name: 'منشن @', text: 'beitlahia.tech', accent: '#E1306C' },
  hashtag: { name: 'هاشتاق #', text: 'بيت_لاهيا_التقني', accent: '#F77737' },
  location: { name: 'الموقع', text: 'بيت لاهيا', accent: '#8A3AB9', icon: 'pin' },
  link: { name: 'رابط', text: 'beitlahia.tech', accent: '#2F80ED', icon: 'link' },
  time: { name: 'الساعة', text: '9:41 م', accent: NIGHT, icon: 'clock' },
  date: { name: 'التاريخ', text: 'السبت 24 مايو', accent: NIGHT, icon: 'calendar' },
  countdown: { name: 'عدّ تنازلي', text: 'الورشة بتبلّش', sub: 'السبت 24 مايو · 5 م', accent: '#8A3AB9' },
  poll: { name: 'تصويت', text: 'شو بتفضّل؟', sub: 'نعم|لا', accent: '#2F80ED' },
  question: { name: 'سؤال', text: 'اسألني أي إشي', sub: 'اكتب سؤالك هون…', accent: BERRY },
  slider: { name: 'سلايدر إيموجي', text: 'قديش متحمس؟', sub: '😍', accent: BERRY },
};
const STICKER_STYLE = {
  light: { name: 'أبيض', bg: '#FFFFFF', fg: null, sub: '#5B6478' },
  dark: { name: 'غامق', bg: NIGHT2, fg: '#FFFFFF', sub: '#9AA6BC' },
  brand: { name: 'نعناعي', bg: MINT, fg: NIGHT, sub: '#0E5E4A' },
  berry: { name: 'فراولة', bg: BERRY, fg: '#FFFFFF', sub: '#FFD6E2' },
  glass: { name: 'شفاف', bg: '#FFFFFF', bgOp: 0.2, line: '#FFFFFF', fg: '#FFFFFF', sub: '#E5E9F0' },
};
export const MUSIC_STYLES = [['card', 'كرت'], ['pill', 'شريط صغير'], ['bars', 'موجة الصوت']];
export const BRUSHES = [['pen', 'قلم'], ['marker', 'ماركر'], ['neon', 'نيون']];
const opts = (o) => Object.entries(o).map(([k, v]) => [k, v.name]);
const S = {
  textBg: ['bgStyle', 'select', 'خلفية النص', TEXT_BG], bgColor: ['bgColor', 'color', 'لون خلفية النص'],
  fx: ['effect', 'select', 'تأثير', TEXT_FX], filter: ['filter', 'select', 'فلتر', opts(FILTERS)],
  kind: ['kind', 'select', 'نوع الملصق', opts(STICKERS)], stStyle: ['style', 'select', 'الشكل', opts(STICKER_STYLE)],
  line: ['text', 'line', 'النص'], sub: ['sub', 'line', 'السطر الثاني (للتصويت: خيار|خيار)'], size: ['size', 'number', 'الحجم'],
  title: ['title', 'line', 'اسم الأغنية'], artist: ['artist', 'line', 'الفنان'], msStyle: ['style', 'select', 'الشكل', MUSIC_STYLES],
  brush: ['brush', 'select', 'القلم', BRUSHES], width: ['width', 'number', 'سماكة القلم'], pct: ['pct', 'number', 'الحجم %'],
};
export const TYPES = {
  text: { name: 'نص', pos: ['x', 'y'], scale: ['size', 'maxW'], props: [P.text, P.size, P.color, P.weight, P.font, P.align, S.textBg, S.bgColor, S.fx, P.rotate, P.maxW, P.lh, P.ls, P.opacity] },
  rect: { name: 'مستطيل / كرت', pos: ['x', 'y'], scale: ['w', 'h', 'rx'], props: [P.fill, P.stroke, P.sw, P.w, P.h, P.rx, P.opacity] },
  button: { name: 'زر', pos: ['cx', 'y'], scale: ['w', 'h'], props: [P.text, P.fill, P.textColor, P.w, P.h, P.chevron, P.opacity] },
  image: { name: 'صورة', pos: ['x', 'y'], scale: ['w', 'h'], props: [P.src, S.filter, P.gray, P.fade, P.w, P.h, P.rx, P.opacity] },
  sticker: { name: 'ملصق', story: true, pos: ['cx', 'cy'], scale: ['size'], props: [S.kind, S.line, S.sub, S.stStyle, S.size, P.rotate, P.opacity] },
  music: { name: 'ملصق موسيقى', story: true, pos: ['cx', 'cy'], scale: ['size'], props: [S.title, S.artist, S.msStyle, P.color, S.size, P.rotate, P.opacity] },
  draw: { name: 'رسمة بالقلم', story: true, noAdd: true, pos: ['x', 'y'], scale: ['pct'], props: [P.color, S.brush, S.width, S.pct, P.opacity] },
  strawberry: { name: 'الفراولة', pos: ['x', 'y'], scale: ['w'], props: [P.w, P.opacity] },
  lockup: { name: 'الشعار', pos: ['x', 'y'], scale: ['h'], props: [P.h, P.color, P.opacity] },
  art: { name: 'بكسل آرت', pos: ['x', 'y'], scale: ['cell'], props: [P.art, P.cell, P.color, P.rotate, P.opacity] },
  mosaic: { name: 'مربعات بكسل', pos: ['x', 'y'], scale: ['cell'], props: [P.pattern, P.cell, P.opacity] },
  wave: { name: 'خط مموّج', pos: ['cx', 'y'], scale: ['w', 'sw'], props: [P.color, P.w, P.sw, P.tilt, P.opacity] },
  icon: { name: 'أيقونة', pos: ['cx', 'cy'], scale: ['size'], props: [P.icon, P.size, P.color, P.opacity] },
  social: { name: 'أيقونات السوشيال', pos: ['cx', 'cy'], scale: ['r'], props: [P.platforms, P.r, P.color, P.opacity] },
};
export const MOSAICS = {
  corner: 'nm..|bd.m|.n.d|m...',
  stairs: 'm...|bn..|.dm.|nmbn',
  scatter: 'b.m.|.n.d|m.b.|.d.n',
  thick: '...mm|..msm|.mmsm|mmsmm',
  line: 'mbnmd',
};

/* ---------- small helpers ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const num = (v, d = 0) => (v !== '' && v != null && Number.isFinite(+v) ? +v : d);
const fallbackMeasure = (t, px) => [...t].length * px * 0.52;
const famOf = (font) => (font === 'en' ? 'Montserrat' : 'Cairo');

function fitSize(ctx, lines, px, maxW, weight, family) {
  if (!maxW) return px;
  const m = ctx.measure || fallbackMeasure;
  let size = px;
  const widest = () => Math.max(...lines.map((l) => m(l, size, weight, family)));
  while (size > px * 0.4 && widest() > maxW) size *= 0.96;
  return Math.round(size);
}
function pixels(rows, fill, x, y, c) {
  let out = '';
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    if (fill[ch]) out += `<rect x="${x + i * c}" y="${y + j * c}" width="${c}" height="${c}" fill="${fill[ch]}"/>`;
  }));
  return `<g shape-rendering="crispEdges">${out}</g>`;
}
const MOSAIC_FILL = { m: MINT, b: BERRY, n: NIGHT2, d: NIGHT3, s: '#1B6B52', p: '#7A1B3E' };

/* ---------- rendering, one element at a time ---------- */
const isLight = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return true;
  const n = parseInt(m[1], 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150;
};
const rot = (deg, x, y, inner) => (num(deg) ? `<g transform="rotate(${num(deg)} ${x} ${y})">${inner}</g>` : inner);
const hasAr = (t) => /[؀-ۿ]/.test(t);
function glowFilter(id, color, blur, kind) {
  if (kind === 'shadow') return `<filter id="${id}" x="-20%" y="-40%" width="140%" height="180%"><feDropShadow dx="0" dy="${blur * 0.5}" stdDeviation="${blur * 0.7}" flood-color="#000" flood-opacity=".55"/></filter>`;
  return `<filter id="${id}" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="b"/>`
    + `<feFlood flood-color="${color}"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

const R = {
  text(e, ctx, i) {
    const lines = String(e.text ?? '').split('\n');
    const fam = famOf(e.font); const weight = num(e.weight, 800);
    const size = fitSize(ctx, lines.filter(Boolean).length ? lines : [' '], num(e.size, 60), num(e.maxW), weight, fam);
    const rtl = e.font !== 'en';
    const anchor = e.align === 'middle' ? 'middle' : (e.align === 'left') === rtl ? 'end' : 'start';
    const lh = size * num(e.lh, 1.3);
    const x = num(e.x); const y = num(e.y); const color = e.color || '#FFFFFF';
    let defs = ''; let fAttr = '';
    if (e.effect === 'neon' || e.effect === 'shadow') {
      defs = glowFilter(`tx${i}`, color, size * (e.effect === 'neon' ? 0.1 : 0.08), e.effect);
      fAttr = ` filter="url(#tx${i})"`;
    }
    // Instagram-style background behind each line (rounded, hugging the text)
    let boxes = '';
    if (e.bgStyle === 'solid' || e.bgStyle === 'soft') {
      const m = ctx.measure || fallbackMeasure;
      const fill = e.bgColor || (isLight(color) ? NIGHT : '#FFFFFF');
      const pad = size * 0.32;
      boxes = lines.map((l, k) => {
        if (!l.trim()) return '';
        const w = m(l, size, weight, fam) + Math.abs(num(e.ls)) * [...l].length + pad * 2;
        const left = e.align === 'middle' ? x - w / 2 : e.align === 'left' ? x - pad : x - w + pad;
        return `<rect x="${left}" y="${y + k * lh - size * 0.98}" width="${w}" height="${size * 1.36}" rx="${size * 0.26}" fill="${fill}"${e.bgStyle === 'soft' ? ' fill-opacity=".55"' : ''}/>`;
      }).join('');
    }
    const texts = lines.map((l, k) => `<text class="${rtl ? 'ar' : 'en'}" x="${x}" y="${y + k * lh}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" direction="${rtl ? 'rtl' : 'ltr'}" letter-spacing="${num(e.ls)}">${esc(l)}</text>`).join('');
    const body = `${defs ? `<defs>${defs}</defs>` : ''}${boxes}<g${fAttr}>${texts}</g>`;
    return rot(e.rotate, x, y - size * 0.35 + (lines.length - 1) * lh / 2, body);
  },
  sticker(e, ctx, i) {
    const kind = STICKERS[e.kind] ? e.kind : 'mention'; const def = STICKERS[kind];
    const st = STICKER_STYLE[e.style] || STICKER_STYLE.light;
    const s = num(e.size, 96); const cx = num(e.cx); const cy = num(e.cy);
    const m = ctx.measure || fallbackMeasure;
    const fg = st.fg || def.accent; const subC = st.sub;
    const bgAttrs = `fill="${st.bg}"${st.bgOp ? ` fill-opacity="${st.bgOp}"` : ''}${st.line ? ` stroke="${st.line}" stroke-opacity=".55" stroke-width="${s / 30}"` : ''}`;
    const txt = (t, tx, ty, px, c, w = 800, anchor = 'middle') => {
      const ar = hasAr(t);
      return `<text class="${ar ? 'ar' : 'en'}" x="${tx}" y="${ty}" font-size="${px}" font-weight="${w}" fill="${c}" text-anchor="${anchor}" direction="${ar ? 'rtl' : 'ltr'}">${esc(t)}</text>`;
    };
    const fit = (t, px, maxW, w = 800) => { let p = px; const fam = hasAr(t) ? 'Cairo' : 'Montserrat'; while (p > px * 0.45 && m(t, p, w, fam) > maxW) p *= 0.95; return p; };
    let out = '';
    if (['mention', 'hashtag', 'location', 'link', 'time', 'date'].includes(kind)) {
      let t = String(e.text ?? def.text).trim() || def.text;
      if (kind === 'mention') t = `@${t.replace(/^@+/, '')}`;
      if (kind === 'hashtag') t = `#${t.replace(/^#+/, '').replace(/\s+/g, '_')}`;
      if (kind === 'link') t = t.replace(/^https?:\/\//, '');
      const ar = hasAr(t); const px = s * 0.46;
      const tw = m(t, px, 800, ar ? 'Cairo' : 'Montserrat');
      const ic = def.icon ? s * 0.44 : 0; const gap = ic ? s * 0.16 : 0;
      const w = tw + ic + gap + s * 0.7; const x0 = cx - w / 2; const y0 = cy - s / 2;
      out += `<rect x="${x0}" y="${y0}" width="${w}" height="${s}" rx="${s * 0.26}" ${bgAttrs}/>`;
      // icon first in reading order: on the right for Arabic, on the left for Latin
      const icX = ar ? x0 + w - s * 0.35 - ic : x0 + s * 0.35;
      if (ic) out += `<g transform="translate(${icX} ${cy - ic / 2}) scale(${ic / 24})"><path d="${LINE_ICONS[def.icon].d}" fill="none" stroke="${fg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      const tx = ar ? icX - gap : icX + ic + gap;
      out += txt(t, ic ? tx : cx, cy + px * 0.36, px, fg, 800, ic ? 'start' : 'middle');
    } else if (kind === 'countdown') {
      const W = s * 6.4; const H = s * 3; const x0 = cx - W / 2; const y0 = cy - H / 2;
      const title = String(e.text ?? def.text); const when = String(e.sub ?? def.sub);
      out += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="${s * 0.34}" ${bgAttrs}/>`;
      out += txt(title, cx, y0 + s * 0.78, fit(title, s * 0.4, W - s * 0.6, 700), subC, 700);
      out += txt(when, cx, y0 + s * 1.62, fit(when, s * 0.62, W - s * 0.6), st.fg || def.accent);
      const bw = s * 2.6; const bh = s * 0.62;
      out += `<rect x="${cx - bw / 2}" y="${y0 + H - s * 0.92}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${def.accent}"${st.bg === def.accent ? ' fill-opacity=".25"' : ''}/>`;
      out += txt('ذكّرني', cx, y0 + H - s * 0.92 + bh * 0.68, s * 0.3, '#FFFFFF', 700);
    } else if (kind === 'poll') {
      const W = s * 6.4; const q = String(e.text ?? def.text).trim();
      const [a = 'نعم', b = 'لا'] = String(e.sub ?? def.sub).split('|').map((x) => x.trim());
      const qh = q ? s * 1.15 : 0; const oh = s * 1.45; const H = qh + oh; const x0 = cx - W / 2; const y0 = cy - H / 2;
      out += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="${s * 0.34}" ${bgAttrs}/>`;
      if (q) {
        out += txt(q, cx, y0 + qh * 0.66, fit(q, s * 0.44, W - s * 0.6), st.fg || NIGHT);
        out += `<line x1="${x0}" y1="${y0 + qh}" x2="${x0 + W}" y2="${y0 + qh}" stroke="${subC}" stroke-opacity=".35" stroke-width="${s / 40}"/>`;
      }
      out += `<line x1="${cx}" y1="${y0 + qh + oh * 0.18}" x2="${cx}" y2="${y0 + H - oh * 0.18}" stroke="${subC}" stroke-opacity=".35" stroke-width="${s / 40}"/>`;
      // reading order: the first option on the right (Arabic)
      out += txt(a, cx + W / 4, y0 + qh + oh * 0.64, fit(a, s * 0.56, W / 2 - s * 0.4), st.fg || '#2F80ED');
      out += txt(b, cx - W / 4, y0 + qh + oh * 0.64, fit(b, s * 0.56, W / 2 - s * 0.4), st.fg || BERRY);
    } else if (kind === 'question') {
      const W = s * 6.4; const H = s * 3; const x0 = cx - W / 2; const y0 = cy - H / 2; const hh = s * 1.35;
      const q = String(e.text ?? def.text); const ph = String(e.sub ?? def.sub);
      out += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="${s * 0.34}" ${bgAttrs}/>`;
      out += `<path d="M${x0} ${y0 + hh}V${y0 + s * 0.34}a${s * 0.34} ${s * 0.34} 0 0 1 ${s * 0.34} -${s * 0.34}H${x0 + W - s * 0.34}a${s * 0.34} ${s * 0.34} 0 0 1 ${s * 0.34} ${s * 0.34}V${y0 + hh}z" fill="${def.accent}"/>`;
      out += txt(q, cx, y0 + hh * 0.64, fit(q, s * 0.46, W - s * 0.6), '#FFFFFF');
      out += `<rect x="${x0 + s * 0.3}" y="${y0 + hh + s * 0.3}" width="${W - s * 0.6}" height="${H - hh - s * 0.6}" rx="${s * 0.22}" fill="${isLight(st.bg) && !st.bgOp ? '#EEF1F6' : '#000000'}" fill-opacity="${isLight(st.bg) && !st.bgOp ? 1 : 0.22}"/>`;
      out += txt(ph, cx, y0 + hh + (H - hh) / 2 + s * 0.14, fit(ph, s * 0.36, W - s, 600), subC, 600);
    } else if (kind === 'slider') {
      const W = s * 6.4; const H = s * 2.3; const x0 = cx - W / 2; const y0 = cy - H / 2;
      const q = String(e.text ?? def.text); const emo = String(e.sub ?? def.sub).trim() || '😍';
      out += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="${s * 0.34}" ${bgAttrs}/>`;
      out += txt(q, cx, y0 + s * 0.85, fit(q, s * 0.44, W - s * 0.6), st.fg || NIGHT);
      const ty = y0 + s * 1.6; const tx0 = x0 + s * 0.6; const tx1 = x0 + W - s * 0.6; const knob = tx0 + (tx1 - tx0) * 0.3;
      out += `<line x1="${tx0}" y1="${ty}" x2="${tx1}" y2="${ty}" stroke="${subC}" stroke-opacity=".3" stroke-width="${s * 0.14}" stroke-linecap="round"/>`;
      out += `<line x1="${knob}" y1="${ty}" x2="${tx1}" y2="${ty}" stroke="${def.accent}" stroke-width="${s * 0.14}" stroke-linecap="round"/>`;
      out += `<text x="${knob}" y="${ty + s * 0.26}" font-size="${s * 0.72}" text-anchor="middle">${esc([...emo].slice(0, 2).join(''))}</text>`;
    }
    return rot(e.rotate, cx, cy, out);
  },
  music(e, ctx, i) {
    const s = num(e.size, 100); const cx = num(e.cx); const cy = num(e.cy); const accent = e.color || MINT;
    const m = ctx.measure || fallbackMeasure;
    const title = String(e.title || 'اسم الأغنية'); const artist = String(e.artist || '');
    const fam = (t) => (hasAr(t) ? 'Cairo' : 'Montserrat');
    const fitW = (t, px, maxW, w) => { let p = px; while (p > px * 0.5 && m(t, p, w, fam(t)) > maxW) p *= 0.95; return p; };
    const tx = (t, x, y, px, c, w, anchor) => `<text class="${hasAr(t) ? 'ar' : 'en'}" x="${x}" y="${y}" font-size="${px}" font-weight="${w}" fill="${c}" text-anchor="${anchor}" direction="${hasAr(t) ? 'rtl' : 'ltr'}">${esc(t)}</text>`;
    const bars = (x, y, h, c, n = 5, bw = s * 0.12) => [0.45, 0.85, 0.6, 1, 0.7, 0.4, 0.9].slice(0, n).map((k, j) => `<rect x="${x + j * bw * 1.7}" y="${y - h * k}" width="${bw}" height="${h * k}" rx="${bw / 2}" fill="${c}"/>`).join('');
    let out = '';
    if (e.style === 'pill') {
      const label = artist ? `${title} · ${artist}` : title;
      const px = s * 0.36; const w = Math.min(m(label, px, 700, fam(label)), s * 7) + s * 1.5; const h = s * 0.8;
      out += `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="#000000" fill-opacity=".55"/>`;
      out += bars(cx + w / 2 - s * 0.95, cy + h * 0.22, h * 0.44, accent, 3, s * 0.08);
      out += tx(label, cx + w / 2 - s * 1.12, cy + px * 0.36, fitW(label, px, s * 7, 700), '#FFFFFF', 700, hasAr(label) ? 'start' : 'end');
    } else if (e.style === 'bars') {
      const n = 21; const bw = s * 0.13; const gap = s * 0.09; const W = n * (bw + gap) - gap; const x0 = cx - W / 2;
      const hs = Array.from({ length: n }, (_, j) => 0.25 + 0.75 * Math.abs(Math.sin(j * 1.7) * Math.cos(j * 0.45)));
      out += hs.map((k, j) => `<rect x="${x0 + j * (bw + gap)}" y="${cy - s * 0.55 * k}" width="${bw}" height="${s * 1.1 * k}" rx="${bw / 2}" fill="${accent}"/>`).join('');
      out += tx(title, cx, cy + s * 1.15, fitW(title, s * 0.42, W + s * 2, 800), '#FFFFFF', 800, 'middle');
      if (artist) out += tx(artist, cx, cy + s * 1.65, fitW(artist, s * 0.32, W + s * 2, 600), '#E5E9F0', 600, 'middle');
    } else {
      const W = s * 6.2; const H = s * 1.7; const x0 = cx - W / 2; const y0 = cy - H / 2; const a = s * 1.25;
      out += `<rect x="${x0}" y="${y0}" width="${W}" height="${H}" rx="${s * 0.3}" fill="#FFFFFF"/>`;
      // the "album cover": brand gradient + the pixel strawberry
      const ax = x0 + W - (H - a) / 2 - a; const ay = y0 + (H - a) / 2;
      out += `<defs><linearGradient id="mg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${NIGHT}"/><stop offset="1" stop-color="#2A1B4F"/></linearGradient></defs>`;
      out += `<rect x="${ax}" y="${ay}" width="${a}" height="${a}" rx="${s * 0.16}" fill="url(#mg${i})"/>`;
      out += pixels(BERRY_GRID, BERRY_FILL, ax + a * 0.2, ay + a * 0.14, (a * 0.6) / 14);
      const right = ax - s * 0.28; const maxW = W - a - s * 1.9;
      out += tx(title, right, y0 + H * (artist ? 0.45 : 0.6), fitW(title, s * 0.42, maxW, 800), NIGHT, 800, hasAr(title) ? 'start' : 'end');
      if (artist) out += tx(artist, right, y0 + H * 0.78, fitW(artist, s * 0.32, maxW, 600), '#5B6478', 600, hasAr(artist) ? 'start' : 'end');
      out += bars(x0 + s * 0.4, y0 + H * 0.7, s * 0.7, accent === '#FFFFFF' ? BERRY : accent, 4);
    }
    return rot(e.rotate, cx, cy, out);
  },
  draw(e, ctx, i) {
    const pts = Array.isArray(e.pts) ? e.pts : [];
    if (!pts.length) return '';
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    if (pts.length === 1) d += `l0.1 0`;
    for (let k = 1; k < pts.length - 1; k++) {
      const [x, y] = pts[k]; const [nx, ny] = pts[k + 1];
      d += `Q${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
    }
    if (pts.length > 1) d += `L${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
    const w = num(e.width, 14); const c = e.color || '#FFFFFF';
    const path = (sw, col, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
    let out;
    if (e.brush === 'marker') out = path(w * 2.2, c, ' stroke-opacity=".55"');
    else if (e.brush === 'neon') {
      out = `<defs><filter id="dr${i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${w * 0.7}"/></filter></defs>`
        + path(w * 2, c, ` filter="url(#dr${i})"`) + path(w * 1.1, c) + path(w * 0.45, '#FFFFFF');
    } else out = path(w, c);
    const k = num(e.pct, 100) / 100;
    return `<g transform="translate(${num(e.x)} ${num(e.y)}) scale(${k})">${out}</g>`;
  },
  rect(e) {
    return `<rect x="${num(e.x)}" y="${num(e.y)}" width="${num(e.w, 100)}" height="${num(e.h, 100)}" rx="${num(e.rx)}" fill="${e.fill || 'none'}"${e.stroke ? ` stroke="${e.stroke}" stroke-width="${num(e.sw, 2)}"` : ''}/>`;
  },
  button(e, ctx) {
    const w = num(e.w, 380); const h = num(e.h, 110); const x = num(e.cx) - w / 2; const y = num(e.y);
    const shift = e.chevron === false ? 0 : 22;
    const label = R.text({ text: e.text, x: num(e.cx) - shift, y: y + h * 0.66, size: h * 0.38, weight: 700, align: 'middle', color: e.textColor || '#FFFFFF', maxW: w - 90 }, ctx);
    const chev = e.chevron === false ? '' : `<path d="M${x + w - 70} ${y + h * 0.34} l14 ${h * 0.16} -14 ${h * 0.16}" fill="none" stroke="${e.textColor || '#FFFFFF'}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${e.fill || BERRY}"/>${label}${chev}`;
  },
  image(e, ctx, i) {
    const src = (ctx.images && ctx.images[e.src]) || e.src;
    const x = num(e.x); const y = num(e.y); const w = num(e.w, 400); const h = num(e.h, 300); const id = `im${i}`;
    if (!src) {
      // empty photo slot (e.g. the trainer's photo): keeps its shape, says what goes there
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${num(e.rx)}" fill="${NIGHT2}" stroke="${EDGE}" stroke-dasharray="12 10" stroke-width="3"/>`
        + `<text class="ar" x="${x + w / 2}" y="${y + h / 2 + Math.min(w, h) * 0.04}" font-size="${Math.max(20, Math.min(w, h) * 0.1)}" font-weight="700" fill="#9AA6BC" text-anchor="middle" direction="rtl">${esc(e.label || 'ارفع صورة')}</text>`;
    }
    let defs = ''; let maskAttr = ''; let filterAttr = ''; let clip = '';
    const fl = FILTERS[e.filter];
    if (fl && fl.r) {
      const f = (ch, [sl, ic]) => `<feFunc${ch} type="linear" slope="${sl}" intercept="${ic}"/>`;
      defs += `<filter id="${id}f" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${e.gray ? 0 : fl.sat}"/><feComponentTransfer>${f('R', fl.r)}${f('G', fl.g)}${f('B', fl.b)}</feComponentTransfer></filter>`;
      filterAttr = ` filter="url(#${id}f)"`;
    } else if (e.gray) {
      defs += `<filter id="${id}f"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="1.1" intercept="-.04"/><feFuncG type="linear" slope="1.1" intercept="-.04"/><feFuncB type="linear" slope="1.18" intercept="-.02"/></feComponentTransfer></filter>`;
      filterAttr = ` filter="url(#${id}f)"`;
    }
    const dir = { top: [0, 0, 0, 1], bottom: [0, 1, 0, 0], left: [0, 0, 1, 0], right: [1, 0, 0, 0] }[e.fade];
    if (dir) {
      defs += `<linearGradient id="${id}g" x1="${dir[0]}" y1="${dir[1]}" x2="${dir[2]}" y2="${dir[3]}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient>`
        + `<mask id="${id}m"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}g)"/></mask>`;
      maskAttr = ` mask="url(#${id}m)"`;
    }
    if (num(e.rx)) { defs += `<clipPath id="${id}c"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${num(e.rx)}"/></clipPath>`; clip = ` clip-path="url(#${id}c)"`; }
    return `<defs>${defs}</defs><g${maskAttr}${clip}><image href="${esc(src)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"${filterAttr}/></g>`;
  },
  strawberry(e) { return pixels(BERRY_GRID, BERRY_FILL, num(e.x), num(e.y), num(e.w, 240) / 14); },
  lockup(e) {
    const h = num(e.h, 120); const x = num(e.x); const y = num(e.y); const c = e.color || '#FFFFFF';
    const w = h * 70 / 80; const lx = x + w + h * 0.24;
    const t = (yy, s) => `<text class="en" x="${lx + h * 0.24}" y="${yy}" font-size="${h * 0.36}" font-weight="800" fill="${c}" direction="ltr">${s}</text>`;
    return pixels(BERRY_GRID, BERRY_FILL, x, y, w / 14)
      + `<rect x="${lx}" y="${y + h * 0.08}" width="3" height="${h * 0.84}" fill="${c}" opacity=".35"/>` + t(y + h * 0.47, 'BEIT LAHIA') + t(y + h * 0.9, 'TECH');
  },
  art(e) {
    const a = ART[e.art] || ART.heart; const c = num(e.cell, 20);
    const fill = a.mono ? { m: e.color || MINT } : a.fill;
    const w = a.rows[0].length * c; const h = a.rows.length * c;
    return `<g transform="rotate(${num(e.rotate)} ${num(e.x) + w / 2} ${num(e.y) + h / 2})">${pixels(a.rows, fill, num(e.x), num(e.y), c)}</g>`;
  },
  mosaic(e) { return pixels(String(e.pattern || MOSAICS.corner).split('|'), MOSAIC_FILL, num(e.x), num(e.y), num(e.cell, 54)); },
  wave(e) {
    const w = num(e.w, 320); const x0 = num(e.cx) - w / 2; const x1 = x0 + w; const y = num(e.y); const t = num(e.tilt, 20);
    return `<path d="M${x0} ${y + t / 2} C ${x0 + w * 0.3} ${y - t / 2 - 6}, ${x0 + w * 0.65} ${y - t / 2}, ${x1} ${y - t}" fill="none" stroke="${e.color || MINT}" stroke-width="${num(e.sw, 9)}" stroke-linecap="round"/>`;
  },
  icon(e) {
    const size = num(e.size, 96); const d = (LINE_ICONS[e.icon] || LINE_ICONS.code).d;
    return `<g transform="translate(${num(e.cx) - size / 2} ${num(e.cy) - size / 2}) scale(${size / 24})"><rect width="24" height="24" fill="transparent"/><path d="${d}" fill="none" stroke="${e.color || MINT}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  },
  social(e) {
    const list = (Array.isArray(e.platforms) ? e.platforms : []).filter((k) => ICONS[k]).slice(0, 7);
    const r = num(e.r, 64); const gap = r * 0.56; const c = e.color || '#FFFFFF';
    const total = list.length * r * 2 + Math.max(0, list.length - 1) * gap;
    return list.map((k, i) => {
      const cx = num(e.cx) - total / 2 + r + i * (r * 2 + gap); const cy = num(e.cy); const s = r * 0.875;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="${c}" stroke-width="${r / 16}"/>`
        + `<g transform="translate(${cx - s / 2} ${cy - s / 2}) scale(${s / 24})"><path d="${ICONS[k].d}" fill="${c}"/></g>`;
    }).join('');
  },
};

export function renderElement(e, ctx, i) {
  const f = R[e.type];
  if (!f) return '';
  const op = e.opacity == null ? 1 : num(e.opacity, 1);
  return `<g data-i="${i}"${op < 1 ? ` opacity="${op}"` : ''}>${f(e, ctx, i)}</g>`;
}

function gradient(key, w, h) {
  const g = GRADIENTS[key];
  if (!g || !g.stops) return '';
  const stops = g.stops.map((c, k) => `<stop offset="${k / (g.stops.length - 1)}" stop-color="${c}"/>`).join('');
  return `<defs><linearGradient id="bgg" x1="0" y1="0" x2=".35" y2="1">${stops}</linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bgg)" pointer-events="none"/>`;
}

export function renderDesign(d, ctx = {}) {
  const css = (ctx.fontCss || '') + '.ar{font-family:Cairo,Tahoma,sans-serif}.en{font-family:Montserrat,Arial,sans-serif}';
  const bg = d.bg || {};
  const grid = bg.grid === false ? '' : `<defs><pattern id="grid" width="54" height="54" patternUnits="userSpaceOnUse"><path d="M54 0H0V54" fill="none" stroke="#FFFFFF" stroke-opacity=".035" stroke-width="2"/></pattern></defs><rect width="${d.w}" height="${d.h}" fill="url(#grid)" pointer-events="none"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.w}" height="${d.h}" viewBox="0 0 ${d.w} ${d.h}"><style>${css}</style>`
    + `<rect class="bg" width="${d.w}" height="${d.h}" fill="${bg.color || NIGHT}"/>${gradient(bg.gradient, d.w, d.h)}${grid}`
    + (d.els || []).map((e, i) => (e.hidden ? '' : renderElement(e, ctx, i))).join('') + '</svg>';
}

/* ---------- editing helpers ---------- */
export function moveElement(e, dx, dy) {
  const [a, b] = TYPES[e.type].pos;
  e[a] = Math.round(num(e[a]) + dx); e[b] = Math.round(num(e[b]) + dy);
}
export function scaleElement(e, k) {
  TYPES[e.type].scale.forEach((f) => { if (e[f] != null && e[f] !== '' && +e[f] !== 0) e[f] = Math.max(1, Math.round(num(e[f]) * k * 10) / 10); });
}
export function newElement(type, d) {
  const cx = Math.round(d.w / 2); const cy = Math.round(d.h / 2);
  const base = {
    text: { text: 'نص جديد', x: cx, y: cy, size: 80, weight: 800, color: '#FFFFFF', align: 'middle', font: 'ar', maxW: d.w - 160, lh: 1.3, ls: 0 },
    rect: { x: cx - 220, y: cy - 150, w: 440, h: 300, rx: 30, fill: CARD, stroke: EDGE, sw: 3 },
    button: { text: 'سجّل الآن', cx, y: cy - 55, w: 400, h: 110, fill: BERRY, textColor: '#FFFFFF', chevron: true },
    image: { src: DEFAULT_PHOTO, x: 0, y: d.h - 520, w: d.w, h: 520, gray: true, fade: 'top', opacity: 0.6, rx: 0 },
    strawberry: { x: cx - 120, y: cy - 137, w: 240 },
    lockup: { x: 84, y: 90, h: 120, color: '#FFFFFF' },
    art: { art: 'heart', x: cx - 60, y: cy - 50, cell: 14, color: MINT, rotate: 0 },
    mosaic: { pattern: MOSAICS.corner, x: d.w - 216, y: 0, cell: 54 },
    wave: { cx, y: cy, w: 320, sw: 9, tilt: 20, color: MINT },
    icon: { icon: 'code', cx, cy, size: 120, color: MINT },
    social: { platforms: ['facebook', 'instagram', 'linkedin'], cx, cy, r: 64, color: '#FFFFFF' },
    sticker: { kind: 'mention', text: STICKERS.mention.text, sub: '', style: 'light', cx, cy, size: Math.round(d.w / 11), rotate: 0 },
    music: { title: 'اسم الأغنية', artist: '', style: 'card', color: MINT, cx, cy, size: Math.round(d.w / 10.8), rotate: 0 },
    draw: { x: 0, y: 0, pct: 100, pts: [], color: '#FFFFFF', width: 14, brush: 'pen' },
  }[type];
  return { type, ...structuredClone(base) };
}
export const labelOf = (e) => {
  const t = TYPES[e.type]?.name || e.type;
  const txt = e.type === 'text' || e.type === 'button' ? String(e.text || '').split('\n')[0].slice(0, 28) : '';
  if (e.type === 'sticker') return `${t}: ${STICKERS[e.kind]?.name || ''}`;
  if (e.type === 'music') return `${t}: ${String(e.title || '').slice(0, 24)}`;
  return txt ? `${t}: ${txt}` : e.type === 'art' ? `${t}: ${ART[e.art]?.name || ''}` : e.type === 'icon' ? `${t}: ${LINE_ICONS[e.icon]?.name || ''}` : t;
};

/* ---------- the 8 approved templates, as editable designs ---------- */
const T = (text, x, y, size, o = {}) => ({ type: 'text', text, x, y, size, weight: 800, color: '#FFFFFF', align: 'right', font: 'ar', lh: 1.3, ls: 0, ...o });
const LOCK = { type: 'lockup', x: 84, y: 90, h: 120, color: '#FFFFFF' };
const M = (pattern, x, y, cell = 54) => ({ type: 'mosaic', pattern, x, y, cell });
const wid = (p) => Math.max(...p.split('|').map((r) => r.length));
const Mtr = (p, W, cell = 54) => M(p, W - wid(p) * cell, 0, cell);
const Mbl = (p, H, cell = 54) => M(p, 0, H - p.split('|').length * cell, cell);
const Mbr = (p, W, H, cell = 54) => M(p, W - wid(p) * cell, H - p.split('|').length * cell, cell);
const W = 1080; const H = 1350;
const SH = 1920;
const ST = (kind, cx, cy, size, o = {}) => ({ type: 'sticker', kind, text: STICKERS[kind].text, sub: STICKERS[kind].sub || '', style: 'light', cx, cy, size, rotate: 0, ...o });
const card = (x, y, w, h) => ({ type: 'rect', x, y, w, h, rx: 30, fill: CARD, stroke: EDGE, sw: 3 });

function servicesEls() {
  const cw = 430; const ch = 330; const gap = 40;
  const xs = [W - 80 - cw, W - 80 - cw * 2 - gap]; const ys = [560, 560 + ch + gap];
  const items = [['تصميم\nالواجهات', 'design'], ['تطوير\nالبرمجيات', 'code'], ['الاستشارات\nالتقنية', 'gear'], ['الابتكار\nالرقمي', 'idea']];
  return items.flatMap(([text, icon], i) => {
    const x = xs[i % 2]; const y = ys[Math.floor(i / 2)]; const cx = x + cw / 2;
    return [card(x, y, cw, ch), { type: 'icon', icon, cx, cy: y + 92, size: 96, color: MINT },
      T(text, cx, y + 205, 50, { align: 'middle', weight: 700, maxW: cw - 60, lh: 1.24 })];
  });
}

export const BUILTIN = [
  {
    id: 'intro', name: 'منشور تعريفي', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      { type: 'image', src: DEFAULT_PHOTO, x: 0, y: 860, w: W, h: 490, gray: true, fade: 'top', opacity: 0.6, rx: 0 },
      Mtr('..nm|.d.b|nm..|...s', W), Mbl('b...|.m..|bdm.|m.nb', H), LOCK,
      T('معاً نبني', 990, 540, 128, { maxW: 900 }),
      T('مستقبلاً رقمياً', 990, 700, 134, { color: MINT, maxW: 900 }),
      { type: 'wave', cx: 640, y: 765, w: 360, sw: 9, tilt: 20, color: MINT },
      T('BUILD · INNOVATE · GROW', 540, 855, 34, { font: 'en', align: 'middle', weight: 600, color: MUTED, ls: 10 }),
    ],
  },
  {
    id: 'services', name: 'خدماتنا', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      Mtr('...mn|..nb.|.m.dm|...n.', W, 50), Mbl('m.|bn|.m|nb', H, 50), LOCK,
      T('خدماتنا', 540, 445, 116, { align: 'middle', maxW: 900 }),
      { type: 'wave', cx: 540, y: 495, w: 300, sw: 9, tilt: 20, color: MINT },
      ...servicesEls(),
    ],
  },
  {
    id: 'hiring', name: 'نبحث عن مواهب', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      Mtr('..mb|.n.m|d.n.|...d', W), Mbl('m...|bn..|.dm.|nmbn', H), LOCK,
      { type: 'art', art: 'megaphone', x: 738, y: 446, cell: 19, rotate: -24 },
      { type: 'wave', cx: 715, y: 430, w: 60, sw: 10, tilt: 40, color: MINT },
      T('نبحث عن', 380, 560, 104, { align: 'middle', maxW: 600 }),
      T('مواهب مبدعة!', 380, 700, 112, { align: 'middle', color: MINT, maxW: 600 }),
      { type: 'wave', cx: 380, y: 760, w: 320, sw: 9, tilt: 20, color: MINT },
      T('كن جزءاً من فريقنا', 380, 870, 50, { align: 'middle', weight: 600, color: '#E5E9F0', maxW: 600 }),
      { type: 'button', text: 'قدم الآن', cx: 380, y: 930, w: 380, h: 112, fill: BERRY, textColor: '#FFFFFF', chevron: true },
    ],
  },
  {
    id: 'quote', name: 'اقتباس', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      Mtr('.nm.|bd.m|..nb|...m', W), Mbl('b..|m.n|dbm|nmb', H),
      { type: 'art', art: 'quote', x: 449, y: 250, cell: 26, color: MINT, rotate: 0 },
      T('الأفكار العظيمة\nتبدأ من هنا...', 540, 560, 98, { align: 'middle', maxW: 900, lh: 1.33 }),
      { type: 'wave', cx: 540, y: 760, w: 320, sw: 9, tilt: 20, color: MINT },
      T('BEIT LAHIA TECH', 540, 865, 32, { font: 'en', align: 'middle', weight: 600, color: MUTED, ls: 8 }),
      { type: 'strawberry', x: 760, y: 1010, w: 240 },
    ],
  },
  {
    id: 'event', name: 'حدث / ورشة', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      Mtr('..nm|.bd.|n.m.|...n', W), Mbr('...mm|..msm|.mmsm|mmsmm', W, H), M('b.|.n|m.', 0, H - 240, 40), LOCK,
      { type: 'art', art: 'rocket', x: 763, y: 312, cell: 26, rotate: 38 },
      { type: 'button', text: 'حدث تقني', cx: 380, y: 290, w: 260, h: 78, fill: MINT, textColor: NIGHT, chevron: false },
      T('مستقبل', 380, 490, 104, { align: 'middle', maxW: 560 }),
      T('التكنولوجيا', 380, 610, 108, { align: 'middle', maxW: 560 }),
      T('في بيت لاهيا', 380, 700, 72, { align: 'middle', weight: 700, maxW: 560 }),
      card(90, 760, 580, 220),
      { type: 'icon', icon: 'calendar', cx: 610, cy: 830, size: 52, color: MINT },
      T('السبت، 24 مايو', 565, 846, 42, { weight: 700, maxW: 460 }),
      { type: 'icon', icon: 'pin', cx: 610, cy: 920, size: 52, color: MINT },
      T('مركز بيت لاهيا التقني', 565, 936, 42, { weight: 700, maxW: 460 }),
      { type: 'button', text: 'سجل الآن', cx: 380, y: 1040, w: 400, h: 112, fill: BERRY, textColor: '#FFFFFF', chevron: true },
    ],
  },
  {
    // the approved workshop / course announcement: trainer photo, title, three info cards, register bar
    id: 'workshop', name: 'ورشة / دورة', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      M('.d|nb|m.', 0, 0, 40), Mbr('...nm|..mb.|.b.ms', W, H, 40), LOCK,
      { type: 'rect', x: 800, y: 52, w: 222, h: 72, rx: 36, fill: '', stroke: MINT, sw: 3 },
      T('ورشة عمل', 911, 101, 34, { align: 'middle', color: MINT, maxW: 190 }),
      // the photo in a glowing ring
      { type: 'rect', x: 318, y: 128, w: 444, h: 444, rx: 222, fill: '', stroke: MINT, sw: 26, opacity: 0.14 },
      { type: 'rect', x: 336, y: 146, w: 408, h: 408, rx: 204, fill: '', stroke: MINT, sw: 8 },
      { type: 'image', src: '', label: 'صورة المدرّب', x: 354, y: 164, w: 372, h: 372, gray: false, fade: 'none', opacity: 1, rx: 186 },
      M('..m|.m.|b..|.m.|..m', 214, 236, 34), M('m..|.m.|..b|.m.|m..', 764, 236, 34),
      // title: one word in mint
      T('المبرمج', 552, 668, 84, { align: 'left' }),
      T('المعزّز', 528, 668, 84, { align: 'right', color: MINT }),
      T('من الفكرة إلى الكود', 540, 778, 86, { align: 'middle', maxW: 960 }),
      { type: 'rect', x: 70, y: 829, w: 200, h: 3, rx: 1, fill: MINT, opacity: 0.6 },
      { type: 'rect', x: 810, y: 829, w: 200, h: 3, rx: 1, fill: MINT, opacity: 0.6 },
      T('AI-Powered', 532, 843, 36, { font: 'en', align: 'right', weight: 700, color: '#9AA6BC' }),
      T('Development', 548, 843, 36, { font: 'en', align: 'left', weight: 700, color: BERRY }),
      T('4 ساعات عملية تبرمج فيها مع الذكاء الاصطناعي،\nوتطلع بمشروع شغّال وشهادة إتمام.', 540, 912, 33, { align: 'middle', weight: 600, color: '#E5E9F0', maxW: 900, lh: 1.45 }),
      ...[[714, 'calendar', 'التاريخ', 'السبت 21/11', 'ar'], [390, 'video', 'المكان', 'Google Meet', 'en'], [66, 'timer', 'المدة', '4 ساعات', 'ar']].flatMap(([x, icon, label, value, font]) => [
        { type: 'rect', x, y: 1010, w: 300, h: 132, rx: 24, fill: CARD, stroke: EDGE, sw: 2 },
        { type: 'icon', icon, cx: x + 258, cy: 1052, size: 40, color: MINT },
        T(label, x + 226, 1062, 26, { weight: 600, color: '#9AA6BC' }),
        T(value, x + 150, 1118, 36, { align: 'middle', font, maxW: 260 }),
      ]),
      { type: 'rect', x: 66, y: 1170, w: 948, h: 108, rx: 54, fill: MINT },
      T('سجّل مكانك الآن', 800, 1238, 42, { align: 'middle', color: NIGHT, maxW: 380 }),
      { type: 'rect', x: 588, y: 1196, w: 3, h: 56, rx: 1, fill: NIGHT, opacity: 0.6 },
      { type: 'icon', icon: 'globe', cx: 132, cy: 1224, size: 46, color: NIGHT },
      T('beitlahia.tech/workshop', 172, 1236, 31, { font: 'en', align: 'left', weight: 700, color: NIGHT, maxW: 390 }),
      T('ROOTED HERE. BUILT FOR TOMORROW.', 540, 1318, 22, { font: 'en', align: 'middle', weight: 600, color: '#9AA6BC', ls: 8 }),
    ],
  },
  {
    id: 'story', name: 'ستوري', w: W, h: 1920, bg: { color: NIGHT, grid: true },
    els: [
      { type: 'image', src: DEFAULT_PHOTO, x: 0, y: 980, w: W, h: 940, gray: true, fade: 'top', opacity: 0.62, rx: 0 },
      Mtr('..nm|.bd.|nm.m|...b|..n.', W, 60), { ...LOCK, x: 90, y: 120, h: 130 },
      T('من بيت لاهيا إلى العالم الرقمي', 540, 760, 76, { align: 'middle', maxW: 900 }),
      { type: 'wave', cx: 540, y: 830, w: 340, sw: 9, tilt: 20, color: MINT },
      { type: 'rect', x: 110, y: 1430, w: 9, h: 350, rx: 4, fill: MINT },
      T('Build\nInnovate\nGrow', 155, 1510, 96, { font: 'en', align: 'left', weight: 700, lh: 1.23 }),
    ],
  },
  {
    id: 'thanks', name: 'شكراً لكم', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      Mtr('..mb|...m|..n.', W), Mbl('b...|....|m.n.|mb..|.mm.|m.mn', H), LOCK,
      T('شكراً لكم', 540, 700, 170, { align: 'middle', maxW: 920 }),
      T('لأنكم جزء من رحلتنا', 540, 810, 56, { align: 'middle', weight: 600, color: '#E5E9F0', maxW: 860 }),
      { type: 'wave', cx: 490, y: 970, w: 320, sw: 10, tilt: 60, color: MINT },
      { type: 'art', art: 'heart', x: 690, y: 880, cell: 13, color: MINT, rotate: 0 },
      { type: 'strawberry', x: 740, y: 1040, w: 240 },
    ],
  },
  {
    id: 'follow', name: 'تابعونا', w: W, h: H, bg: { color: NIGHT, grid: true },
    els: [
      Mtr('..mb|.n.m|...n', W), Mbl('n...|bm..|mbn.', H), LOCK,
      T('تابعونا', 540, 650, 176, { align: 'middle', maxW: 920 }),
      T('للمزيد من المستجدات', 540, 770, 58, { align: 'middle', weight: 600, color: '#E5E9F0', maxW: 900 }),
      { type: 'social', platforms: ['linkedin', 'x', 'youtube', 'instagram'], cx: 540, cy: 930, r: 64, color: '#FFFFFF' },
      T('@beitlahiatech', 540, 1100, 44, { font: 'en', align: 'middle', weight: 700, color: MINT, hidden: true }),
    ],
  },

  /* ---- stories (1080×1920) with Instagram-style stickers ---- */
  {
    id: 'story-event', name: 'ستوري: ورشة', w: W, h: SH, bg: { color: NIGHT, grid: true, gradient: 'night' },
    els: [
      Mtr('..nm|.bd.|nm.m|...b', W, 60), { ...LOCK, x: 90, y: 120, h: 130 },
      T('ورشة جديدة', 540, 560, 60, { align: 'middle', color: NIGHT, bgStyle: 'solid', bgColor: MINT }),
      T('أساسيات\nتطوير الويب', 540, 770, 124, { align: 'middle', maxW: 940, lh: 1.22 }),
      ST('countdown', 540, 1200, 104, { text: 'الورشة بتبلّش', sub: 'السبت 24 مايو · 5 م' }),
      ST('location', 540, 1470, 92, { text: 'بيت لاهيا', style: 'glass' }),
      ST('link', 540, 1640, 96, { text: 'beitlahia.tech/join' }),
    ],
  },
  {
    id: 'story-poll', name: 'ستوري: تصويت', w: W, h: SH, bg: { color: NIGHT, grid: false, gradient: 'insta' },
    els: [
      { ...LOCK, x: 90, y: 120, h: 120 },
      T('سؤال اليوم', 540, 560, 58, { align: 'middle', bgStyle: 'soft', bgColor: '#000000' }),
      T('شو أكثر مجال\nبتحب تتعلمه؟', 540, 770, 112, { align: 'middle', maxW: 960, lh: 1.24, effect: 'shadow' }),
      ST('poll', 540, 1180, 116, { text: '', sub: 'برمجة|تصميم' }),
      ST('slider', 540, 1520, 100, { text: 'قديش متحمس للورشة الجاية؟', sub: '🔥' }),
      ST('mention', 540, 1760, 84, { text: 'beitlahia.tech' }),
    ],
  },
  {
    id: 'story-music', name: 'ستوري: صورة وموسيقى', w: W, h: SH, bg: { color: NIGHT, grid: false },
    els: [
      { type: 'image', src: DEFAULT_PHOTO, x: 0, y: 0, w: W, h: SH, filter: 'clarendon', gray: false, fade: 'none', opacity: 1, rx: 0 },
      { type: 'rect', x: 0, y: 1100, w: W, h: 820, rx: 0, fill: NIGHT, opacity: 0.45 },
      { ...LOCK, x: 90, y: 120, h: 120 },
      { type: 'music', title: 'اسم الأغنية', artist: 'الفنان', style: 'card', color: BERRY, cx: 540, cy: 1310, size: 100, rotate: -3 },
      T('ليالي بيت لاهيا', 540, 1560, 100, { align: 'middle', color: MINT, effect: 'neon', maxW: 960 }),
      ST('hashtag', 540, 1730, 86, { text: 'بيت_لاهيا_التقني', style: 'glass' }),
    ],
  },
  {
    id: 'story-ask', name: 'ستوري: اسألنا', w: W, h: SH, bg: { color: NIGHT, grid: true, gradient: 'aurora' },
    els: [
      { ...LOCK, x: 90, y: 120, h: 120 },
      T('عندك سؤال عن\nالبرمجة أو التصميم؟', 540, 620, 100, { align: 'middle', maxW: 960, lh: 1.25 }),
      ST('question', 540, 1060, 116, { text: 'اسألنا أي إشي', sub: 'اكتب سؤالك هون…' }),
      { type: 'draw', x: 0, y: 0, pct: 100, color: '#FFFFFF', width: 12, brush: 'pen',
        pts: [[820, 1520], [800, 1470], [770, 1420], [735, 1380], [700, 1350]] },
      { type: 'draw', x: 0, y: 0, pct: 100, color: '#FFFFFF', width: 12, brush: 'pen', pts: [[700, 1350], [745, 1352]] },
      { type: 'draw', x: 0, y: 0, pct: 100, color: '#FFFFFF', width: 12, brush: 'pen', pts: [[700, 1350], [712, 1394]] },
      T('منجاوب عالكل!', 700, 1620, 64, { align: 'middle', weight: 700, rotate: -6 }),
    ],
  },
].map((d) => ({ v: 1, ...d }));
