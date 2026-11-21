// Admin › «استوديو السوشيال»: a small design editor for the social templates.
// Pick a template (built-in or saved), edit its texts, or switch to «التصميم» to select elements on the
// canvas, drag / resize them, change their properties, add or delete elements, and save the result as a
// template of your own (Firestore › socialTemplates). Then download it (PNG) or publish it to
// Facebook / Instagram now or later through the social Worker (social-worker/ in the repo).
import {
  BUILTIN, TYPES, ART, LINE_ICONS, MOSAICS, SIZES, BRAND_COLORS, SOCIAL_ICON_KEYS, FONT_URL, DEFAULT_PHOTO,
  STICKERS, GRADIENTS, BRUSHES,
  renderDesign, moveElement, scaleElement, newElement, labelOf,
} from './social-templates.js';
import { videoSupported, decodeAudio, renderClip, makeVideo, MAX_SECONDS, fmtTime } from './story-video.js';
import { workshopCampaign } from './social-campaign.js';
import { SOCIAL_PLATFORMS } from './content-defaults.js';

const $ = (id) => document.getElementById(id);
const WORKER = (() => { try { return localStorage.getItem('blt-social-worker') || ''; } catch { return ''; } })() || 'https://social.beitlahia.tech';
const STORE = 'blt-studio-v2';
const SVGNS = 'http://www.w3.org/2000/svg';
const PHOTOS = [['/img/beit-lahia-night.jpg', 'بيت لاهيا بالليل'], ['/img/beit-lahia-fields.jpg', 'حقول الفراولة']];
const STATUS = {
  approved: ['تمّت الموافقة · بانتظار خدمة النشر', 'st-scheduled'],
  pending: ['بانتظار الموافقة', 'st-scheduled'],
  scheduled: ['مجدول', 'st-scheduled'], publishing: ['عم ينتشر', 'st-publishing'], published: ['انتشر', 'st-published'],
  partial: ['انتشر جزئياً', 'st-partial'], failed: ['فشل', 'st-failed'], uploading: ['عم ينرفع', 'st-publishing'],
};
const PLATFORM_NAME = { facebook: 'فيسبوك', instagram: 'إنستغرام' };
const whenFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const clone = (o) => JSON.parse(JSON.stringify(o));

let deps; // { h, toast, setBusy, getToken, db, fs, user }
let started = false;
const state = {
  src: { kind: 'builtin', id: BUILTIN[0].id }, // where the working design came from
  base: '',            // JSON of the source, to know if there are unsaved changes
  design: clone(BUILTIN[0]), // the page on the canvas
  deck: null,                 // page 1 (the design itself); pages 2… live in deck.more
  page: 0,
  sel: -1, pane: 'content',
  undo: [], redo: [],
  mine: [], caption: '', conn: null, posts: [],
  pen: { on: false, color: '#FFFFFF', width: 14, brush: 'pen' }, // drawing on the canvas
  music: null, // { file, name, audio: AudioBuffer, start, dur, vol, fade, motion } (memory only: the file is big)
  campaign: null, // a workshop campaign being prepared (memory only)
  suggest: null, // pending suggestions from the gallery studio (socialSuggestions)
  albums: null,  // the albums published on the site's gallery
  postsView: (() => { try { return localStorage.getItem('blt-studio-view') || 'cal'; } catch { return 'cal'; } })(),
  calMonth: null, calSel: null,
  notify: null,
  editing: null, // { post, mode: 'edit' | 'copy', orig } while a post from the list is open in the editor
};

/* =================== pages: a carousel post / a multi-page story =================== */
// The design is page 1; more pages ride along in design.more (same size, own background and elements).
const MAX_PAGES = 10; // Instagram's carousel limit
const pages = () => [state.deck, ...(state.deck.more || [])];
const pageCount = () => 1 + (state.deck.more?.length || 0);
function setDeck(d, page = 0) {
  if (d.more && !d.more.length) delete d.more;
  state.deck = d;
  state.page = Math.min(Math.max(0, page), pageCount() - 1);
  state.design = pages()[state.page];
}
function goPage(k) {
  if (k === state.page || k < 0 || k >= pageCount()) return;
  if (state.pen.on) setPen(false);
  state.page = k; state.design = pages()[k]; state.sel = -1;
  refreshAll(); renderPages();
}
function blankPage(from = state.design) {
  return { w: from.w, h: from.h, bg: clone(from.bg || {}), els: [] };
}
function addPage(copy) {
  if (pageCount() >= MAX_PAGES) { deps.toast(`أكثر شي ${MAX_PAGES} صفحات`, true); return; }
  checkpoint(true);
  const pg = copy ? (({ more, name, id, v, ...rest }) => clone(rest))(state.design) : blankPage();
  const more = state.deck.more || (state.deck.more = []);
  more.splice(state.page, 0, pg); // right after the current page
  state.page += 1; state.design = pages()[state.page]; state.sel = -1;
  refreshAll(); renderPages(); syncPublishUi();
}
function removePage(k) {
  if (pageCount() < 2) return;
  if (!confirm(`نحذف الصفحة ${k + 1}؟`)) return;
  checkpoint(true);
  if (k === 0) { // page 1 is the design itself: page 2 takes its place, keeping the name and id
    const [next, ...rest] = state.deck.more;
    const { more, ...head } = state.deck;
    setDeck({ ...head, w: next.w, h: next.h, bg: next.bg, els: next.els, more: rest }, 0);
  } else {
    state.deck.more.splice(k - 1, 1);
    setDeck(state.deck, Math.min(state.page, pageCount() - 1));
  }
  state.sel = -1; refreshAll(); renderPages(); syncPublishUi();
}
function movePage(k, dir) {
  const j = k + dir;
  if (j < 0 || j >= pageCount()) return;
  checkpoint(true);
  const all = pages().map((pg) => { const { more, ...rest } = pg; return rest; });
  [all[k], all[j]] = [all[j], all[k]];
  const head = state.deck; const { more, ...meta } = head;
  const first = all[0];
  setDeck({ ...meta, w: first.w, h: first.h, bg: first.bg, els: first.els, more: all.slice(1).map(({ name, id, v, ...pg }) => pg) }, j);
  state.sel = -1; refreshAll(); renderPages();
}
function renderPages() {
  const box = $('studio-pages'); if (!box) return;
  const h = deps.h; const n = pageCount();
  box.replaceChildren(
    ...pages().map((pg, k) => {
      const art = h('span', { class: 'pg-art', 'aria-hidden': 'true' });
      art.innerHTML = renderDesign(pg, { measure }); // escaped renderer output
      const on = k === state.page;
      return h('div', { class: `pg${on ? ' is-on' : ''}` },
        h('button', { type: 'button', class: 'pg-pick', 'aria-label': `الصفحة ${k + 1} من ${n}`, 'aria-current': on ? 'true' : null, onclick: () => goPage(k) },
          art, h('span', { class: 'pg-no' }, String(k + 1))),
        n > 1 ? h('div', { class: 'pg-tools' },
          h('button', { type: 'button', title: 'لقدّام', 'aria-label': `انقل الصفحة ${k + 1} لقدّام`, disabled: k === 0, onclick: () => movePage(k, -1) }, '→'),
          h('button', { type: 'button', title: 'احذف الصفحة', 'aria-label': `احذف الصفحة ${k + 1}`, class: 'is-del', onclick: () => removePage(k) }, '×'),
          h('button', { type: 'button', title: 'لورا', 'aria-label': `انقل الصفحة ${k + 1} لورا`, disabled: k === n - 1, onclick: () => movePage(k, 1) }, '←')) : '');
    }),
    n < MAX_PAGES ? h('div', { class: 'pg-add' },
      h('button', { type: 'button', class: 'pg-new', onclick: () => addPage(true), title: 'نسخة من الصفحة الحالية' }, h('span', { 'aria-hidden': 'true' }, '+'), 'نسخة'),
      h('button', { type: 'button', class: 'pg-new is-blank', onclick: () => addPage(false), title: 'صفحة فاضية بنفس الخلفية' }, h('span', { 'aria-hidden': 'true' }, '+'), 'فاضية')) : '',
  );
  $('studio-pages-note').textContent = n > 1
    ? `${n} صفحات: المنشور بيطلع كاروسيل (سحب يمين وشمال)، والستوري بتطلع ${n} ستوريات ورا بعض.`
    : 'ضيف صفحة ثانية لتعمل كاروسيل (بوست فيه أكثر من صورة) أو ستوري متتالي.';
}

/* =================== persistence (the working design survives a reload) =================== */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && s.design && Array.isArray(s.design.els)) {
      state.src = s.src; setDeck(s.design, s.page || 0); state.base = s.base || ''; state.caption = s.caption || '';
      return;
    }
  } catch { /* fresh start */ }
  setDeck(state.design);
  state.base = JSON.stringify(state.deck);
}
let saveT;
function persist() {
  if (state.src.kind === 'campaign') {
    const it = state.campaign?.items.find((x) => x.key === state.src.id);
    if (it) { it.design = state.deck; refreshCampaignThumbs(); }
  }
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ src: state.src, design: state.deck, page: state.page, base: state.base, caption: state.caption })); } catch { /* too big / private */ }
  }, 300);
  $('studio-dirty').hidden = !dirty();
}
const dirty = () => JSON.stringify(state.deck) !== state.base;

/* =================== history =================== */
let lastCheck = 0;
function checkpoint(force = false) {
  const now = Date.now();
  if (!force && now - lastCheck < 700) return; // typing in one field = one undo step
  lastCheck = now;
  state.undo.push(snap());
  if (state.undo.length > 60) state.undo.shift();
  state.redo = [];
}
// a history step is the whole deck + the page that was open
const snap = () => JSON.stringify({ p: state.page, d: state.deck });
function restore(json) {
  const { p, d } = JSON.parse(json);
  const before = pageCount();
  setDeck(d, p);
  if (state.sel >= state.design.els.length) state.sel = -1;
  lastCheck = 0; refreshAll(); renderPages();
  if (before !== pageCount()) syncPublishUi();
}
function undo() {
  if (!state.undo.length) return;
  state.redo.push(snap());
  restore(state.undo.pop());
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(snap());
  restore(state.redo.pop());
}

/* =================== text measuring with the real fonts =================== */
const mctx = document.createElement('canvas').getContext('2d');
export const measure = (text, px, weight, family) => { mctx.font = `${weight} ${px}px ${family}`; return mctx.measureText(text).width; };
export const fontsReady = Promise.all(['400', '600', '700', '800'].flatMap((w) => [`${w} 40px Cairo`, `${w} 40px Montserrat`]).map((f) => document.fonts.load(f, 'ابت abc'))).catch(() => {});

/* =================== template pickers =================== */
function thumb(design, on, onPick) {
  const b = deps.h('button', { type: 'button', class: 'tpl-thumb', role: 'radio', 'aria-checked': String(on), title: design.name, onclick: onPick });
  const art = deps.h('span', { class: 'tpl-art', 'aria-hidden': 'true' });
  art.innerHTML = renderDesign(design, { measure }); // every text inside is escaped by the renderer
  b.append(art, deps.h('span', { class: 'tpl-name' }, design.name));
  return b;
}
function renderPickers() {
  const cur = state.src;
  $('tpl-picker').replaceChildren(...BUILTIN.map((d) => thumb(d, cur.kind === 'builtin' && cur.id === d.id, () => openDesign('builtin', d.id))));
  $('tpl-mine-wrap').hidden = !state.mine.length;
  $('tpl-mine').replaceChildren(...state.mine.map((m) => thumb(m.design, cur.kind === 'mine' && cur.id === m.id, () => openDesign('mine', m.id))));
  $('tpl-delete').hidden = cur.kind !== 'mine';
  $('tpl-save').hidden = cur.kind !== 'mine';
}
function sourceDesign(kind, id) {
  if (kind === 'post') return state.editing && state.editing.post.id === id ? clone(state.editing.orig) : null;
  if (kind === 'campaign') { const it = state.campaign?.items.find((x) => x.key === id); return it && clone(it.orig); }
  if (kind === 'mine') { const m = state.mine.find((x) => x.id === id); return m && clone(m.design); }
  const b = BUILTIN.find((x) => x.id === id); return b && clone(b);
}
function openDesign(kind, id) {
  if (kind === state.src.kind && id === state.src.id) return;
  if (dirty() && !confirm('عندك تعديلات على القالب الحالي ما انحفظت. تفتح قالب تاني وتتركها؟')) return;
  const d = sourceDesign(kind, id);
  if (!d) return;
  state.src = { kind, id }; setDeck(d); state.base = JSON.stringify(d);
  state.sel = -1; state.undo = []; state.redo = [];
  stopEditing(); refreshAll(); renderPickers(); renderPages(); autoFormats();
}

/* =================== content pane: quick text editing =================== */
function renderContent() {
  const els = state.design.els;
  const rows = els.map((e, i) => [e, i]).filter(([e]) => ['text', 'button', 'sticker', 'music'].includes(e.type));
  if (!rows.length) { $('tpl-fields').replaceChildren(deps.h('p', { class: 'muted small' }, 'ما في نصوص بهالقالب. ضيف نص من «التصميم».')); return; }
  let n = 0;
  $('tpl-fields').replaceChildren(...rows.map(([e, i]) => {
    const id = `sc-${i}`;
    const key = e.type === 'music' ? 'title' : 'text';
    const multi = e.type === 'text' && (String(e.text || '').includes('\n') || (e.size || 0) >= 90);
    const input = deps.h(multi ? 'textarea' : 'input', {
      id, rows: multi ? 2 : null, type: multi ? null : 'text', value: e[key] ?? '', dir: e.font === 'en' ? 'ltr' : 'auto',
      onfocus: () => select(i, false),
      oninput: (ev) => { checkpoint(); e[key] = ev.target.value; renderStage(); persist(); },
    });
    const label = e.type === 'sticker' ? `ملصق: ${STICKERS[e.kind]?.name || ''}` : e.type === 'music' ? 'ملصق الموسيقى: اسم الأغنية'
      : `${e.type === 'button' ? 'زر' : 'نص'} ${++n}`;
    return deps.h('div', { class: 'field' }, deps.h('label', { for: id }, label + (e.hidden ? ' (مخفي)' : '')), input);
  }));
}

/* =================== the canvas =================== */
let stageSvg = null;
let pagesT = 0;
function refreshPageThumb() {
  const art = document.querySelector(`#studio-pages .pg:nth-child(${state.page + 1}) .pg-art`);
  if (art) art.innerHTML = renderDesign(state.design, { measure }); else renderPages();
}
function renderStage() {
  const stage = $('studio-stage');
  stage.innerHTML = renderDesign(state.design, { measure }); // escaped renderer output
  stageSvg = stage.querySelector('svg');
  stage.classList.toggle('is-tall', state.design.h > state.design.w * 1.4);
  stage.style.setProperty('--ar', (state.design.h / state.design.w).toFixed(3));
  $('studio-size').textContent = `${state.design.w} × ${state.design.h} بكسل · ${state.design.els.length} عنصر${pageCount() > 1 ? ` · صفحة ${state.page + 1} من ${pageCount()}` : ''}`;
  clearTimeout(pagesT); pagesT = setTimeout(refreshPageThumb, 250);
  drawSelection();
  syncToolbar();
}
function bboxOf(i) {
  const g = stageSvg && stageSvg.querySelector(`[data-i="${i}"]`);
  if (!g) return null;
  try { const b = g.getBBox(); return b.width || b.height ? b : null; } catch { return null; }
}
function drawSelection(guides = []) {
  if (!stageSvg) return;
  stageSvg.querySelector('.sel-ui')?.remove();
  const ui = document.createElementNS(SVGNS, 'g'); ui.setAttribute('class', 'sel-ui');
  guides.forEach(([x1, y1, x2, y2]) => ui.append(svgEl('line', { x1, y1, x2, y2, class: 'sel-guide' })));
  const b = state.sel >= 0 && bboxOf(state.sel);
  if (b) {
    const pad = 6;
    ui.append(svgEl('rect', { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2, class: 'sel-box' }));
    const hs = Math.max(30, state.design.w / 26); // ~16px on screen: easy to grab, also by finger
    ui.append(svgEl('rect', { x: b.x + b.width + pad - hs / 2, y: b.y + b.height + pad - hs / 2, width: hs, height: hs, rx: 4, class: 'sel-handle' }));
    const e = state.design.els[state.sel];
    if (canRotate(e)) { // a round handle above the element: drag it around to turn it
      const cx = b.x + b.width / 2; const top = b.y - pad; const stem = hs * 1.6;
      ui.append(svgEl('line', { x1: cx, y1: top, x2: cx, y2: top - stem, class: 'sel-stem' }));
      ui.append(svgEl('circle', { cx, cy: top - stem, r: hs * 0.62, class: 'sel-rot' }));
      ui.append(svgEl('path', { d: rotIcon(cx, top - stem, hs * 0.32), class: 'sel-rot-ico' }));
      if (drag?.mode === 'rotate') {
        const label = svgEl('text', { x: cx, y: top - stem - hs * 1.05, class: 'sel-angle', 'text-anchor': 'middle', 'font-size': hs * 0.9 });
        label.textContent = `${Math.round(e.rotate || 0)}°`;
        ui.append(label);
      }
    }
  }
  stageSvg.append(ui);
}
const canRotate = (e) => !!e && TYPES[e.type]?.props.some((p) => p[0] === 'rotate');
// a circular arrow, drawn inside the rotation handle
const rotIcon = (cx, cy, r) => `M${cx + r} ${cy}A${r} ${r} 0 1 1 ${cx} ${cy - r}M${cx - r * 0.35} ${cy - r * 1.35}L${cx} ${cy - r}L${cx - r * 0.35} ${cy - r * 0.62}`;
function svgEl(tag, attrs) { const el = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); return el; }
function toSvg(ev) {
  const pt = stageSvg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(stageSvg.getScreenCTM().inverse());
}

// drag = move · corner handle = resize (keeps the element's top-left corner where it was)
let drag = null;
function onDown(ev) {
  if (!stageSvg || ev.button > 0) return;
  if (state.pen.on) { startStroke(ev); return; }
  const handle = ev.target.closest('.sel-handle');
  const turn = ev.target.closest('.sel-rot, .sel-rot-ico');
  const g = ev.target.closest('[data-i]');
  if (!handle && !turn && !g) { select(-1); return; }
  const i = handle || turn ? state.sel : +g.dataset.i;
  if (i !== state.sel) select(i);
  const p = toSvg(ev); const b = bboxOf(i);
  if (!b) return;
  drag = { i, mode: turn ? 'rotate' : handle ? 'resize' : 'move', p0: p, el0: clone(state.design.els[i]), b0: { x: b.x, y: b.y, width: b.width, height: b.height }, moved: false };
  if (turn) { drag.c = { x: b.x + b.width / 2, y: b.y + b.height / 2 }; drag.a0 = Math.atan2(p.y - drag.c.y, p.x - drag.c.x); }
  try { $('studio-stage').setPointerCapture(ev.pointerId); } catch { /* not a real pointer */ }
  ev.preventDefault();
}
let dragRaf = 0; let pending = null;
function onMove(ev) {
  if (!drag) return;
  if (drag.mode === 'draw') { extendStroke(ev); return; }
  pending = { p: toSvg(ev), shift: ev.shiftKey };
  cancelAnimationFrame(dragRaf);
  dragRaf = requestAnimationFrame(applyDrag);
}
function applyDrag() {
  if (!drag || !pending) return;
  const { p, shift } = pending; pending = null;
  {
    let dx = p.x - drag.p0.x; let dy = p.y - drag.p0.y;
    if (!drag.moved) { if (Math.hypot(dx, dy) < 3) return; checkpoint(true); drag.moved = true; }
    const el = clone(drag.el0);
    const guides = [];
    if (drag.mode === 'rotate') {
      // the angle the pointer turned around the element's centre; Shift = steps of 15°, near 0/45/90… it snaps
      const a = Math.atan2(p.y - drag.c.y, p.x - drag.c.x);
      let deg = (drag.el0.rotate || 0) + (a - drag.a0) * 180 / Math.PI;
      deg = ((deg + 540) % 360) - 180;
      const step = shift ? 15 : 45; const near = Math.round(deg / step) * step;
      if (shift || Math.abs(deg - near) < 4) deg = near;
      el.rotate = Math.round(deg) === -180 ? 180 : Math.round(deg);
      state.design.els[drag.i] = el;
      renderStage();
    } else if (drag.mode === 'move') {
      // snap the element's centre to the canvas centre lines
      const { w, h } = state.design; const snap = w / 90;
      const cx = drag.b0.x + drag.b0.width / 2 + dx; const cy = drag.b0.y + drag.b0.height / 2 + dy;
      if (Math.abs(cx - w / 2) < snap) { dx += w / 2 - cx; guides.push([w / 2, 0, w / 2, h]); }
      if (Math.abs(cy - h / 2) < snap) { dy += h / 2 - cy; guides.push([0, h / 2, w, h / 2]); }
      if (shift) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      moveElement(el, dx, dy);
      state.design.els[drag.i] = el;
      renderStage(); drawSelection(guides);
    } else {
      const k = Math.max(0.1, Math.max((drag.b0.width + dx) / drag.b0.width, (drag.b0.height + dy) / drag.b0.height));
      scaleElement(el, k);
      state.design.els[drag.i] = el;
      renderStage();
      const nb = bboxOf(drag.i); // keep the top-left corner fixed
      if (nb) { moveElement(el, drag.b0.x - nb.x, drag.b0.y - nb.y); renderStage(); }
    }
  }
}
function onUp() {
  if (!drag) return;
  if (drag.mode === 'draw') { drag = null; persist(); renderLayers(); return; }
  cancelAnimationFrame(dragRaf);
  applyDrag(); // a fast release must not drop the last movement
  const moved = drag.moved; drag = null;
  if (moved) { persist(); renderProps(); renderLayers(); }
  drawSelection();
}

/* =================== the pen: draw on the canvas (Instagram «ارسم») =================== */
function startStroke(ev) {
  const p = toSvg(ev);
  checkpoint(true);
  const { color, width, brush } = state.pen;
  state.design.els.push({ type: 'draw', x: 0, y: 0, pct: 100, pts: [[Math.round(p.x), Math.round(p.y)]], color, width, brush });
  drag = { mode: 'draw', i: state.design.els.length - 1 };
  try { $('studio-stage').setPointerCapture(ev.pointerId); } catch { /* not a real pointer */ }
  ev.preventDefault();
  renderStage();
}
let penRaf = 0;
function extendStroke(ev) {
  const el = state.design.els[drag.i]; const p = toSvg(ev);
  const last = el.pts[el.pts.length - 1];
  if (Math.hypot(p.x - last[0], p.y - last[1]) < state.design.w / 300) return; // ~3 px: keeps the path light
  el.pts.push([Math.round(p.x), Math.round(p.y)]);
  cancelAnimationFrame(penRaf); penRaf = requestAnimationFrame(renderStage);
}
function setPen(on) {
  state.pen.on = on;
  if (on) { state.sel = -1; }
  $('tb-draw').setAttribute('aria-pressed', String(on));
  $('studio-stage').classList.toggle('is-drawing', on);
  renderDrawbar(); drawSelection(); syncToolbar();
}
function renderDrawbar() {
  const bar = $('studio-drawbar');
  bar.hidden = !state.pen.on;
  if (!state.pen.on) return;
  const pen = state.pen;
  const colors = ['#FFFFFF', '#35E69B', '#F22964', '#FFD166', '#2F80ED', '#8A3AB9', '#0B1020'];
  bar.replaceChildren(
    deps.h('div', { class: 'db-row', role: 'radiogroup', 'aria-label': 'نوع القلم' }, BRUSHES.map(([k, n]) => deps.h('button', {
      type: 'button', class: 'db-chip', role: 'radio', 'aria-checked': String(pen.brush === k), onclick: () => { pen.brush = k; renderDrawbar(); },
    }, n))),
    deps.h('div', { class: 'db-row' }, colors.map((c) => deps.h('button', {
      type: 'button', class: `db-color ${pen.color === c ? 'is-on' : ''}`, style: `background:${c}`, 'aria-label': c, title: c, onclick: () => { pen.color = c; renderDrawbar(); },
    })), deps.h('input', { type: 'color', value: pen.color, 'aria-label': 'لون ثاني', oninput: (e) => { pen.color = e.target.value; } })),
    deps.h('label', { class: 'db-row db-width' }, deps.h('span', {}, 'السماكة'),
      deps.h('input', { type: 'range', min: 4, max: 48, step: 1, value: pen.width, oninput: (e) => { pen.width = +e.target.value; } })),
    deps.h('div', { class: 'db-row' },
      deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: undo }, 'امسح آخر خط'),
      deps.h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: () => setPen(false) }, 'خلصت')),
    deps.h('p', { class: 'muted small' }, 'ارسم بالماوس أو بإصبعك على التصميم. كل خط بيصير عنصر بتقدر تحرّكه أو تحذفه بعدين.'),
  );
}

function select(i, toDesign = true) {
  state.sel = i;
  drawSelection(); syncToolbar(); renderProps(); renderLayers();
  if (i >= 0 && toDesign && state.pane !== 'design') setPane('design');
}

/* =================== design pane =================== */
let uid = 0;
function colorField(label, value, onChange) {
  const id = `cf-${++uid}`;
  const input = deps.h('input', { type: 'color', id, value: /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#ffffff', oninput: (e) => onChange(e.target.value) });
  const sw = BRAND_COLORS.map((c) => deps.h('button', { type: 'button', class: 'swatch', style: `background:${c}`, title: c, 'aria-label': c, onclick: () => { input.value = c; onChange(c); } }));
  return deps.h('div', { class: 'field' }, deps.h('label', { for: id }, label), deps.h('div', { class: 'color-row' }, input, deps.h('div', { class: 'swatches' }, sw)));
}
function selectField(label, value, options, onChange) {
  const id = `sf-${++uid}`;
  const sel = deps.h('select', { id, onchange: (e) => onChange(e.target.value) }, options.map(([v, t]) => deps.h('option', { value: v }, t)));
  sel.value = value ?? options[0][0];
  return deps.h('div', { class: 'field' }, deps.h('label', { for: id }, label), sel);
}
function numberField(label, value, onChange, step = 1) {
  const id = `nf-${++uid}`;
  return deps.h('div', { class: 'field' }, deps.h('label', { for: id }, label),
    deps.h('input', { type: 'number', id, step, value: value ?? '', dir: 'ltr', oninput: (e) => onChange(e.target.value === '' ? '' : +e.target.value) }));
}
function boolField(label, value, onChange) {
  return deps.h('label', { class: 'studio-chk' }, deps.h('input', { type: 'checkbox', checked: !!value, onchange: (e) => onChange(e.target.checked) }), deps.h('span', {}, label));
}

function propControl(e, [key, kind, label, options]) {
  const set = (v) => { checkpoint(); e[key] = v; renderStage(); persist(); if (['text', 'art', 'icon', 'title', 'kind'].includes(key)) renderLayers(); };
  switch (kind) {
    case 'select': {
      if (e.type === 'sticker' && key === 'kind') {
        // a new kind starts from its own example texts
        return selectField(label, e.kind, options, (v) => { checkpoint(true); e.kind = v; e.text = STICKERS[v].text; e.sub = STICKERS[v].sub || ''; renderStage(); persist(); renderLayers(); renderProps(); });
      }
      return selectField(label, e[key] ?? options[0][0], options, set);
    }
    case 'line': {
      const id = `pl-${++uid}`;
      return deps.h('div', { class: 'field span-2' }, deps.h('label', { for: id }, label),
        deps.h('input', { id, type: 'text', value: e[key] ?? '', dir: 'auto', oninput: (ev) => set(ev.target.value) }));
    }
    case 'textarea': {
      const id = `pt-${++uid}`;
      return deps.h('div', { class: 'field span-2' }, deps.h('label', { for: id }, label),
        deps.h('textarea', { id, rows: 2, value: e[key] ?? '', dir: e.font === 'en' ? 'ltr' : 'auto', oninput: (ev) => set(ev.target.value) }));
    }
    case 'number':
      if (key === 'rotate') {
        return deps.h('div', { class: 'field rot-field' }, deps.h('span', { class: 'field-label' }, label),
          deps.h('div', { class: 'rot-row' }, deps.h('span', { class: 'rot-val', dir: 'ltr' }, `${Math.round(e.rotate || 0)}°`),
            deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', disabled: !e.rotate, onclick: () => { checkpoint(true); e.rotate = 0; renderStage(); persist(); renderProps(); } }, 'صفّر')),
          deps.h('small', { class: 'muted' }, 'دوّره من المقبض الدائري فوق العنصر (Shift = كل 15°)'));
      }
      return numberField(label, e[key], set);
    case 'decimal': return numberField(label, e[key], set, 0.05);
    case 'color': return colorField(label, e[key], set);
    case 'weight': return selectField(label, String(e[key] ?? 800), [['400', 'عادي'], ['600', 'متوسط'], ['700', 'عريض'], ['800', 'عريض جداً']], (v) => set(+v));
    case 'align': return selectField(label, e[key], [['right', 'يمين'], ['middle', 'وسط'], ['left', 'شمال']], set);
    case 'font': return selectField(label, e[key] || 'ar', [['ar', 'عربي (Cairo)'], ['en', 'إنجليزي (Montserrat)']], set);
    case 'art': return selectField(label, e[key], Object.entries(ART).map(([k, v]) => [k, v.name]), set);
    case 'icon': return selectField(label, e[key], Object.entries(LINE_ICONS).map(([k, v]) => [k, v.name]), set);
    case 'fade': return selectField(label, e[key] || 'none', [['none', 'بدون'], ['top', 'من فوق'], ['bottom', 'من تحت'], ['right', 'من اليمين'], ['left', 'من الشمال']], set);
    case 'mosaic': return selectField(label, Object.values(MOSAICS).includes(e[key]) ? e[key] : MOSAICS.corner,
      [[MOSAICS.corner, 'زاوية'], [MOSAICS.stairs, 'درج'], [MOSAICS.scatter, 'متفرّق'], [MOSAICS.thick, 'كثيف'], [MOSAICS.line, 'خط']], set);
    case 'bool': return boolField(label, e[key] !== false, set);
    case 'range': {
      const id = `rg-${++uid}`;
      const out = deps.h('span', { class: 'muted small' }, `${Math.round((e[key] ?? 1) * 100)}%`);
      return deps.h('div', { class: 'field' }, deps.h('label', { for: id }, label, ' ', out),
        deps.h('input', { type: 'range', id, min: 0.05, max: 1, step: 0.05, value: e[key] ?? 1, oninput: (ev) => { out.textContent = `${Math.round(ev.target.value * 100)}%`; set(+ev.target.value); } }));
    }
    case 'platforms': {
      const names = Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, p.name]));
      const cur = new Set(e[key] || []);
      return deps.h('fieldset', { class: 'field span-2' }, deps.h('legend', {}, label),
        deps.h('div', { class: 'studio-icons' }, SOCIAL_ICON_KEYS.map((k) => boolField(names[k] || k, cur.has(k), (on) => {
          if (on) cur.add(k); else cur.delete(k);
          set(SOCIAL_ICON_KEYS.filter((x) => cur.has(x)));
        }))));
    }
    case 'image': {
      const file = deps.h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true,
        onchange: async (ev) => { const f = ev.target.files[0]; if (!f) return; try { set(await readPhoto(f)); } catch { deps.toast('ما قدرنا نقرأ الصورة', true); } ev.target.value = ''; } });
      return deps.h('div', { class: 'field span-2' }, deps.h('span', { class: 'field-label' }, label),
        deps.h('div', { class: 'studio-photo' }, file,
          deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => file.click() }, 'ارفع صورة'),
          libraryButton(set),
          PHOTOS.map(([src, name]) => deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => set(src) }, name))));
    }
    default: return null;
  }
}

function renderProps() {
  const box = $('el-props');
  const e = state.design.els[state.sel];
  if (!e) {
    box.replaceChildren(deps.h('p', { class: 'el-empty' }, 'اضغط على أي عنصر بالتصميم (أو من «الطبقات») عشان تعدّله.'));
    return;
  }
  const t = TYPES[e.type];
  const [a, b] = t.pos;
  const set = (k) => (v) => { checkpoint(); e[k] = v; renderStage(); persist(); };
  box.replaceChildren(
    deps.h('div', { class: 'el-head' }, deps.h('strong', {}, labelOf(e)),
      deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => select(-1, false) }, 'تم')),
    deps.h('div', { class: 'el-grid' },
      t.props.map((p) => propControl(e, p)),
      numberField('X (أفقي)', e[a], set(a)),
      numberField('Y (عمودي)', e[b], set(b))),
  );
}

function addElement(el) {
  checkpoint(true); state.design.els.push(el); state.sel = state.design.els.length - 1; refreshAll();
}
function renderAdd() {
  const btn = (label, onclick, cls = 'btn btn-ghost-dark btn-sm') => deps.h('button', { type: 'button', class: cls, onclick }, label);
  $('el-add').replaceChildren(
    libraryButton(src => addElement({ ...newElement('image', state.design), src })),
    ...Object.entries(TYPES).filter(([, t]) => !t.story && !t.noAdd).map(([k, t]) => btn(`+ ${t.name}`, () => addElement(newElement(k, state.design)))),
    deps.h('p', { class: 'el-add-title' }, 'ستوري (زي إنستغرام)'),
    ...Object.entries(STICKERS).map(([k, st]) => btn(`+ ${st.name}`, () => addElement({ ...newElement('sticker', state.design), kind: k, text: st.text, sub: st.sub || '' }), 'btn btn-ghost-dark btn-sm is-story')),
    btn('+ ملصق موسيقى', () => addMusicSticker(), 'btn btn-ghost-dark btn-sm is-story'),
    btn('✎ ارسم بالقلم', () => setPen(true), 'btn btn-ghost-dark btn-sm is-story'),
  );
}
function addMusicSticker() {
  const el = newElement('music', state.design);
  if (state.music) { const [title, artist] = songName(state.music.name); el.title = title; el.artist = artist; }
  el.cy = Math.round(state.design.h * 0.68);
  addElement(el);
}
// "Artist - Title.mp3" → ["Title", "Artist"]
function songName(file) {
  const base = String(file || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_]+/g, ' ').trim();
  const parts = base.split(/\s+[-–—]\s+/);
  return parts.length > 1 ? [parts.slice(1).join(' - ').slice(0, 60), parts[0].slice(0, 40)] : [base.slice(0, 60) || 'اسم الأغنية', ''];
}

function renderLayers() {
  const els = state.design.els;
  $('el-layers').replaceChildren(...els.map((e, i) => i).reverse().map((i) => {
    const e = els[i];
    return deps.h('li', { class: `layer ${i === state.sel ? 'is-sel' : ''} ${e.hidden ? 'is-hidden' : ''}` },
      deps.h('button', { type: 'button', class: 'layer-eye', title: e.hidden ? 'إظهار' : 'إخفاء', 'aria-label': e.hidden ? 'إظهار' : 'إخفاء',
        onclick: () => { checkpoint(true); e.hidden = !e.hidden; if (e.hidden && state.sel === i) state.sel = -1; refreshAll(); } }, e.hidden ? '◌' : '●'),
      deps.h('button', { type: 'button', class: 'layer-name', onclick: () => select(e.hidden ? -1 : i) }, labelOf(e)));
  }));
}

function renderBg() {
  const d = state.design;
  const sizeKey = Object.entries(SIZES).find(([, [w, h]]) => w === d.w && h === d.h)?.[0] || 'post';
  $('design-bg').replaceChildren(
    colorField('لون الخلفية', d.bg?.color, (v) => { checkpoint(); d.bg = { ...(d.bg || {}), color: v }; renderStage(); persist(); }),
    boolField('شبكة البكسل الخفيفة', d.bg?.grid !== false, (v) => { checkpoint(true); d.bg = { ...(d.bg || {}), grid: v }; renderStage(); persist(); }),
    selectField('تدرّج الخلفية', d.bg?.gradient || 'none', Object.entries(GRADIENTS).map(([k, g]) => [k, g.name]), (v) => {
      checkpoint(true); d.bg = { ...(d.bg || {}), gradient: v === 'none' ? undefined : v }; renderStage(); persist();
    }),
    selectField('المقاس', sizeKey, Object.entries(SIZES).map(([k, [w, h, n]]) => [k, `${n} (${w}×${h})`]), (k) => {
      checkpoint(true); const [w, h] = SIZES[k]; pages().forEach((pg) => { pg.w = w; pg.h = h; }); renderStage(); renderPages(); persist(); autoFormats();
    }),
  );
}

function setPane(p) {
  state.pane = p;
  $('st-tab-content').setAttribute('aria-selected', String(p === 'content'));
  $('st-tab-design').setAttribute('aria-selected', String(p === 'design'));
  $('st-pane-content').hidden = p !== 'content';
  $('st-pane-design').hidden = p !== 'design';
  if (p === 'content') renderContent(); else { renderProps(); renderLayers(); renderBg(); }
}

/* =================== toolbar actions =================== */
function syncToolbar() {
  const has = state.sel >= 0 && !!state.design.els[state.sel];
  ['tb-dup', 'tb-up', 'tb-down', 'tb-center', 'tb-del'].forEach((id) => { $(id).disabled = !has; });
  $('tb-undo').disabled = !state.undo.length;
  $('tb-redo').disabled = !state.redo.length;
}
function act(kind) {
  const els = state.design.els; const i = state.sel; const e = els[i];
  if (!e) return;
  checkpoint(true);
  if (kind === 'del') { els.splice(i, 1); state.sel = -1; }
  if (kind === 'dup') { const c = clone(e); moveElement(c, 30, 30); els.splice(i + 1, 0, c); state.sel = i + 1; }
  if (kind === 'up' && i < els.length - 1) { [els[i], els[i + 1]] = [els[i + 1], els[i]]; state.sel = i + 1; }
  if (kind === 'down' && i > 0) { [els[i], els[i - 1]] = [els[i - 1], els[i]]; state.sel = i - 1; }
  if (kind === 'center') { const b = bboxOf(i); if (b) moveElement(e, state.design.w / 2 - (b.x + b.width / 2), 0); }
  refreshAll();
}
function nudge(dx, dy) {
  const e = state.design.els[state.sel];
  if (!e) return;
  checkpoint(); moveElement(e, dx, dy); renderStage(); persist(); renderProps();
}

function refreshAll() {
  renderStage();
  if (state.pane === 'content') renderContent(); else { renderProps(); renderLayers(); renderBg(); }
  persist();
}

/* =================== images =================== */
function libraryButton(use) {
  const h = deps.h;
  return h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: async () => {
    const list = h('select', { 'aria-label': 'صور المكتبة', size: 6 });
    const preview = h('img', { hidden: true, alt: 'معاينة الصورة' });
    const status = h('p', { role: 'status' });
    const apply = h('button', { type: 'button', class: 'btn btn-primary', disabled: true, onclick: () => {
      use(preview.src); dialog.close();
    } }, 'استخدم الصورة');
    const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
    const dialog = h('dialog', { class: 'studio-library', 'aria-label': 'مكتبة الصور المشتركة' },
      h('h2', {}, 'مكتبة الصور المشتركة'), list, preview, status, file,
      h('div', { class: 'acc-actions' }, apply,
        h('button', { type: 'button', class: 'btn btn-ghost-dark', onclick: () => file.click() }, 'ارفع للمكتبة'),
        h('button', { type: 'button', class: 'btn btn-ghost-dark', onclick: () => dialog.close() }, 'سكّر')));
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
    list.onchange = async () => {
      const id = list.value;
      preview.hidden = true; apply.disabled = true; status.textContent = 'عم نحمّل الصورة…';
      try {
        const { image } = await api('/library/' + id);
        if (list.value !== id) return;
        preview.src = image; preview.hidden = false; apply.disabled = false; status.textContent = '';
      } catch (e) { if (list.value === id) status.textContent = e.message; }
    };
    const option = p => new Option(p.name, p.id);
    file.onchange = async () => {
      const photo = file.files[0]; if (!photo) return;
      try {
        const image = await readPhoto(photo);
        const saved = await api('/library', { method: 'POST', body: JSON.stringify({ name: photo.name, image }) });
        if (![...list.options].some(o => o.value === saved.id)) list.add(option(saved));
        list.value = saved.id; preview.src = image; preview.hidden = false; apply.disabled = false;
        status.textContent = 'انحفظت بالمكتبة';
      } catch (e) { status.textContent = e.message; }
      file.value = '';
    };
    try {
      let cursor;
      do {
        const page = await api('/library' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''));
        if (!dialog.open) return;
        for (const photo of page.photos) list.add(option(photo));
        cursor = page.cursor;
      } while (cursor);
      if (list.length) { list.selectedIndex = 0; await list.onchange(); }
      else status.textContent = 'المكتبة فاضية. ارفع أول صورة.';
    } catch (e) { status.textContent = e.message; }
  } }, 'مكتبة الصور');
}

// uploads: shrink to ≤ 1400px and keep as a JPEG data URL (fits in a saved template)
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.84));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* =================== a ready-made image, published as it is =================== */
// Instagram feed takes 4:5 … 1.91:1; a tall image near 9:16 becomes a story. Outside that, the image is
// cropped from the centre to the nearest allowed shape (preview shows exactly what goes out).
function shapeFor(w, h) {
  const r = w / h;
  if (r < 0.7) return [1080, 1920];          // story
  if (r < 0.8) return [1080, 1350];          // too tall for the feed → 4:5
  if (r > 1.91) return [1080, 565];          // too wide → 1.91:1
  return [1080, Math.round(1080 / r)];       // keep its own shape
}
function readFullImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 2160 / Math.max(img.width, img.height)); // keep it sharp (2×) but bounded
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve({ src: c.toDataURL('image/jpeg', 0.92), w: img.width, h: img.height });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
async function uploadReady(file) {
  if (!file) return;
  if (dirty() && !confirm('عندك تعديلات على القالب الحالي ما انحفظت. تفتح الصورة الجاهزة وتتركها؟')) return;
  let pic;
  try { pic = await readFullImage(file); } catch { deps.toast('ما قدرنا نقرأ الصورة', true); return; }
  const [w, h] = shapeFor(pic.w, pic.h);
  const d = {
    v: 1, id: 'upload', name: (file.name || 'تصميم جاهز').replace(/\.[a-z0-9]+$/i, '').slice(0, 60), w, h,
    bg: { color: '#0B1020', grid: false },
    els: [{ type: 'image', src: pic.src, x: 0, y: 0, w, h, gray: false, fade: 'none', opacity: 1, rx: 0 }],
  };
  stopEditing();
  state.src = { kind: 'upload', id: 'upload' }; setDeck(d); state.base = JSON.stringify(d);
  state.sel = -1; state.undo = []; state.redo = [];
  setPane('content'); refreshAll(); renderPickers(); renderPages(); autoFormats();
  const cropped = Math.abs(pic.w / pic.h - w / h) > 0.01;
  deps.toast(cropped ? `الصورة انقصّت من النص لمقاس ${w}×${h} عشان تناسب إنستغرام` : `جاهزة للنشر (${w}×${h})`);
}

/* =================== export: SVG → canvas, fonts + images embedded =================== */
let fontCssP;
export function fontCss() { // the brand fonts as CSS with the font files inlined (an SVG drawn as an image can't fetch)
  fontCssP = fontCssP || (async () => {
    let css = await (await fetch(FONT_URL)).text();
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    const data = await Promise.all(urls.map(async (u) => [u, await toDataUrl(u)]));
    data.forEach(([u, d]) => { css = css.split(u).join(d); });
    return css;
  })().catch((e) => { fontCssP = null; throw e; });
  return fontCssP;
}
export async function toDataUrl(src) {
  if (!src || src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}
async function rasterize(type = 'image/png', quality) {
  return toBlob(await rasterCanvas(), type, quality);
}
const toBlob = (c, type, quality) => new Promise((resolve) => c.toBlob(resolve, type, quality));
async function rasterCanvas(d = state.design) {
  const srcs = [...new Set(d.els.filter((e) => e.type === 'image' && e.src && !e.hidden).map((e) => e.src))];
  const [css, pairs] = await Promise.all([fontCss(), Promise.all(srcs.map(async (s) => [s, await toDataUrl(s)]))]);
  await fontsReady;
  const svg = renderDesign(d, { measure, fontCss: css, images: Object.fromEntries(pairs) });
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    await new Promise((r) => setTimeout(r, 120)); // let the embedded fonts settle inside the SVG image
    const c = document.createElement('canvas'); c.width = d.w; c.height = d.h;
    c.getContext('2d').drawImage(img, 0, 0, d.w, d.h);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/* =================== frames: what each format gets =================== */
const isTall = (d) => d.h / d.w > 1.6;
// the design centred on a blurred, darker copy of itself (like sharing a post to a story)
function framed(src, W, H) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const cover = Math.max(W / src.width, H / src.height);
  g.fillStyle = '#0B1020'; g.fillRect(0, 0, W, H);
  g.filter = 'blur(46px) brightness(.55) saturate(1.2)';
  g.drawImage(src, (W - src.width * cover) / 2, (H - src.height * cover) / 2, src.width * cover, src.height * cover);
  g.filter = 'none';
  const fit = Math.min((W * 0.86) / src.width, (H * 0.8) / src.height);
  const w = src.width * fit; const h = src.height * fit; const x = (W - w) / 2; const y = (H - h) / 2; const r = Math.round(W / 36);
  g.save(); g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 60; g.shadowOffsetY = 24;
  g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = '#0B1020'; g.fill(); g.restore();
  g.save(); g.beginPath(); g.roundRect(x, y, w, h, r); g.clip(); g.drawImage(src, x, y, w, h); g.restore();
  return c;
}
// H.264 needs even sizes
function even(c) {
  if (c.width % 2 === 0 && c.height % 2 === 0) return c;
  const e = document.createElement('canvas'); e.width = c.width - (c.width % 2); e.height = c.height - (c.height % 2);
  e.getContext('2d').drawImage(c, 0, 0, e.width, e.height);
  return e;
}
const storyFrame = (c) => (Math.abs(c.width / c.height - 9 / 16) < 0.02 ? c : framed(c, 1080, 1920));
function postFrame(c, video) {
  const r = c.width / c.height;
  if (video && r < 0.6) return c;            // a tall design with music = a reel, 9:16 is right for it
  if (r >= 0.8 && r <= 1.91) return c;        // the shapes the Instagram feed takes
  return framed(c, 1080, 1350);               // too tall/wide for the feed → inside a 4:5 frame
}
const frameFor = (fmt, base, video) => even(fmt === 'story' ? storyFrame(base) : postFrame(base, video));

/* =================== music (memory only) and the video preview =================== */
let player = null; // { ctx, src } while the clip plays
let preview = null; // { url, fmt }
const musicLabel = (m) => songName(m.name).filter(Boolean).join(' · ');
function setMusicBusy(text) {
  const p = $('music-status');
  if (p) { p.hidden = !text; p.textContent = text || ''; }
}
async function loadMusic(file) {
  stopPlay();
  setMusicBusy('عم نقرأ الملف…');
  try {
    const audio = await decodeAudio(file);
    if (audio.duration < 1) throw new Error('short');
    state.music = { file, name: file.name, audio, start: 0, dur: Math.min(15, Math.floor(audio.duration)), vol: 1, fade: true, motion: 'zoom-in' };
    // a music sticker that still says «اسم الأغنية» takes the song's name
    const [title, artist] = songName(file.name);
    state.design.els.filter((e) => e.type === 'music' && (!e.title || e.title === 'اسم الأغنية')).forEach((e) => { e.title = title; if (!e.artist || e.artist === 'الفنان') e.artist = artist; });
    clearPreview(); renderStage(); renderMusic(); syncPublishUi(); if (state.editing) renderEditing();
    deps.toast('انضافت الموسيقى ✓');
  } catch {
    setMusicBusy('');
    deps.toast('ما قدرنا نقرأ الملف. جرّب mp3 أو m4a أو wav.', true);
  }
}
function removeMusic() { stopPlay(); state.music = null; clearPreview(); renderMusic(); syncPublishUi(); if (state.editing) renderEditing(); }
function clearPreview() { if (preview) URL.revokeObjectURL(preview.url); preview = null; }
async function togglePlay() {
  if (player) { stopPlay(); return; }
  const m = state.music; if (!m) return;
  const clip = await renderClip(m.audio, { start: m.start, dur: m.dur, volume: m.vol, fade: m.fade });
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const src = ctx.createBufferSource(); src.buffer = clip; src.connect(ctx.destination);
  src.onended = () => { if (player?.src === src) stopPlay(); };
  src.start();
  player = { ctx, src };
  renderMusic();
}
function stopPlay() {
  if (!player) return;
  const p = player; player = null;
  try { p.src.stop(); } catch { /* already stopped */ }
  p.ctx.close().catch(() => {});
  renderMusic();
}
const primaryFormat = () => ($('pub-story').checked || (!$('pub-post').checked && isTall(state.design)) ? 'story' : 'post');
async function buildPreview(btn) {
  const m = state.music; if (!m) return;
  stopPlay();
  deps.setBusy(btn, true);
  try {
    const fmt = primaryFormat();
    const frame = frameFor(fmt, await rasterCanvas(), true);
    const clip = await renderClip(m.audio, { start: m.start, dur: m.dur, volume: m.vol, fade: m.fade });
    const blob = await makeVideo({ image: frame, w: frame.width, h: frame.height, clip, motion: m.motion, onProgress: (k) => setMusicBusy(`عم نعمل الفيديو… ${Math.round(k * 100)}%`) });
    clearPreview();
    preview = { url: URL.createObjectURL(blob), fmt, size: blob.size };
    renderMusic();
  } catch (e) {
    console.error(e); deps.toast(e.message || 'ما زبط الفيديو', true);
  } finally { setMusicBusy(''); deps.setBusy(btn, false); }
}

function renderMusic() {
  const box = $('music-box'); const m = state.music; const h = deps.h;
  if (!videoSupported()) {
    box.replaceChildren(h('p', { class: 'muted small' }, 'الموسيقى بتحتاج Chrome أو Edge على الكمبيوتر (هو اللي بيعمل الفيديو). الستوري بدون موسيقى شغّال من أي متصفح.'));
    return;
  }
  const file = h('input', { type: 'file', accept: 'audio/*,.mp3,.m4a,.aac,.wav,.ogg', hidden: true,
    onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) loadMusic(f); } });
  const status = h('p', { class: 'muted small music-status', id: 'music-status', hidden: true });
  if (!m) {
    box.replaceChildren(file,
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => file.click() }, '♪ اختار ملف موسيقى'),
      status,
      h('p', { class: 'muted small' }, 'mp3 أو m4a أو wav. مع الموسيقى الستوري بينزل فيديو، والمنشور بينزل ريل على إنستغرام وفيديو على فيسبوك، والتصميم بيتحرّك زوم خفيف. استعمل موسيقى إلك حق تنشرها: الأغاني المحمية ممكن ميتا تكتم صوتها أو تشيلها.'));
    return;
  }
  const total = m.audio.duration;
  const maxStart = Math.max(0, total - 1);
  const durations = [5, 10, 15, 20, 30, 45, 60].filter((x) => x <= MAX_SECONDS && x <= total);
  if (!durations.length) durations.push(Math.floor(total));
  const fit = () => { m.dur = Math.min(m.dur, Math.floor(total - m.start)) || 1; };
  const startOut = h('span', { class: 'muted small' }, `${fmtTime(m.start)} → ${fmtTime(m.start + m.dur)}`);
  const changed = () => { stopPlay(); clearPreview(); renderMusic(); };
  box.replaceChildren(file,
    h('div', { class: 'music-head' },
      h('span', { class: 'music-note', 'aria-hidden': 'true' }, '♪'),
      h('div', {}, h('strong', {}, musicLabel(m)), h('span', { class: 'muted small' }, ` · ${fmtTime(total)}`)),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => file.click() }, 'غيّر'),
      h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: removeMusic }, 'شيل')),
    h('div', { class: 'music-grid' },
      h('div', { class: 'field span-2' }, h('label', { for: 'mu-start' }, 'من وين تبلّش؟ ', startOut),
        h('input', { type: 'range', id: 'mu-start', min: 0, max: maxStart, step: 0.5, value: m.start,
          oninput: (e) => { m.start = +e.target.value; fit(); startOut.textContent = `${fmtTime(m.start)} → ${fmtTime(m.start + m.dur)}`; },
          onchange: changed })),
      selectField('المدة', String(durations.includes(m.dur) ? m.dur : durations[durations.length - 1]), durations.map((x) => [String(x), `${x} ثانية`]), (v) => { m.dur = +v; fit(); changed(); }),
      selectField('حركة التصميم', m.motion, [['zoom-in', 'زوم لجوّا'], ['zoom-out', 'زوم لبرّا'], ['none', 'ثابت']], (v) => { m.motion = v; clearPreview(); renderMusic(); }),
      h('div', { class: 'field' }, h('label', { for: 'mu-vol' }, 'علو الصوت'),
        h('input', { type: 'range', id: 'mu-vol', min: 0.1, max: 1.5, step: 0.05, value: m.vol, oninput: (e) => { m.vol = +e.target.value; }, onchange: changed })),
      boolField('تلاشي بالأول والآخر', m.fade, (v) => { m.fade = v; changed(); })),
    h('div', { class: 'music-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: togglePlay }, player ? '■ وقّف' : '▶ اسمع المقطع'),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: addMusicSticker }, '+ ملصق الموسيقى'),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: (e) => buildPreview(e.currentTarget) },
        h('span', { class: 'btn-label' }, preview ? 'اعمل المعاينة من جديد' : 'شوف الفيديو'), h('span', { class: 'spinner', 'aria-hidden': 'true' }))),
    status,
    preview ? h('div', { class: `music-preview ${preview.fmt === 'story' ? 'is-story' : ''}` },
      h('video', { src: preview.url, controls: true, playsinline: true, preload: 'metadata' }),
      h('a', { class: 'btn btn-ghost-dark btn-sm', href: preview.url, download: `beitlahia-${preview.fmt}-${new Date().toISOString().slice(0, 10)}.mp4` }, `نزّل MP4 (${(preview.size / 1048576).toFixed(1)} MB)`)) : '');
}
const blobToBase64 = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
const slug = () => (state.src.kind === 'builtin' ? state.src.id : state.src.kind === 'upload' ? 'upload' : slugOf(state.deck));
const slugOf = (d) => (BUILTIN.some((b) => b.id === d.id) ? d.id : d.id === 'upload' ? 'upload' : 'custom');
const titleOf = (d) => d.els.filter((e) => (e.type === 'text' || e.type === 'button') && !e.hidden && String(e.text || '').trim())
  .map((e) => String(e.text).replace(/\n/g, ' ')).slice(0, 2).join(' · ') || d.name;

async function download() {
  const btn = $('studio-download');
  deps.setBusy(btn, true);
  try {
    const day = new Date().toISOString().slice(0, 10); const all = pages();
    for (let k = 0; k < all.length; k++) {
      const blob = await toBlob(await rasterCanvas(all[k]), 'image/png');
      const a = deps.h('a', { href: URL.createObjectURL(blob), download: `beitlahia-${slug()}-${day}${all.length > 1 ? `-${k + 1}` : ''}.png` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      if (all.length > 1) await new Promise((r) => setTimeout(r, 350)); // browsers drop downloads fired all at once
    }
  } catch (e) {
    console.error(e); deps.toast('ما زبط التنزيل. تأكد من الإنترنت وجرّب كمان مرة.', true);
  } finally { deps.setBusy(btn, false); }
}

/* =================== saved templates (Firestore › socialTemplates) =================== */
async function loadMine() {
  if (!deps.db) return;
  try {
    const snap = await deps.fs.getDocs(deps.fs.collection(deps.db, 'socialTemplates'));
    state.mine = snap.docs.map((doc) => {
      const v = doc.data();
      try { const design = JSON.parse(v.design); design.name = v.name; return { id: doc.id, name: v.name, design, at: v.updatedAt?.toMillis?.() || 0 }; } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.at - a.at);
    renderPickers();
  } catch (e) { console.warn('[studio] templates', e); }
}
function payload(name) {
  const json = JSON.stringify({ ...state.deck, name });
  if (json.length > 900000) throw new Error('القالب كبير كتير (غالباً صورة مرفوعة). صغّر الصورة أو استخدم صور بيت لاهيا الجاهزة.');
  return { name, design: json, updatedAt: deps.fs.serverTimestamp(), updatedBy: deps.user()?.email || '' };
}
async function saveNew() {
  if (!deps.db) { deps.toast('الحفظ بيحتاج تسجيل دخول', true); return; }
  const name = (prompt('اسم القالب الجديد؟', `${state.deck.name} (نسخة)`) || '').trim().slice(0, 60);
  if (!name) return;
  const btn = $('tpl-save-new'); deps.setBusy(btn, true);
  try {
    const ref = await deps.fs.addDoc(deps.fs.collection(deps.db, 'socialTemplates'), payload(name));
    state.deck.name = name;
    state.mine.unshift({ id: ref.id, name, design: clone(state.deck), at: Date.now() });
    state.src = { kind: 'mine', id: ref.id }; state.base = JSON.stringify(state.deck);
    renderPickers(); persist(); deps.toast('انحفظ القالب ✓');
  } catch (e) { deps.toast(e.message?.startsWith('القالب') ? e.message : 'ما زبط الحفظ', true); } finally { deps.setBusy(btn, false); }
}
async function saveChanges() {
  if (state.src.kind !== 'mine') return;
  const m = state.mine.find((x) => x.id === state.src.id);
  if (!m) return;
  const btn = $('tpl-save'); deps.setBusy(btn, true);
  try {
    await deps.fs.updateDoc(deps.fs.doc(deps.db, 'socialTemplates', m.id), payload(m.name));
    m.design = clone(state.deck); m.design.name = m.name;
    state.base = JSON.stringify(state.deck);
    renderPickers(); persist(); deps.toast('انحفظت التعديلات ✓');
  } catch (e) { deps.toast(e.message?.startsWith('القالب') ? e.message : 'ما زبط الحفظ', true); } finally { deps.setBusy(btn, false); }
}
async function deleteMine() {
  const m = state.mine.find((x) => x.id === state.src.id);
  if (!m || !confirm(`نحذف القالب «${m.name}»؟ ما بيرجع.`)) return;
  try {
    await deps.fs.deleteDoc(deps.fs.doc(deps.db, 'socialTemplates', m.id));
    state.mine = state.mine.filter((x) => x.id !== m.id);
    setDeck(clone(BUILTIN[0])); state.base = JSON.stringify(state.deck); state.src = { kind: 'builtin', id: BUILTIN[0].id };
    state.sel = -1; state.undo = []; state.redo = [];
    refreshAll(); renderPickers(); renderPages(); deps.toast('انحذف');
  } catch { deps.toast('ما زبط الحذف', true); }
}
function resetToSource() {
  const d = sourceDesign(state.src.kind, state.src.id);
  if (!d || !dirty()) return;
  if (!confirm('نرجّع القالب زي ما كان ونلغي التعديلات؟')) return;
  checkpoint(true); setDeck(d); state.sel = -1; refreshAll(); renderPages(); syncPublishUi();
}

/* =================== the publishing service =================== */
async function api(path, opts = {}) {
  const token = await deps.getToken();
  const { raw, ...rest } = opts; // raw: a Blob sent as it is (the MP4)
  const res = await fetch(WORKER + path, {
    ...rest,
    body: raw || rest.body,
    headers: { Authorization: `Bearer ${token}`, ...(raw ? { 'Content-Type': raw.type || 'application/octet-stream' } : rest.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خدمة النشر ما ردّت صح');
  const method = (rest.method || 'GET').toUpperCase();
  if (method !== 'GET') { const text = activityText(method, path, data); if (text) deps.log?.(text); }
  return data;
}
// the activity log (owner › «المشرفين»): one plain line per thing done in the studio
const awaitingVideo = new Set(); // posts created with { video: true }: they really go out with PUT …/video
function activityText(method, path, data) {
  const post = data?.post;
  const title = post ? `: ${post.title || 'منشور بدون عنوان'}` : '';
  const st = post?.status;
  const done = st === 'scheduled' ? 'جدول منشور' : st === 'pending' ? 'حضّر منشور للموافقة' : st === 'approved' ? 'وافق على منشور'
    : st === 'failed' ? 'حاول ينشر منشور وفشل' : ['published', 'partial', 'publishing'].includes(st) ? 'نشر منشور' : '';
  if (method === 'POST' && path === '/posts') {
    if (st === 'uploading') { awaitingVideo.add(post.id); return ''; }
    return done + title;
  }
  const pg = /^\/posts\/([^/?]+)\/page\/\d+$/.exec(path);
  if (pg) return st !== 'uploading' && awaitingVideo.delete(pg[1]) && done ? done + title : '';
  let m = /^\/posts\/([^/?]+)\/video$/.exec(path);
  if (m) return awaitingVideo.delete(m[1]) && done ? done + title : '';
  if (/^\/posts\/[^/?]+\/design$/.test(path)) return '';
  if (method === 'PUT' && /^\/posts\/[^/?]+$/.test(path)) return 'عدّل منشور مجدول' + title;
  if (method === 'PATCH' && path.startsWith('/posts/')) return 'غيّر موعد منشور' + title;
  if (/^\/posts\/[^/?]+\/approve$/.test(path)) return 'وافق على منشور' + title;
  if (/^\/posts\/[^/?]+\/publish$/.test(path)) return (done || 'نشر منشور') + title;
  if (method === 'DELETE' && path.startsWith('/posts/')) return 'حذف أو ألغى منشور';
  if (method === 'POST' && path === '/library') return 'أضاف صورة لمكتبة الصور';
  if (path === '/connect/select') return 'ربط صفحة فيسبوك وإنستغرام';
  if (method === 'DELETE' && path === '/connect') return 'فصل حسابات السوشيال';
  if (method === 'POST' && path === '/notify') return 'عدّل إعدادات تنبيهات الإيميل';
  return '';
}
async function checkConnection() {
  try {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(`${WORKER}/health`, { signal: ctl.signal });
    clearTimeout(tm);
    const d = await r.json();
    state.conn = { up: !!d.ok, facebook: !!d.facebook, instagram: !!d.instagram, page: d.page || "", instagramUser: d.instagramUser || "" };
  } catch { state.conn = { up: false, facebook: false, instagram: false }; }
  renderConn(); syncPublishUi();
  if (state.conn.up) loadPosts();
}
function renderConn() {
  const c = state.conn; const box = $('studio-conn');
  if (!c) { box.replaceChildren(); return; }
  const chip = (k) => deps.h('span', { class: `conn-chip ${c[k] ? 'is-on' : ''}` }, `${PLATFORM_NAME[k]} ${c[k] ? '✓ مربوط' : '— مش مربوط'}`);
  let msg;
  if (!c.up) msg = deps.owner ? 'خدمة النشر مش مركّبة لسا. التصميم والحفظ والتنزيل شغّالين؛ لتشغيل النشر شوف بطاقة «ربط فيسبوك وإنستغرام» تحت.'
    : 'خدمة النشر مش شغّالة لسا. التصميم والحفظ والتنزيل شغّالين، والنشر بيشتغل لما صاحب المنصة يركّبها ويربط الحسابات.';
  else if (!c.facebook && !c.instagram) msg = deps.owner ? 'خدمة النشر شغّالة. ضايل تربط صفحة الفيسبوك وحساب الإنستغرام من البطاقة تحت.' : 'خدمة النشر شغّالة، بس لسا ما انربطت صفحة الفيسبوك وحساب الإنستغرام (صاحب المنصة بيربطهم).';
  else msg = `خدمة النشر شغّالة${c.page ? ` · الصفحة: ${c.page}` : ''}${c.instagramUser ? ` · إنستغرام: @${c.instagramUser}` : ''}`;
  box.className = `studio-conn ${c.up ? (c.facebook || c.instagram ? 'is-ok' : 'is-warn') : 'is-off'}`;
  box.replaceChildren(deps.h('p', {}, msg), c.up ? deps.h('div', { class: 'conn-chips' }, chip('facebook'), chip('instagram')) : '');
  if (state.campaign) renderCampaign();
  if (deps.owner) { renderConnect(); if (c.up && !state.notify) loadNotify(); else renderNotify(); }
}

/* =================== connecting Facebook / Instagram (owner only) =================== */

const cn = { status: null, pages: null, form: false, loading: false };
const dayFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });

async function loadConnect() {
  try { cn.status = await api('/connect'); } catch (e) { cn.status = { error: e.message }; }
  renderConnect();
}
function copyBtn(text, label = 'نسخ') {
  return deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(text); deps.toast('انسخ ✓'); } catch { deps.toast('انسخه يدوي', true); } } }, label);
}
async function startFacebook(btn) {
  btn.disabled = true;
  try {
    const flow = await api('/connect/oauth-start', { method: 'POST' });
    sessionStorage.setItem('studio-facebook-state', flow.state);
    location.assign(flow.url);
  } catch (e) { deps.toast(e.message, true); btn.disabled = false; }
}
async function finishFacebook() {
  const result = sessionStorage.getItem('studio-facebook-result');
  if (!result) return;
  sessionStorage.removeItem('studio-facebook-result');
  try {
    const data = JSON.parse(result);
    if (data.error) throw new Error(data.error);
    cn.pages = (await api('/connect/oauth-finish', { method: 'POST', body: result })).pages;
    cn.form = true;
    renderConnect();
  } catch (e) { deps.toast(e.message, true); }
}

function renderConnect() {
  const box = $('studio-connect');
  box.hidden = false;
  const c = state.conn || {};
  const head = deps.h('div', { class: 'studio-head' }, deps.h('h2', {}, 'ربط فيسبوك وإنستغرام'), deps.h('span', { class: 'muted small' }, 'إلك إنت بس'));
  if (!c.up) {
    box.replaceChildren(head,
      deps.h('p', {}, 'أول خطوة (مرة وحدة): تركيب خدمة النشر على Cloudflare. افتح مجلد ', deps.h('code', {}, 'social-worker'), ' بالمشروع وشغّل:'),
      deps.h('div', { class: 'scope-row' }, deps.h('code', { dir: 'ltr' }, 'npm run setup'), copyBtn('npm run setup')),
      deps.h('p', { class: 'muted small' }, 'بيفتحلك المتصفح تسجّل دخول على Cloudflare، وهو بيعمل الباقي لحاله (التخزين، الرفع، والرابط social.beitlahia.tech). بعدها حدّث هالصفحة وكمّل الربط من هون.'),
      deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: checkConnection }, 'فحص من جديد'));
    return;
  }
  if (!cn.status && !cn.loading) { cn.loading = true; loadConnect().finally(() => { cn.loading = false; }); }
  const st = cn.status || {};
  const parts = [head];
  if (st.error) parts.push(deps.h('p', { class: 'conn-err' }, st.error));

  if (st.connected && !cn.form) {
    const row = (k, v) => deps.h('div', { class: 'cn-row' }, deps.h('span', { class: 'muted' }, k), deps.h('strong', {}, v));
    parts.push(deps.h('div', { class: 'cn-grid' },
      row('صفحة الفيسبوك', st.page ? st.page.name || st.page.id : '—'),
      row('إنستغرام', st.instagram ? `@${st.instagram.username || st.instagram.id}` : 'ما في حساب مربوط بالصفحة'),
      row('صلاحية الربط', st.expiresAt ? `بتنتهي ${dayFmt.format(new Date(st.expiresAt))}` : 'ما بتنتهي'),
      st.connectedAt ? row('انربط', `${dayFmt.format(new Date(st.connectedAt))}${st.connectedBy ? ` · ${st.connectedBy}` : ''}`) : '',
      st.source === 'env' ? row('المصدر', 'إعدادات الخدمة (يدوي)') : ''));
    if (!st.instagram) parts.push(deps.h('p', { class: 'conn-warn' }, 'الصفحة ما إلها حساب إنستغرام Business مربوط، فالنشر رح يكون على فيسبوك بس. اربط الإنستغرام بالصفحة وبعدين اضغط «ربط من جديد».'));
    if (st.missingInsightScopes?.length) parts.push(deps.h('p', { class: 'conn-warn' }, 'إحصائيات المنشورات (الوصول والإعجابات والتعليقات) بدها صلاحيات مش موجودة بالربط الحالي: ' + st.missingInsightScopes.join('، ') + '. اضغط «ربط من جديد» ثم «ربط بفيسبوك» ووافق على كل الصلاحيات.'));
    if (st.missingScopes?.length) parts.push(deps.h('p', { class: 'conn-warn' }, `ناقص صلاحيات: ${st.missingScopes.join('، ')}. راجع صلاحيات تطبيق ميتا واضغط «ربط من جديد».`));
    if (st.check) parts.push(deps.h('p', { class: st.check.ok ? 'conn-ok' : 'conn-err' }, st.check.ok ? `✓ الاتصال شغّال مع «${st.check.name}»` : `✗ ${st.check.error}`));
    parts.push(deps.h('div', { class: 'acc-actions' },
      deps.h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: (e) => connectAct(e.currentTarget, 'test') }, deps.h('span', { class: 'btn-label' }, 'اختبار الاتصال'), deps.h('span', { class: 'spinner', 'aria-hidden': 'true' })),
      deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => { cn.form = true; cn.pages = null; renderConnect(); } }, 'ربط من جديد / صفحة ثانية'),
      deps.h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: (e) => connectAct(e.currentTarget, 'disconnect') }, 'فصل الحسابات')));
    box.replaceChildren(...parts);
    return;
  }

  // the form: credentials → pages → choose one
  if (!cn.pages) {
    parts.push(deps.h('button', { type: 'button', class: 'btn btn-primary', onclick: e => startFacebook(e.currentTarget) }, 'ربط بفيسبوك'),
      deps.h('p', { class: 'muted small' }, 'بتفتح نافذة فيسبوك عشان توافق على الصلاحيات، وبعدها بتختار الصفحة من هون.'));
  } else {
    const list = deps.h('div', { class: 'cn-pages', role: 'radiogroup', 'aria-label': 'صفحات الفيسبوك' }, cn.pages.map((p, i) => deps.h('label', { class: 'cn-page' },
      deps.h('input', { type: 'radio', name: 'cn-page', value: p.id, checked: i === 0 }),
      deps.h('span', {}, deps.h('strong', {}, p.name), deps.h('span', { class: 'muted small' }, p.ig ? ` · إنستغرام @${p.ig.username || p.ig.id}` : ' · ما في إنستغرام مربوط')))));
    parts.push(deps.h('p', {}, 'اختار صفحة المجتمع:'), list,
      deps.h('div', { class: 'acc-actions' },
        deps.h('button', { type: 'button', class: 'btn btn-primary', onclick: (e) => selectPage(e.currentTarget, list) }, deps.h('span', { class: 'btn-label' }, 'اربط هالصفحة'), deps.h('span', { class: 'spinner', 'aria-hidden': 'true' })),
        deps.h('button', { type: 'button', class: 'btn btn-ghost-dark', onclick: () => { cn.pages = null; renderConnect(); } }, 'رجوع')));
  }
  box.replaceChildren(...parts);
}

async function selectPage(btn, list) {
  const pageId = list.querySelector('input:checked')?.value;
  if (!pageId) return;
  deps.setBusy(btn, true);
  try {
    cn.status = await api('/connect/select', { method: 'POST', body: JSON.stringify({ pageId }) });
    cn.pages = null; cn.form = false;
    deps.toast('انربطت ✓');
    await checkConnection();
  } catch (e) { deps.toast(e.message, true); deps.setBusy(btn, false); }
}
async function connectAct(btn, what) {
  if (what === 'disconnect' && !confirm('نفصل صفحة الفيسبوك والإنستغرام عن المنصة؟ المنشورات المجدولة ما رح تنتشر لحد ما تربط من جديد.')) return;
  deps.setBusy(btn, true);
  try {
    cn.status = what === 'test' ? await api('/connect/test', { method: 'POST' }) : await api('/connect', { method: 'DELETE' });
    if (what === 'disconnect') { deps.toast('انفصلت'); await checkConnection(); } else renderConnect();
  } catch (e) { deps.toast(e.message, true); } finally { deps.setBusy(btn, false); }
}
/* =================== e-mail alerts (owner only) =================== */
async function loadNotify() {
  try { state.notify = await api('/notify'); } catch (e) { state.notify = { error: e.message }; }
  renderNotify();
}
function renderNotify() {
  const box = $('studio-notify'); const n = state.notify; const h = deps.h;
  box.hidden = !deps.owner || !state.conn?.up;
  if (box.hidden || !n) return;
  const head = h('div', { class: 'studio-head' }, h('h2', {}, 'التنبيهات بالإيميل'), h('span', { class: 'muted small' }, 'إلك إنت بس'));
  if (n.error) { box.replaceChildren(head, h('p', { class: 'conn-err' }, n.error)); return; }
  const chk = (key, text, hint) => h('label', { class: 'studio-chk notify-opt' }, h('input', { type: 'checkbox', checked: n[key] !== false, 'data-notify': key }),
    h('span', {}, h('strong', {}, text), h('span', { class: 'muted small' }, ` · ${hint}`)));
  const to = h('input', { id: 'notify-to', type: 'email', dir: 'ltr', value: n.to || '', placeholder: 'name@gmail.com', autocomplete: 'email' });
  const read = () => ({ to: to.value.trim(), ...Object.fromEntries([...box.querySelectorAll('[data-notify]')].map((x) => [x.dataset.notify, x.checked])) });
  const last = n.last ? h('p', { class: `small ${n.last.ok ? 'conn-ok' : 'conn-err'}` },
    `آخر إيميل: ${whenFmt.format(new Date(n.last.at))} · «${n.last.subject}» ${n.last.ok ? '✓ انبعت' : `✗ ما انبعت (${n.last.error || ''})`}`) : '';
  box.replaceChildren(head,
    h('p', { class: 'muted small' }, `بتوصلك الإيميلات من ${n.from} لحالها، بدون ما تفتح اللوحة.`),
    chk('failed', 'منشور مجدول ما انتشر', 'أول ما يفشل، مع السبب'),
    chk('conn', 'مشكلة بربط فيسبوك وإنستغرام', 'فحص كل يوم الصبح'),
    chk('digest', 'ملخص التسجيلات اليومي', 'كل يوم الساعة 8 المسا، إذا في تسجيلات جديدة'),
    h('div', { class: 'field' }, h('label', { for: 'notify-to' }, 'الإيميل اللي بتوصله التنبيهات'), to,
      h('p', { class: 'muted small' }, 'لازم يكون متحقق منه بـ Cloudflare › Email Routing › Destination addresses (جيميل الإدارة اللي بيوصله info@ متحقق منه).')),
    n.mail ? '' : h('p', { class: 'conn-warn' }, 'إرسال الإيميل مش مفعّل بخدمة النشر لسا (send_email). بيتفعّل مع الرفع الجاي للخدمة.'),
    last,
    h('div', { class: 'acc-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: async (e) => {
        const b = e.currentTarget; deps.setBusy(b, true);
        try { state.notify = await api('/notify', { method: 'POST', body: JSON.stringify(read()) }); deps.toast('انحفظ ✓'); renderNotify(); } catch (err) { deps.toast(err.message, true); deps.setBusy(b, false); }
      } }, h('span', { class: 'btn-label' }, 'احفظ'), h('span', { class: 'spinner', 'aria-hidden': 'true' })),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: async (e) => {
        const b = e.currentTarget; deps.setBusy(b, true);
        try {
          await api('/notify', { method: 'POST', body: JSON.stringify(read()) });
          state.notify = await api('/notify/test', { method: 'POST' });
          deps.toast(`انبعت إيميل تجربة لـ ${state.notify.to} ✓`); renderNotify();
        } catch (err) { deps.toast(err.message, true); await loadNotify(); }
      } }, h('span', { class: 'btn-label' }, 'ابعت إيميل تجربة'), h('span', { class: 'spinner', 'aria-hidden': 'true' }))));
}

function syncPublishUi() {
  const later = document.querySelector('input[name="studio-when"]:checked')?.value === 'later';
  $('studio-at').hidden = !later;
  deps.setBusy($('studio-publish'), false, !deps.owner ? 'أرسل للموافقة' : later ? 'جدول المنشور' : 'انشر الآن');
  const c = state.conn || {};
  ['facebook', 'instagram'].forEach((k) => {
    const box = $(`pub-${k}`);
    box.disabled = !c[k];
    box.closest('label').title = c[k] ? '' : `${PLATFORM_NAME[k]} مش مربوط لسا`;
  });
  const post = $('pub-post').checked; const story = $('pub-story').checked; const n = pageCount(); const m = !!state.music && n === 1;
  $('studio-publish').disabled = !['facebook', 'instagram'].some((k) => c[k] && $(`pub-${k}`).checked) || (!post && !story);
  const tall = isTall(state.design);
  const hints = [];
  if (n > 1 && post) hints.push(`المنشور: كاروسيل من ${n} صور بنص واحد (سحب يمين وشمال).`);
  if (n > 1 && story) hints.push(`الستوري: ${n} ستوريات ورا بعض، بنفس الترتيب.`);
  if (n > 1 && state.music) hints.push('الموسيقى بتشتغل مع صفحة وحدة بس، فرح ينتشر بدونها.');
  if (story && n === 1) hints.push(m ? 'الستوري: فيديو بالموسيقى على فيسبوك وإنستغرام (بيضل 24 ساعة).' : 'الستوري: صورة على فيسبوك وإنستغرام (بتضل 24 ساعة).');
  if (story && !tall) hints.push('التصميم مش طولي، فبالستوري بيتحط بالنص على خلفية مغبّشة منه.');
  if (post && m) hints.push('المنشور مع الموسيقى: ريل على إنستغرام وفيديو على صفحة الفيسبوك.');
  if (post && !m && tall) hints.push('التصميم طولي، فبالمنشور بيتحط بإطار 4:5 (إنستغرام ما بيقبل صورة أطول بالفيد).');
  $('studio-format-hint').textContent = hints.join(' ');
  $('studio-format-hint').hidden = !hints.length;
  $('studio-caption-hint').textContent = post ? 'بيطلع تحت المنشور بفيسبوك وإنستغرام (الستوري ما إلها نص)' : 'الستوري ما إلها نص؛ هاد بيطلع مع المنشور بس';
}
// a tall design is a story by default, anything else a post
function autoFormats() {
  const tall = isTall(state.design);
  $('pub-post').checked = !tall; $('pub-story').checked = tall;
  syncPublishUi();
}
function defaultLater() {
  const d = new Date(Date.now() + 3600e3); d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
async function publish() {
  const platforms = ['facebook', 'instagram'].filter((k) => $(`pub-${k}`).checked && !$(`pub-${k}`).disabled);
  if (!platforms.length) { deps.toast('اختار فيسبوك أو إنستغرام', true); return; }
  const later = document.querySelector('input[name="studio-when"]:checked').value === 'later';
  let scheduledAt = null;
  if (later) {
    const v = $('studio-at').value; const t = v ? new Date(v) : null;
    if (!t || Number.isNaN(+t)) { deps.toast('اختار موعد النشر', true); $('studio-at').focus(); return; }
    if (+t < Date.now() + 5 * 60e3) { deps.toast('الموعد لازم يكون بعد 5 دقايق على الأقل', true); return; }
    if (+t > Date.now() + 75 * 864e5) { deps.toast('ما بنقدر نجدول لأبعد من 75 يوم', true); return; }
    scheduledAt = t.toISOString();
  }
  const d = state.deck;
  const formats = [$('pub-post').checked && 'post', $('pub-story').checked && 'story'].filter(Boolean);
  if (!formats.length) { deps.toast('اختار منشور أو ستوري', true); return; }
  const n = pageCount();
  const m = n === 1 ? state.music : null;
  if (m && !videoSupported()) { deps.toast('الموسيقى بتحتاج Chrome أو Edge على الكمبيوتر', true); return; }
  const verb = !deps.owner ? 'ينبعت لصاحب المنصة للموافقة' : later ? `يتجدول على ${whenFmt.format(new Date(scheduledAt))}` : 'ينتشر هلّق';
  const what = formats.map((f) => (n > 1 ? (f === 'story' ? `${n} ستوريات ورا بعض` : `كاروسيل من ${n} صور`)
    : f === 'story' ? (m ? 'ستوري فيديو بالموسيقى' : 'ستوري') : (m ? 'ريل/فيديو بالموسيقى' : 'منشور'))).join(' و');
  if (!confirm(`«${d.name}»: ${what}، رح ${verb} على ${platforms.map((p) => PLATFORM_NAME[p]).join(' و')}${m ? ` (الموسيقى: ${musicLabel(m)}، ${m.dur} ثانية)` : ''}. أكمل؟`)) return;
  stopPlay();
  const btn = $('studio-publish');
  deps.setBusy(btn, true);
  const progress = (t) => { const p = $('studio-progress'); p.hidden = !t; p.textContent = t || ''; };
  const done = [];
  try {
    if (n > 1) progress('عم نجهّز الصفحات…');
    const bases = [];
    for (const pg of pages()) bases.push(await rasterCanvas(pg));
    const clip = m ? await renderClip(m.audio, { start: m.start, dur: m.dur, volume: m.vol, fade: m.fade }) : null;
    for (const fmt of formats) {
      done.push(await publishJob({ design: d, base: bases[0], more: bases.slice(1), fmt, caption: $('studio-caption').value, platforms, scheduledAt,
        template: slug(), clip, motion: m?.motion, musicName: m ? musicLabel(m) : '', progress }));
    }
    if (state.src.kind === 'suggest') {
      const sg = (state.suggest || []).find((x) => x.id === state.src.id);
      if (sg) await markSuggestion(sg, 'posted', done.map((p) => p.id));
    }
    const bad = done.filter((p) => p.status === 'failed' || p.status === 'partial');
    if (bad.length) deps.toast(`${STATUS[bad[0].status][0]}: شوف التفاصيل بالقائمة`, true);
    else if (done.some(p => p.status === 'pending')) deps.toast('انبعت للموافقة ✓');
    else deps.toast(done.every((p) => p.status === 'scheduled') ? 'تمت الجدولة ✓' : 'انتشر ✓');
  } catch (e) {
    console.error(e);
    deps.toast(`${done.length ? 'جزء انتشر، والباقي ' : ''}${e.message || 'ما زبط النشر'}`, true);
  } finally { progress(''); deps.setBusy(btn, false); syncPublishUi(); }
}

// one design, one format (post / story), to the chosen platforms: now or at scheduledAt
async function publishJob({ design, base = null, more = [], fmt, caption = '', platforms, scheduledAt = null, template, clip = null, motion = 'zoom-in', musicName = '', progress = () => {}, label = '' }) {
  const name = label || (more.length ? (fmt === 'story' ? 'الستوريات' : 'الكاروسيل') : fmt === 'story' ? 'الستوري' : 'المنشور');
  const later = !!scheduledAt;
  const frame = frameFor(fmt, base || (await rasterCanvas(design)), !!clip);
  const jpeg = await toBlob(frame, 'image/jpeg', 0.92);
  let video = null;
  if (clip) {
    video = await makeVideo({ image: frame, w: frame.width, h: frame.height, clip, motion,
      onProgress: (k) => progress(`${name}: عم نعمل الفيديو… ${Math.round(k * 100)}%`) });
  }
  progress(`${name}: عم ${!deps.owner ? 'نجهّز طلب الموافقة' : later ? 'نجدول' : 'ننشر'}…`);
  let { post } = await api('/posts', { method: 'POST', body: JSON.stringify({
    image: await blobToBase64(jpeg), caption: fmt === 'story' ? '' : caption, platforms, scheduledAt,
    template: template || slugOf(design), title: titleOf(design), story: fmt === 'story', video: !!video, duration: clip ? clip.duration : 0, music: musicName,
    pages: 1 + more.length,
  }) });
  upsertPost(post);
  await saveDesign(post.id, design);
  post = await uploadPages(post, more, fmt, name, progress);
  if (video) {
    progress(`${name}: عم نرفع الفيديو (${(video.size / 1048576).toFixed(1)} MB)${later || !deps.owner ? '' : ' وننشره'}…`);
    ({ post } = await api(`/posts/${post.id}/video`, { method: 'PUT', raw: video }));
    upsertPost(post);
  }
  return post;
}
// pages 2… of a carousel / stories in a row: one request each (raw JPEG), the last one sends it on its way
async function uploadPages(post, more, fmt, name, progress) {
  for (let k = 0; k < more.length; k++) {
    progress(`${name}: عم نرفع الصفحة ${k + 2} من ${more.length + 1}…`);
    const jpeg = await toBlob(frameFor(fmt, more[k], false), 'image/jpeg', 0.92);
    ({ post } = await api(`/posts/${post.id}/page/${k + 2}`, { method: 'PUT', raw: jpeg }));
    upsertPost(post);
  }
  return post;
}
// the design goes along with every post, so it can be opened in the editor again (best effort)
async function saveDesign(id, design) {
  try {
    const { post } = await api(`/posts/${id}/design`, { method: 'PUT', raw: new Blob([JSON.stringify(design)], { type: 'application/json' }) });
    upsertPost(post);
  } catch (e) { console.warn('[studio] design not kept', e); }
}

/* =================== editing a post from the posts list / calendar =================== */
// scheduled → edit it in place (same post, same time unless changed) · already out → open a copy to publish anew
async function editPost(p) {
  if (dirty() && !(state.src.kind === 'post' && state.src.id === p.id) && !confirm('عندك تعديلات على التصميم الحالي ما انحفظت. تفتح المنشور وتتركها؟')) return;
  let design;
  try {
    if (p.hasDesign || p.preparedBy) design = await api(`/posts/${p.id}/design`);
  } catch (e) { console.warn('[studio] design', e); }
  if (!design || !Array.isArray(design.els)) design = await designFromImage(p);
  const mode = deps.owner && p.status === 'scheduled' ? 'edit' : 'copy';
  state.src = { kind: 'post', id: p.id }; setDeck(design); state.base = JSON.stringify(design);
  state.sel = -1; state.undo = []; state.redo = [];
  state.editing = { post: p, mode, orig: clone(design) };
  $('pub-story').checked = !!p.story; $('pub-post').checked = !p.story;
  if (mode === 'copy' && !p.story) { $('studio-caption').value = p.caption || ''; state.caption = p.caption || ''; $('studio-caption').dispatchEvent(new Event('input')); }
  setPane('content'); refreshAll(); renderPickers(); renderPages(); syncPublishUi(); renderEditing();
  $('studio-editing').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
// a post made before designs were kept: its picture becomes the design (you can add elements on top)
function designFromImage(p) {
  const src = `${WORKER}/img/${p.id}.jpg`;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ v: 1, id: 'upload', name: p.title || 'منشور', w: img.naturalWidth, h: img.naturalHeight, bg: { color: '#0B1020', grid: false },
      els: [{ type: 'image', src, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight, gray: false, fade: 'none', opacity: 1, rx: 0 }] });
    img.onerror = () => resolve({ v: 1, id: 'upload', name: p.title || 'منشور', w: 1080, h: p.story ? 1920 : 1350, bg: { color: '#0B1020', grid: false }, els: [] });
    img.src = src;
  });
}
function stopEditing() { state.editing = null; renderEditing(); }
function renderEditing() {
  const box = $('studio-editing'); const ed = state.editing; const h = deps.h;
  box.hidden = !ed;
  if (!ed) { box.replaceChildren(); return; }
  const p = state.posts.find((x) => x.id === ed.post.id) || ed.post;
  const kind = p.story ? 'ستوري' : 'منشور';
  if (ed.mode === 'copy') {
    box.replaceChildren(
      h('div', { class: 'ed-head' }, h('strong', {}, `✎ نسخة من ${kind} «${p.title || ''}»`), h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: stopEditing }, 'خلصت')),
      h('p', { class: 'muted small' }, `هاد ال${kind} ${STATUS[p.status]?.[0] || ''}، وميتا ما بتسمح نعدّل ${p.story ? 'ستوري' : 'منشور'} بعد ما ينزل. عدّل التصميم هون وانشره كجديد من «النشر» تحت${p.story ? ' (الستوري القديم بيختفي لحاله بعد 24 ساعة)' : ''}.`));
    return;
  }
  const at = h('input', { type: 'datetime-local', id: 'ed-at', value: toLocal(new Date(p.scheduledAt)), 'aria-label': 'الموعد' });
  const cap = p.story ? null : h('textarea', { id: 'ed-caption', rows: 4, maxlength: 2200, value: p.caption || '' });
  const m = state.music;
  const musicNote = p.video
    ? (m ? `كان فيه موسيقى «${p.music || ''}». رح يتعمل الفيديو من جديد بالموسيقى المختارة تحت: «${musicLabel(m)}».` : `كان فيه موسيقى «${p.music || ''}». الملف مش محمّل هون: اختاره من «موسيقى» تحت عشان يضل فيديو، وإلا بيصير ${kind} صورة.`)
    : (m ? `رح ينضاف عليه الموسيقى المختارة تحت: «${musicLabel(m)}» (بيصير فيديو).` : '');
  box.replaceChildren(
    h('div', { class: 'ed-head' }, h('strong', {}, `✎ عم تعدّل ${kind} مجدول: «${p.title || ''}»`),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => { if (!dirty() || confirm('تلغي التعديلات؟')) { stopEditing(); } } }, 'إلغاء')),
    h('p', { class: 'muted small' }, 'غيّر التصميم بالمحرر (المحتوى أو التصميم)، وبعدين «احفظ التعديل». بيضل نفس ال' + kind + ' بنفس المنصات.'),
    h('div', { class: 'field' }, h('label', { for: 'ed-at' }, 'بينزل'), at),
    cap ? h('div', { class: 'field' }, h('label', { for: 'ed-caption' }, 'النص'), cap) : '',
    musicNote ? h('p', { class: 'muted small' }, '♪ ', musicNote) : '',
    h('div', { class: 'acc-actions' },
      h('button', { type: 'button', class: 'btn btn-primary btn-sm', id: 'ed-save', onclick: (e) => saveEdit(e.currentTarget) },
        h('span', { class: 'btn-label' }, 'احفظ التعديل'), h('span', { class: 'spinner', 'aria-hidden': 'true' }))),
    h('p', { class: 'muted small studio-progress', id: 'ed-progress', 'aria-live': 'polite', hidden: true }));
}
async function saveEdit(btn) {
  const ed = state.editing; if (!ed || ed.mode !== 'edit') return;
  const p = state.posts.find((x) => x.id === ed.post.id) || ed.post;
  const t = new Date($('ed-at').value);
  if (Number.isNaN(+t) || +t < Date.now() + 5 * 60e3) { deps.toast('الموعد لازم يكون بعد 5 دقايق على الأقل', true); return; }
  const n = pageCount();
  const m = n === 1 ? state.music : null;
  if (p.video && !m && !confirm(`ال${p.story ? 'ستوري' : 'منشور'} كان فيه موسيقى، وهي مش محمّلة هون. تحفظه صورة بدون موسيقى؟`)) return;
  if (m && !videoSupported()) { deps.toast('الموسيقى بتحتاج Chrome أو Edge على الكمبيوتر', true); return; }
  const progress = (x) => { const el = $('ed-progress'); if (el) { el.hidden = !x; el.textContent = x || ''; } };
  deps.setBusy(btn, true); stopPlay();
  try {
    const fmt = p.story ? 'story' : 'post';
    const clip = m ? await renderClip(m.audio, { start: m.start, dur: m.dur, volume: m.vol, fade: m.fade }) : null;
    const bases = [];
    for (const pg of pages()) bases.push(await rasterCanvas(pg));
    const frame = frameFor(fmt, bases[0], !!clip);
    const jpeg = await toBlob(frame, 'image/jpeg', 0.92);
    const video = clip ? await makeVideo({ image: frame, w: frame.width, h: frame.height, clip, motion: m.motion, onProgress: (k) => progress(`عم نعمل الفيديو… ${Math.round(k * 100)}%`) }) : null;
    progress('عم نحفظ…');
    let { post } = await api(`/posts/${p.id}`, { method: 'PUT', body: JSON.stringify({
      image: await blobToBase64(jpeg), caption: $('ed-caption')?.value ?? p.caption, title: titleOf(state.deck),
      video: !!video, duration: clip ? clip.duration : 0, music: m ? musicLabel(m) : '', scheduledAt: t.toISOString(), pages: n,
    }) });
    upsertPost(post);
    await saveDesign(p.id, state.deck);
    post = await uploadPages(post, bases.slice(1), fmt, 'التعديل', progress);
    if (video) { progress(`عم نرفع الفيديو (${(video.size / 1048576).toFixed(1)} MB)…`); ({ post } = await api(`/posts/${p.id}/video`, { method: 'PUT', raw: video })); upsertPost(post); }
    state.base = JSON.stringify(state.deck); ed.orig = clone(state.deck); ed.post = post;
    persist();
    deps.toast(`انحفظ التعديل ✓ بينزل ${whenFmt.format(new Date(post.scheduledAt))}`);
    renderEditing();
  } catch (e) {
    console.error(e); deps.toast(e.message || 'ما زبط الحفظ', true);
  } finally { progress(''); deps.setBusy(btn, false); }
}


/* =================== suggestions from the gallery studio =================== */
// «استوديو المعرض» › «اقترحه على السوشيال» leaves a suggestion (Firestore › socialSuggestions): the album's new
// photos + its description. Here it can be published as it is (a carousel post with the description as text),
// opened in the editor first, or cancelled. The photos come from galleryFull (full size), the thumbs from gallery.
const SUGGEST = 'socialSuggestions';
const thumbCache = new Map();
async function loadSuggestions() {
  if (!deps.db) return;
  const { db, fs } = deps;
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, SUGGEST), fs.where('status', '==', 'pending')));
    state.suggest = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  } catch (e) { console.warn('[suggest]', e); state.suggest = []; }
  // the albums already published on the site's gallery: any of them can go to social media too
  try {
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'gallery'), fs.where('published', '==', true)));
    const photos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const map = new Map();
    photos.forEach((p) => {
      thumbCache.set(`gallery/${p.id}`, Promise.resolve(p.thumb || ''));
      const k = String(p.album || '').trim();
      if (!map.has(k)) map.set(k, { id: `album:${k}`, adhoc: true, album: k || 'صور متنوعة', desc: '', photos: [], createdAt: p.createdAt });
      const a = map.get(k); a.photos.push(p.id); if (!a.desc && p.albumDesc) a.desc = p.albumDesc;
    });
    state.albums = [...map.values()];
  } catch (e) { console.warn('[suggest albums]', e); state.albums = []; }
  renderSuggestions();
}
async function photoSrc(col, id, key) {
  const k = `${col}/${id}`;
  if (!thumbCache.has(k)) {
    const { db, fs } = deps;
    thumbCache.set(k, fs.getDoc(fs.doc(db, col, id)).then((s) => (s.exists() ? s.data()[key] || '' : '')).catch(() => ''));
  }
  return thumbCache.get(k);
}
const loadImg = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = reject; i.src = src; });
/** the suggestion's photos as pages of one deck: the first photo's shape (between 1.91:1 and 4:5), each photo whole inside */
async function deckFromSuggestion(sg, progress = () => {}) {
  const ids = sg.photos.slice(0, MAX_PAGES);
  const imgs = [];
  for (const [k, id] of ids.entries()) {
    progress(`عم نجيب الصورة ${k + 1} من ${ids.length}…`);
    const src = await photoSrc('galleryFull', id, 'src');
    if (!src) continue;
    try { imgs.push({ src, img: await loadImg(src) }); } catch { /* skip a broken one */ }
  }
  if (!imgs.length) throw new Error('صور الاقتراح مش موجودة (يمكن انحذفت من المعرض)');
  const W = 1080;
  const first = imgs[0].img;
  const H = Math.round(Math.min(1350, Math.max(566, (W * first.naturalHeight) / first.naturalWidth)));
  const page = ({ src, img }) => {
    const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
    const w = Math.round(img.naturalWidth * s); const h = Math.round(img.naturalHeight * s);
    return { w: W, h: H, bg: { color: '#0B1020', grid: false },
      els: [{ type: 'image', src, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, gray: false, fade: 'none', opacity: 1, rx: 0 }] };
  };
  const [head, ...rest] = imgs.map(page);
  return { v: 1, id: 'gallery', name: sg.album || 'من المعرض', ...head, ...(rest.length ? { more: rest } : {}) };
}
const suggestCaption = (sg) => String(sg.desc || '').trim() || String(sg.album || '').trim();
async function markSuggestion(sg, status, postIds = []) {
  if (sg.adhoc) return; // a published album picked from the list, not a stored suggestion
  try {
    const { db, fs } = deps;
    await fs.updateDoc(fs.doc(db, SUGGEST, sg.id), { status, handledBy: deps.user()?.email || '', postIds, updatedAt: fs.serverTimestamp() });
  } catch (e) { console.warn('[suggest]', e); }
  state.suggest = (state.suggest || []).filter((x) => x.id !== sg.id);
  renderSuggestions();
}
async function acceptSuggestion(sg, btn) {
  const conn = state.conn || {};
  const platforms = ['facebook', 'instagram'].filter((k) => conn[k]);
  if (!platforms.length) { deps.toast('اربط فيسبوك أو إنستغرام أول', true); return; }
  const n = Math.min(sg.photos.length, MAX_PAGES);
  const what = n > 1 ? `كاروسيل من ${n} صور` : 'منشور بصورة';
  const extra = sg.photos.length > MAX_PAGES ? ` (أول ${MAX_PAGES} صور بس: هاد حد إنستغرام)` : '';
  const verb = deps.owner ? 'ينتشر هلّق' : 'ينبعت لصاحب المنصة للموافقة';
  if (!confirm(`«${sg.album || 'من المعرض'}»: ${what}${extra}، والنص وصف الألبوم. رح ${verb} على ${platforms.map((p) => PLATFORM_NAME[p]).join(' و')}. أكمل؟`)) return;
  const prog = $(`sg-progress-${sg.id}`);
  const progress = (t) => { if (prog) { prog.hidden = !t; prog.textContent = t || ''; } };
  deps.setBusy(btn, true);
  try {
    const deck = await deckFromSuggestion(sg, progress);
    progress('عم نجهّز الصفحات…');
    const bases = [];
    for (const pg of [deck, ...(deck.more || [])]) bases.push(await rasterCanvas(pg));
    const post = await publishJob({ design: deck, base: bases[0], more: bases.slice(1), fmt: 'post', caption: suggestCaption(sg), platforms, label: n > 1 ? 'الكاروسيل' : 'المنشور', progress });
    await markSuggestion(sg, 'posted', [post.id]);
    deps.toast(post.status === 'pending' ? 'انبعت للموافقة ✓' : post.status === 'failed' || post.status === 'partial' ? 'في مشكلة بالنشر: شوف القائمة' : 'انتشر ✓', post.status === 'failed' || post.status === 'partial');
  } catch (e) {
    console.error(e); deps.toast(e.message || 'ما زبط النشر', true);
  } finally { progress(''); deps.setBusy(btn, false); }
}
async function editSuggestion(sg, btn) {
  if (dirty() && !confirm('عندك تعديلات على التصميم الحالي ما انحفظت. تفتح صور المعرض وتتركها؟')) return;
  const prog = $(`sg-progress-${sg.id}`);
  const progress = (t) => { if (prog) { prog.hidden = !t; prog.textContent = t || ''; } };
  deps.setBusy(btn, true);
  try {
    const deck = await deckFromSuggestion(sg, progress);
    stopEditing();
    state.src = { kind: 'suggest', id: sg.id }; setDeck(deck); state.base = JSON.stringify(deck);
    state.sel = -1; state.undo = []; state.redo = [];
    $('studio-caption').value = suggestCaption(sg); state.caption = $('studio-caption').value; $('studio-caption').dispatchEvent(new Event('input'));
    $('pub-post').checked = true; $('pub-story').checked = false;
    setPane('content'); refreshAll(); renderPickers(); renderPages(); syncPublishUi();
    $('studio-stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
    deps.toast('فتحت صور الألبوم بالمحرر، كل صورة صفحة. عدّل وانشر من «النشر» تحت.');
  } catch (e) { console.error(e); deps.toast(e.message || 'ما قدرنا نفتح الصور', true); } finally { progress(''); deps.setBusy(btn, false); }
}
async function dismissSuggestion(sg) {
  if (!confirm(`تلغي اقتراح «${sg.album || 'من المعرض'}»؟ الصور بتضل بالمعرض، بس ما رح تنتشر على السوشيال.`)) return;
  await markSuggestion(sg, 'dismissed');
  deps.toast('انلغى الاقتراح');
}
const sgFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
function renderSuggestions() {
  const box = $('studio-suggest'); const h = deps.h; const list = state.suggest || []; const albums = state.albums || [];
  box.hidden = !list.length && !albums.length;
  if (box.hidden) { box.replaceChildren(); return; }
  const row = (sg) => {
    const thumbs = h('span', { class: 'sg-thumbs', 'aria-hidden': 'true' });
    sg.photos.slice(0, 5).forEach((id) => {
      const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
      thumbs.append(img);
      photoSrc('gallery', id, 'thumb').then((src) => { if (src) img.src = src; else img.remove(); });
    });
    if (sg.photos.length > 5) thumbs.append(h('span', { class: 'sg-more' }, `+${sg.photos.length - 5}`));
    const when = sg.createdAt?.toDate ? sgFmt.format(sg.createdAt.toDate()) : '';
    return h('li', { class: 'sg-item' },
      thumbs,
      h('div', { class: 'sg-info' },
        h('strong', {}, sg.album || 'صور متنوعة'),
        h('span', { class: 'muted small' }, [`${sg.photos.length} ${sg.photos.length === 1 ? 'صورة' : sg.photos.length === 2 ? 'صورتين' : 'صور'}`, when, sg.by].filter(Boolean).join(' · ')),
        sg.desc ? h('p', { class: 'sg-desc' }, sg.desc) : h('p', { class: 'muted small' }, 'ما في وصف: النص رح يكون اسم الألبوم.'),
        h('p', { class: 'muted small studio-progress', id: `sg-progress-${sg.id}`, 'aria-live': 'polite', hidden: true })),
      h('div', { class: 'sg-actions' },
        h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: (e) => acceptSuggestion(sg, e.currentTarget) },
          h('span', { class: 'btn-label' }, deps.owner ? 'انشر' : 'أرسل للموافقة'), h('span', { class: 'spinner', 'aria-hidden': 'true' })),
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: (e) => editSuggestion(sg, e.currentTarget) },
          h('span', { class: 'btn-label' }, 'عدّل قبل النشر'), h('span', { class: 'spinner', 'aria-hidden': 'true' })),
        sg.adhoc ? '' : h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm sg-cancel', onclick: () => dismissSuggestion(sg) }, 'إلغاء')));
  };
  const open = (() => { try { return localStorage.getItem('blt-sg-albums') === '1'; } catch { return false; } })();
  box.replaceChildren(
    h('div', { class: 'studio-head' }, h('h2', {}, list.length ? `من استوديو المعرض (${list.length})` : 'من المعرض')),
    list.length
      ? h('p', { class: 'muted small' }, 'صور انحفظت بالمعرض واقترحوها للسوشيال. «انشر» بينزلها كاروسيل والنص وصف الألبوم، «عدّل قبل النشر» بيفتحها بالمحرر، و«إلغاء» بيشيل الاقتراح (الصور بتضل بالمعرض).')
      : h('p', { class: 'muted small' }, 'ما في اقتراحات جديدة من استوديو المعرض. فيك تنشر أي ألبوم منشور بالمعرض من تحت.'),
    list.length ? h('ul', { class: 'sg-list' }, list.map(row)) : '',
    albums.length ? h('details', { class: 'sg-albums', open, ontoggle: (e) => { try { localStorage.setItem('blt-sg-albums', e.currentTarget.open ? '1' : '0'); } catch { /* private */ } } },
      h('summary', {}, `ألبومات منشورة بالمعرض (${albums.length})`),
      h('ul', { class: 'sg-list' }, albums.map(row))) : '');
}

/* =================== workshop campaign: post + two stories from a workshop =================== */
// opened from «الورشات» › «اعمل بوست وستوري» (admin.js → openWorkshopCampaign)
function campaignItem(key) { return state.campaign?.items.find((x) => x.key === key); }
export function openWorkshopCampaign(w, opts = {}) {
  const c = workshopCampaign(w, opts);
  state.campaign = { ...c, workshop: w, opts, photo: opts.photo || '', items: c.items.map((it) => ({ ...it, on: !it.past, orig: clone(it.design) })) };
  renderCampaign();
  $('studio-campaign').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
let thumbT = 0;
function refreshCampaignThumbs() {
  clearTimeout(thumbT);
  thumbT = setTimeout(() => {
    document.querySelectorAll('[data-camp-art]').forEach((el) => {
      const it = campaignItem(el.dataset.campArt);
      if (it) el.innerHTML = renderDesign(it.design, { measure }); // escaped renderer output
    });
  }, 250);
}
function setCampaignPhoto(src) {
  const c = state.campaign; if (!c) return;
  c.photo = src;
  c.items.forEach((it) => { it.design.els.filter((e) => e.slot === 'photo').forEach((e) => { e.src = src; }); });
  if (state.src.kind === 'campaign') renderStage();
  renderCampaign();
}
function editCampaignItem(key) {
  const it = campaignItem(key); if (!it) return;
  if (dirty() && state.src.kind !== 'campaign' && !confirm('عندك تعديلات على القالب الحالي ما انحفظت. تفتح تصميم الحملة وتتركها؟')) return;
  stopEditing();
  state.src = { kind: 'campaign', id: key }; setDeck(it.design); state.base = JSON.stringify(it.orig);
  state.sel = -1; state.undo = []; state.redo = [];
  setPane('content'); refreshAll(); renderPickers(); renderPages(); autoFormats();
  $('studio-stage').scrollIntoView({ behavior: 'smooth', block: 'center' });
  deps.toast(`فتحت «${it.label}» بالمحرر. التعديلات بتنحفظ بالحملة لحالها.`);
}
function renderCampaign() {
  const box = $('studio-campaign'); const c = state.campaign; const h = deps.h;
  box.hidden = !c;
  if (!c) { box.replaceChildren(); return; }
  const file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true,
    onchange: async (ev) => { const f = ev.target.files[0]; ev.target.value = ''; if (!f) return; try { setCampaignPhoto(await readPhoto(f)); } catch { deps.toast('ما قدرنا نقرأ الصورة', true); } } });
  const conn = state.conn || {};
  const rows = c.items.map((it) => {
    const art = h('span', { class: 'camp-art', 'data-camp-art': it.key, 'aria-hidden': 'true' });
    art.innerHTML = renderDesign(it.design, { measure }); // escaped renderer output
    const at = h('input', { type: 'datetime-local', value: it.at, 'aria-label': `موعد ${it.label}`, onchange: (e) => { it.at = e.target.value; it.past = !!it.at && +new Date(it.at) < Date.now() + 5 * 60e3; renderCampaign(); } });
    return h('li', { class: `camp-item ${it.on ? '' : 'is-off'} ${it.fmt === 'story' ? 'is-story' : ''}` },
      h('label', { class: 'studio-chk camp-check' }, h('input', { type: 'checkbox', checked: it.on, onchange: (e) => { it.on = e.target.checked; renderCampaign(); } }), h('strong', {}, it.label)),
      art,
      h('div', { class: 'camp-when' },
        h('span', { class: 'muted small' }, it.key === 'post' ? 'متى؟ (فاضي = هلّق)' : 'متى؟'), at,
        it.past ? h('span', { class: 'conn-warn small' }, 'الموعد فات أو قريب كتير: غيّره أو شيل الإشارة') : '',
        !it.at && it.key !== 'post' ? h('span', { class: 'conn-warn small' }, 'حط تاريخ للورشة (أو موعد هون) عشان يتجدول') : ''),
      h('div', { class: 'camp-actions' }, h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => editCampaignItem(it.key) }, state.src.kind === 'campaign' && state.src.id === it.key ? 'مفتوح بالمحرر' : 'عدّل بالمحرر')));
  });
  const post = campaignItem('post');
  box.replaceChildren(
    h('div', { class: 'studio-head' }, h('h2', {}, `حملة الورشة: ${c.title}`),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => { state.campaign = null; renderCampaign(); } }, 'سكّر')),
    h('p', { class: 'muted small' }, 'جهّزتلك من بيانات الورشة: بوست إعلان، ستوري تذكير قبلها بيوم الساعة 6 المسا، وستوري «بلّشنا» وقت ما تبلّش. شوف كل واحد، عدّله بالمحرر إذا بدك.'),
    h('div', { class: 'camp-photo' }, file,
      c.photo ? h('img', { src: c.photo, alt: 'صورة المدرّب', width: 56, height: 56 }) : h('span', { class: 'camp-photo-empty', 'aria-hidden': 'true' }, '?'),
      h('div', {}, h('strong', {}, 'صورة المدرّب'), h('p', { class: 'muted small' }, 'بتطلع بالدائرة بالبوست. صورة مربعة والوجه بالنص بتطلع أحلى.')),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => file.click() }, c.photo ? 'غيّر الصورة' : 'ارفع صورة'), libraryButton(setCampaignPhoto)),
    h('ul', { class: 'camp-list' }, rows),
    h('div', { class: 'field' }, h('label', { for: 'camp-caption' }, 'نص بوست الإعلان'),
      h('textarea', { id: 'camp-caption', rows: 7, maxlength: 2200, value: post.caption, oninput: (e) => { post.caption = e.target.value; } })),
    h('fieldset', { class: 'field studio-platforms' }, h('legend', {}, 'وين؟'),
      ['facebook', 'instagram'].map((k) => h('label', { class: 'studio-chk' }, h('input', { type: 'checkbox', checked: conn[k] && (c.platforms ? c.platforms.includes(k) : true), disabled: !conn[k], 'data-camp-pf': k, onchange: () => { c.platforms = [...box.querySelectorAll('[data-camp-pf]:checked')].map((x) => x.dataset.campPf); } }), h('span', {}, PLATFORM_NAME[k])))),
    h('div', { class: 'studio-actions' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'camp-go', onclick: (e) => runCampaign(e.currentTarget) },
      h('span', { class: 'btn-label' }, deps.owner ? 'انشر وجدول الحملة' : 'أرسل الحملة للموافقة'), h('span', { class: 'spinner', 'aria-hidden': 'true' }))),
    h('p', { class: 'muted small studio-progress', id: 'camp-progress', 'aria-live': 'polite', hidden: true }));
}
async function runCampaign(btn) {
  const c = state.campaign; if (!c) return;
  const platforms = [...document.querySelectorAll('[data-camp-pf]:checked')].map((x) => x.dataset.campPf);
  if (!platforms.length) { deps.toast('اختار فيسبوك أو إنستغرام (لازم يكونوا مربوطين)', true); return; }
  const items = c.items.filter((it) => it.on);
  if (!items.length) { deps.toast('أشّر على إشي واحد على الأقل', true); return; }
  for (const it of items) {
    if (it.past) { deps.toast(`موعد «${it.label}» فات. غيّره أو شيل الإشارة عنه.`, true); return; }
    if (it.key !== 'post' && !it.at) { deps.toast(`«${it.label}» بده موعد`, true); return; }
  }
  if (items.some((it) => it.design.els.some((e) => e.slot === 'photo' && !e.src && !e.hidden)) && !confirm('ما رفعت صورة المدرّب، فالبوست بيطلع فيه «صورة المدرّب» فاضية. تكمّل هيك؟')) return;
  const lines = items.map((it) => `• ${it.label}: ${it.at ? whenFmt.format(new Date(it.at)) : 'هلّق'}`).join('\n');
  if (!confirm(`حملة «${c.title}» على ${platforms.map((p) => PLATFORM_NAME[p]).join(' و')}:\n${lines}\n\nأكمل؟`)) return;
  const progress = (t) => { const p = $('camp-progress'); if (p) { p.hidden = !t; p.textContent = t || ''; } };
  deps.setBusy(btn, true);
  const done = [];
  try {
    for (const it of items) {
      const scheduledAt = it.at ? new Date(it.at).toISOString() : null;
      done.push(await publishJob({ design: it.design, fmt: it.fmt, caption: it.caption, platforms, scheduledAt, label: it.label, progress }));
      it.on = false; it.sent = true;
    }
    const bad = done.filter((p) => p.status === 'failed' || p.status === 'partial');
    deps.toast(bad.length ? 'في إشي ما انتشر: شوف التقويم' : !deps.owner ? 'انبعتت الحملة للموافقة' : 'تمّت الحملة ✓ شوفها بالتقويم', !!bad.length);
    state.calMonth = monthStart(new Date(Math.max(...done.map((p) => Date.parse(p.scheduledAt || p.publishedAt || p.createdAt)))));
    setPostsView('cal');
  } catch (e) {
    console.error(e); deps.toast(`${done.length ? `انعمل ${done.length} من ${items.length}، والباقي: ` : ''}${e.message || 'ما زبط'}`, true);
  } finally { progress(''); deps.setBusy(btn, false); renderCampaign(); }
}

/* =================== content calendar =================== */
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit' });
const WEEK = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']; // the week starts on Saturday
const postWhen = (p) => new Date(p.status === 'scheduled' || p.status === 'uploading' ? p.scheduledAt || p.createdAt : p.publishedAt || p.scheduledAt || p.createdAt);
function setPostsView(v) {
  state.postsView = v;
  try { localStorage.setItem('blt-studio-view', v); } catch { /* private mode */ }
  $('sv-cal').setAttribute('aria-selected', String(v === 'cal'));
  $('sv-list').setAttribute('aria-selected', String(v === 'list'));
  $('studio-cal').hidden = v !== 'cal';
  $('studio-posts').hidden = v !== 'list';
  $('studio-empty').hidden = v !== 'list' || state.posts.length > 0;
  if (v === 'cal') renderCalendar();
}
async function movePost(p, toDay) {
  const old = new Date(p.scheduledAt);
  const [y, m, d] = toDay.split('-').map(Number);
  const at = new Date(y, m - 1, d, old.getHours(), old.getMinutes());
  if (+at < Date.now() + 5 * 60e3) { deps.toast('ما بنقدر ننقله لوقت فات', true); return; }
  if (ymd(old) === toDay) return;
  try {
    const { post } = await api(`/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify({ scheduledAt: at.toISOString() }) });
    upsertPost(post); deps.toast(`انتقل لـ ${whenFmt.format(at)} ✓`);
  } catch (e) { deps.toast(e.message, true); }
}
function planDay(day) {
  // an empty future day: prepare the publish form for it (18:00 that day)
  document.querySelector('input[name="studio-when"][value="later"]').checked = true;
  $('studio-at').value = `${day}T18:00`;
  syncPublishUi();
  $('studio-publish').scrollIntoView({ behavior: 'smooth', block: 'center' });
  deps.toast('جهّزتلك النشر على هاليوم الساعة 6 المسا. صمّم واكبس «جدول المنشور».');
}
function renderCalendar() {
  const box = $('studio-cal'); const h = deps.h;
  const month = state.calMonth || monthStart(new Date());
  state.calMonth = month;
  const first = new Date(month); const lead = (first.getDay() + 1) % 7; // days before the 1st, from Saturday
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
  const today = ymd(new Date());
  const byDay = new Map();
  state.posts.forEach((p) => { const k = ymd(postWhen(p)); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(p); });
  byDay.forEach((l) => l.sort((a, b) => postWhen(a) - postWhen(b)));
  const inMonth = state.posts.filter((p) => { const d = postWhen(p); return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear(); });
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(d); const list = byDay.get(key) || [];
    const future = key >= today;
    const cell = h('div', { class: `cal-day ${d.getMonth() !== month.getMonth() ? 'is-out' : ''} ${key === today ? 'is-today' : ''} ${list.length ? '' : 'is-empty'} ${future ? '' : 'is-past'}`, 'data-day': key,
      ondragover: (e) => { if (deps.owner && future) { e.preventDefault(); cell.classList.add('is-drop'); } },
      ondragleave: () => cell.classList.remove('is-drop'),
      ondrop: (e) => { e.preventDefault(); cell.classList.remove('is-drop'); const p = state.posts.find((x) => x.id === e.dataTransfer.getData('text/plain')); if (p) movePost(p, key); } },
    h('span', { class: 'cal-num' }, String(d.getDate())),
    ...list.slice(0, 4).map((p) => {
      const [label, cls] = STATUS[p.status] || [p.status, ''];
      return h('button', { type: 'button', class: `cal-chip ${cls} ${p.story ? 'is-story' : ''}`, draggable: deps.owner && p.status === 'scheduled' ? 'true' : null,
        title: `${label} · ${p.title || ''}`,
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; },
        onclick: () => { state.calSel = p.id; renderCalendar(); } },
      h('span', { class: 'cal-time' }, timeFmt.format(postWhen(p))), ' ', p.story ? '◯' : '▢', ' ', String(p.title || '').slice(0, 22));
    }),
    list.length > 4 ? h('span', { class: 'cal-more' }, `+${list.length - 4}`) : '',
    !list.length && future ? h('button', { type: 'button', class: 'cal-add', title: 'جدول منشور بهاليوم', 'aria-label': `جدول منشور يوم ${d.getDate()}`, onclick: () => planDay(key) }, '+') : '');
    cells.push(cell);
  }
  const sel = state.posts.find((p) => p.id === state.calSel);
  const shift = (n) => { state.calMonth = new Date(month.getFullYear(), month.getMonth() + n, 1); renderCalendar(); };
  const counts = { scheduled: 0, published: 0, failed: 0 };
  inMonth.forEach((p) => { if (p.status === 'scheduled') counts.scheduled++; else if (p.status === 'published') counts.published++; else if (p.status === 'failed' || p.status === 'partial') counts.failed++; });
  box.replaceChildren(
    h('div', { class: 'cal-head' },
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => shift(-1), 'aria-label': 'الشهر اللي قبل' }, '›'),
      h('strong', {}, monthFmt.format(month)),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => shift(1), 'aria-label': 'الشهر الجاي' }, '‹'),
      h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => { state.calMonth = monthStart(new Date()); renderCalendar(); } }, 'اليوم'),
      h('span', { class: 'muted small cal-sum' }, `هالشهر: ${counts.scheduled} مجدول · ${counts.published} انتشر${counts.failed ? ` · ${counts.failed} فيه مشكلة` : ''}`)),
    h('div', { class: 'cal-grid', role: 'grid' }, WEEK.map((w) => h('span', { class: 'cal-wd' }, w)), cells),
    h('p', { class: 'muted small' }, 'اسحب أي منشور مجدول ليوم ثاني عشان تغيّر موعده (بيضل نفس الساعة). اضغط على منشور لتفاصيله، أو على «+» بيوم فاضي لتجدول فيه. ◯ ستوري · ▢ منشور'),
    sel ? calDetail(sel) : '');
}
function editBtn(p) {
  if (p.status === 'uploading' || p.status === 'publishing') return '';
  const scheduled = deps.owner && p.status === 'scheduled';
  return deps.h('button', { type: 'button', class: `btn ${scheduled ? 'btn-primary' : 'btn-ghost-dark'} btn-sm`, title: scheduled ? 'افتحه بالمحرر وعدّله قبل ما ينزل' : 'المنتشر ما بينعدّل: افتح نسخة منه وانشرها من جديد',
    onclick: () => editPost(p) }, scheduled ? '✎ عدّل' : '✎ عدّل وانشر نسخة');
}
function reviewPost(p) {
  if (p.status !== 'pending') return '';
  const h = deps.h;
  return h('details', {}, h('summary', {}, 'راجع المنشور'),
    h('p', {}, 'جهّزه ' + p.createdBy),
    h('p', {}, p.scheduledAt ? 'الموعد المطلوب: ' + whenFmt.format(new Date(p.scheduledAt)) : 'النشر بعد الموافقة'),
    p.video ? h('video', { src: WORKER + '/vid/' + p.id + '.mp4', controls: true, preload: 'none', style: 'max-width:100%;max-height:400px' }) :
      h('img', { src: WORKER + '/img/' + p.id + '.jpg', alt: 'معاينة المنشور', style: 'width:auto;max-width:100%;height:auto;max-height:400px' }),
    h('p', {}, p.caption || ''),
    deps.owner ? h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: e => postAct(e.currentTarget, p, 'approve') }, 'وافق على النشر') : '');
}

function statsPanel(p) {
  if (!['partial', 'published'].includes(p.status)) return '';
  const h = deps.h;
  const METRICS = [['reach', 'الوصول'], ['likes', 'الإعجابات'], ['comments', 'التعليقات']];
  const NAMES = { likes: 'الإعجابات', comments: 'التعليقات', engagement: 'الإعجابات والتعليقات', reach: 'الوصول' };
  const num = new Intl.NumberFormat('en');
  const timeFmt = new Intl.DateTimeFormat('ar', { hour: 'numeric', minute: '2-digit', numberingSystem: 'latn' });
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const body = h('div', { class: 'sps-body', role: 'status', 'aria-live': 'polite' });
  const stamp = h('span', { class: 'sps-stamp' });
  const button = h('button', { type: 'button', class: 'sps-refresh', onclick: load },
    h('span', { class: 'sps-spin', 'aria-hidden': 'true' }, '↻'), 'حدّث');
  const peek = h('span', { class: 'sps-peek' });
  const details = h('details', { class: 'sp-stats' },
    h('summary', {}, h('span', { class: 'sps-title' }, 'إحصائيات المنشور'), peek, h('span', { class: 'sps-chev', 'aria-hidden': 'true' })),
    body, h('div', { class: 'sps-foot' }, stamp, button));
  let prev = null; // the last numbers, so a refresh counts up from them and shows what changed

  const postLink = (k) => {
    const r = p.results?.[k] || {};
    return r.link || (k === 'facebook' && r.id && !r.story ? `https://www.facebook.com/${r.id}` : r.permalink || '');
  };
  function countUp(el, to, from) {
    if (still() || from === to) { el.textContent = num.format(to); return; }
    const t0 = performance.now(), span = 900;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / span);
      el.textContent = num.format(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(step);
    };
    el.textContent = num.format(from);
    requestAnimationFrame(step);
    setTimeout(() => { el.textContent = num.format(to); }, span + 250); // a background tab pauses animation frames
  }
  const skeleton = () => h('div', { class: 'sps-grid' }, ...p.platforms.map((k, i) => h('div', { class: 'sps-card is-skel', 'data-platform': k, style: `--i:${i}`, 'aria-hidden': 'true' },
    h('div', { class: 'sps-head' }, h('span', { class: 'sps-dot' }), PLATFORM_NAME[k] || k),
    h('div', { class: 'sps-metrics' }, ...METRICS.map(() => h('div', { class: 'sps-metric' }, h('span', { class: 'sps-bone is-big' }), h('span', { class: 'sps-bone' })))))));

  function card(platform, r, i) {
    const before = prev?.[platform] || {};
    const href = postLink(platform);
    const metrics = METRICS.map(([k, label]) => {
      const v = r[k];
      if (v == null) return h('div', { class: 'sps-metric is-na', title: 'غير متاح من ميتا' }, h('dt', {}, label), h('dd', {}, '—'));
      const value = h('span', {});
      countUp(value, v, prev ? (before[k] ?? 0) : 0);
      const diff = before[k] != null ? v - before[k] : 0;
      return h('div', { class: 'sps-metric' }, h('dt', {}, label), h('dd', {}, value,
        diff > 0 ? h('span', { class: 'sps-delta', title: 'زيادة من آخر تحديث' }, '+' + num.format(diff)) : ''));
    });
    const engaged = (r.likes ?? 0) + (r.comments ?? 0);
    const rate = r.reach > 0 && (r.likes != null || r.comments != null) ? Math.min(100, (engaged / r.reach) * 100) : null;
    const fill = h('span', { class: 'sps-bar-fill' });
    if (rate != null) setTimeout(() => fill.style.setProperty('--w', rate.toFixed(1) + '%'), 60);
    return h('div', { class: 'sps-card', 'data-platform': platform, style: `--i:${i}` },
      h('div', { class: 'sps-head' }, h('span', { class: 'sps-dot', 'aria-hidden': 'true' }), PLATFORM_NAME[platform] || platform,
        href ? h('a', { class: 'sps-open', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `افتح المنشور على ${PLATFORM_NAME[platform]}` }, 'افتح ↗') : ''),
      h('dl', { class: 'sps-metrics' }, ...metrics),
      rate != null ? h('div', { class: 'sps-rate', title: '(الإعجابات + التعليقات) ÷ الوصول' },
        h('div', { class: 'sps-rate-top' }, h('span', {}, 'نسبة التفاعل'), h('strong', {}, (rate < 10 ? rate.toFixed(1) : Math.round(rate)) + '%')),
        h('span', { class: 'sps-bar' }, fill)) : '');
  }

  async function load() {
    if (button.disabled) return;
    button.disabled = true;
    details.classList.add('is-loading');
    if (!prev) body.replaceChildren(skeleton());
    try {
      const data = await api('/posts/' + p.id + '/stats');
      const rows = Object.entries(data.rows || {});
      const notes = [];
      for (const issue of data.issues || []) {
        const reason = issue.need ? `بدها صلاحية ${issue.need}`
          : [10, 200].includes(issue.code) ? 'ميتا رفضت صلاحية القراءة'
          : issue.code === 190 ? 'انتهت صلاحية الربط أو أُلغيت' : 'تعذّرت القراءة من ميتا';
        notes.push(h('li', {}, `${PLATFORM_NAME[issue.platform]} · ${NAMES[issue.metric]}: ${reason}${issue.code && !issue.need ? ' (' + issue.code + ')' : ''}`));
      }
      if (!notes.length && rows.some(([, r]) => Object.values(r).includes(null))) {
        notes.push(h('li', {}, '— يعني الرقم مش متاح من ميتا لهاد المنشور (مثلاً ستوري فيسبوك).'));
      }
      body.classList.toggle('is-first', !prev);
      body.replaceChildren(
        rows.length ? h('div', { class: 'sps-grid' }, ...rows.map(([k, r], i) => card(k, r, i))) : h('p', { class: 'sps-note' }, 'ما في أرقام لهاد المنشور.'),
        notes.length ? h('ul', { class: 'sps-notes' }, ...notes) : '',
        data.missing?.length ? h('p', { class: 'conn-warn' }, 'الربط الحالي ناقصه صلاحيات الإحصائيات. ' + (deps.owner
          ? 'من «الربط» اضغط «ربط من جديد» ثم «ربط بفيسبوك» ووافق على كل الصلاحيات.'
          : 'صاحب المنصة لازم يعمل ربط من جديد بفيسبوك.')) : '');
      prev = data.rows || {};
      const total = (k) => rows.reduce((n, [, r]) => n + (r[k] ?? 0), 0);
      peek.textContent = rows.length ? `${num.format(total('reach'))} وصول · ${num.format(total('likes'))} إعجاب` : '';
      stamp.textContent = 'آخر تحديث ' + timeFmt.format(new Date());
    } catch (e) {
      if (!prev) body.replaceChildren(h('p', { class: 'conn-warn' }, e.message));
      else stamp.textContent = e.message;
    } finally {
      button.disabled = false;
      details.classList.remove('is-loading');
    }
  }
  details.ontoggle = () => { if (details.open && !prev) load(); };
  return details;
}

function calDetail(p) {
  const h = deps.h; const [label, cls] = STATUS[p.status] || [p.status, ''];
  const results = p.platforms.map((k) => { const r = p.results?.[k] || {}; return h('span', { class: `res ${r.id ? 'ok' : r.error ? 'err' : ''}` }, r.id ? `${PLATFORM_NAME[k]} ✓` : r.error ? `${PLATFORM_NAME[k]}: ${r.error}` : PLATFORM_NAME[k]); });
  const actions = [editBtn(p)];
  if (deps.owner && p.status === 'scheduled') {
    const at = h('input', { type: 'datetime-local', value: toLocal(new Date(p.scheduledAt)), 'aria-label': 'الموعد الجديد' });
    actions.push(at, h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: async () => {
      const t = new Date(at.value);
      if (Number.isNaN(+t) || +t < Date.now() + 5 * 60e3) { deps.toast('اختار موعد بعد 5 دقايق على الأقل', true); return; }
      try { const { post } = await api(`/posts/${p.id}`, { method: 'PATCH', body: JSON.stringify({ scheduledAt: t.toISOString() }) }); upsertPost(post); deps.toast('تغيّر الموعد ✓'); } catch (e) { deps.toast(e.message, true); }
    } }, 'احفظ الموعد'));
  }
  if (deps.owner && ['scheduled', 'failed', 'partial'].includes(p.status)) actions.push(h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: (e) => postAct(e.currentTarget, p, 'publish') }, p.status === 'scheduled' ? 'انشر الآن' : 'جرّب كمان مرة'));
  if (deps.owner && ['scheduled', 'failed', 'pending', 'uploading'].includes(p.status)) actions.push(h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: (e) => postAct(e.currentTarget, p, 'delete') }, p.status === 'scheduled' ? 'إلغاء' : 'حذف'));
  return h('div', { class: 'cal-detail' },
    h('img', { src: `${WORKER}/img/${p.id}.jpg`, alt: '', width: 72, height: 90 }),
    h('div', {},
      h('div', { class: 'sp-top' }, h('span', { class: `st ${cls}` }, label), p.story ? h('span', { class: 'sp-badge' }, 'ستوري') : '', h('strong', {}, p.title || '')),
      h('p', { class: 'muted small' }, whenFmt.format(postWhen(p))),
      h('div', { class: 'sp-res' }, results),
      reviewPost(p), h('div', { class: 'cal-actions' }, actions)),
    h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => { state.calSel = null; renderCalendar(); }, 'aria-label': 'سكّر' }, '×'));
}
const toLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/* =================== posts list =================== */
async function loadPosts() {
  try { state.posts = (await api('/posts')).posts || []; renderPosts(); } catch (e) { deps.toast(e.message, true); }
}
function upsertPost(p) {
  const i = state.posts.findIndex((x) => x.id === p.id);
  if (i >= 0) state.posts[i] = p; else state.posts.unshift(p);
  renderPosts();
}
function renderPosts() {
  const list = $('studio-posts');
  $('studio-empty').hidden = state.postsView !== 'list' || state.posts.length > 0;
  if (state.postsView === 'cal') renderCalendar();
  list.replaceChildren(...state.posts.map((p) => {
    const [label, cls] = STATUS[p.status] || [p.status, ''];
    const tname = p.template === 'upload' ? 'صورة جاهزة' : BUILTIN.find((t) => t.id === p.template)?.name || 'قالب خاص';
    const when = p.status === 'scheduled' ? `موعده: ${whenFmt.format(new Date(p.scheduledAt))}`
      : p.publishedAt ? `انتشر: ${whenFmt.format(new Date(p.publishedAt))}` : `انعمل: ${whenFmt.format(new Date(p.createdAt))}`;
    const results = p.platforms.map((k) => {
      const r = p.results?.[k] || {};
      const href = r.link || (k === 'facebook' && r.id && !r.story ? `https://www.facebook.com/${r.id}` : r.permalink || '');
      const txt = r.id ? `${PLATFORM_NAME[k]} ✓` : r.error ? `${PLATFORM_NAME[k]}: ${r.error}` : PLATFORM_NAME[k];
      return href ? deps.h('a', { class: 'res ok', href, target: '_blank', rel: 'noopener noreferrer' }, txt)
        : deps.h('span', { class: `res ${r.error ? 'err' : ''}` }, txt);
    });
    const actions = [];
    actions.push(editBtn(p));
    if (deps.owner && ['scheduled', 'failed', 'partial'].includes(p.status)) {
      actions.push(deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: (e) => postAct(e.currentTarget, p, 'publish') }, p.status === 'scheduled' ? 'انشر الآن' : 'جرّب كمان مرة'));
    }
    if (deps.owner && ['scheduled', 'pending', 'failed', 'uploading'].includes(p.status)) {
      actions.push(deps.h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: (e) => postAct(e.currentTarget, p, 'delete') }, p.status === 'scheduled' ? 'إلغاء' : 'حذف'));
    }
    return deps.h('li', { class: 'studio-post' },
      deps.h('img', { src: `${WORKER}/img/${p.id}.jpg`, alt: '', loading: 'lazy', width: 64, height: 80 }),
      deps.h('div', { class: 'sp-body' },
        deps.h('div', { class: 'sp-top' }, deps.h('span', { class: `st ${cls}` }, label),
          p.story ? deps.h('span', { class: 'sp-badge' }, p.pages > 1 ? `${p.pages} ستوريات` : 'ستوري') : '',
          !p.story && p.pages > 1 ? deps.h('span', { class: 'sp-badge is-carousel' }, `كاروسيل · ${p.pages}`) : '', p.video ? deps.h('span', { class: 'sp-badge is-music', title: p.music || '' }, p.story ? '♪ فيديو' : '♪ ريل') : '',
          deps.h('strong', {}, p.title || tname)),
        deps.h('p', { class: 'muted small' }, `${tname} · ${when}`),
        deps.h('div', { class: 'sp-res' }, results), reviewPost(p), statsPanel(p)),
      deps.h('div', { class: 'sp-actions' }, actions));
  }));
}
async function postAct(btn, p, what) {
  if (what === 'delete' && !confirm(p.status === 'scheduled' ? 'نلغي المنشور المجدول؟' : 'نحذف المنشور من القائمة؟')) return;
  if (what === 'approve' && !confirm(Date.parse(p.scheduledAt) > Date.now() ? 'توافق على نشره بالموعد المحدد؟' : 'توافق على نشره بدورة النشر الجاية (خلال حوالي 5 دقايق)؟')) return;
  if (what === 'publish' && !confirm('ننشره هلّق؟')) return;
  btn.disabled = true;
  try {
    if (what === 'delete') { await api(`/posts/${p.id}`, { method: 'DELETE' }); state.posts = state.posts.filter((x) => x.id !== p.id); renderPosts(); deps.toast('تم'); }
    else { const { post } = await api(`/posts/${p.id}/${what}`, { method: 'POST' }); upsertPost(post); deps.toast(post.status === 'published' ? 'انتشر ✓' : STATUS[post.status]?.[0] || 'تم', post.status === 'failed'); }
  } catch (e) { deps.toast(e.message, true); btn.disabled = false; }
}

/* =================== entry points (called from admin.js) =================== */
export function initStudio(d) {
  deps = d;
  if (deps.owner) finishFacebook();
  load();
  $('studio-caption').value = state.caption;
  const count = () => { $('studio-count').textContent = `${$('studio-caption').value.length} / 2200`; };
  count();
  $('studio-caption').addEventListener('input', (e) => { state.caption = e.target.value; count(); persist(); });
  document.querySelectorAll('input[name="studio-when"]').forEach((r) => r.addEventListener('change', () => {
    if (!$('studio-at').value) $('studio-at').value = defaultLater();
    syncPublishUi();
  }));
  ['facebook', 'instagram', 'post', 'story'].forEach((k) => $(`pub-${k}`).addEventListener('change', syncPublishUi));
  $('tb-draw').addEventListener('click', () => setPen(!state.pen.on));
  $('sv-cal').addEventListener('click', () => setPostsView('cal'));
  $('sv-list').addEventListener('click', () => setPostsView('list'));
  $('st-tab-content').addEventListener('click', () => setPane('content'));
  $('st-tab-design').addEventListener('click', () => setPane('design'));
  $('tpl-reset').addEventListener('click', resetToSource);
  $('tpl-upload').addEventListener('change', (e) => { uploadReady(e.target.files[0]); e.target.value = ''; });
  $('tpl-save-new').addEventListener('click', saveNew);
  $('tpl-save').addEventListener('click', saveChanges);
  $('tpl-delete').addEventListener('click', deleteMine);
  $('studio-download').addEventListener('click', download);
  $('studio-publish').addEventListener('click', publish);
  $('studio-refresh').addEventListener('click', () => (state.conn?.up ? loadPosts() : checkConnection()));
  $('tb-undo').addEventListener('click', undo);
  $('tb-redo').addEventListener('click', redo);
  ['dup', 'up', 'down', 'center', 'del'].forEach((k) => $(`tb-${k}`).addEventListener('click', () => act(k)));

  const stage = $('studio-stage');
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  document.addEventListener('keydown', (e) => {
    if ($('tab-studio').hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); return; }
    if (e.key === 'Escape' && state.pen.on && !typing) { setPen(false); return; }
    if (!typing && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); goPage(state.page + (e.key === 'PageDown' ? 1 : -1)); return; }
    if (typing || state.sel < 0) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); act('dup'); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act('del'); return; }
    if (e.key === 'Escape') { select(-1, false); return; }
    const step = e.shiftKey ? 10 : 2;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); nudge(...mv); }
  });
  window.addEventListener('beforeunload', (e) => { if (started && dirty() && state.src.kind === 'mine') e.preventDefault(); });
}

export function showStudio() {
  loadSuggestions();
  if (started) { renderStage(); return; }
  started = true;
  renderPickers(); renderAdd(); setPane('content'); renderStage(); renderPages(); renderMusic(); autoFormats(); persist(); setPostsView(state.postsView);
  fontsReady.then(() => { renderPickers(); renderStage(); renderPages(); }); // re-fit the texts once the real fonts are in
  loadMine();
  checkConnection();
}
