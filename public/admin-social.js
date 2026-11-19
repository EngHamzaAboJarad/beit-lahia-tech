// Admin › «استوديو السوشيال»: a small design editor for the social templates.
// Pick a template (built-in or saved), edit its texts, or switch to «التصميم» to select elements on the
// canvas, drag / resize them, change their properties, add or delete elements, and save the result as a
// template of your own (Firestore › socialTemplates). Then download it (PNG) or publish it to
// Facebook / Instagram now or later through the social Worker (social-worker/ in the repo).
import {
  BUILTIN, TYPES, ART, LINE_ICONS, MOSAICS, SIZES, BRAND_COLORS, SOCIAL_ICON_KEYS, FONT_URL, DEFAULT_PHOTO,
  renderDesign, moveElement, scaleElement, newElement, labelOf,
} from './social-templates.js';
import { SOCIAL_PLATFORMS } from './content-defaults.js';

const $ = (id) => document.getElementById(id);
const WORKER = (() => { try { return localStorage.getItem('blt-social-worker') || ''; } catch { return ''; } })() || 'https://social.beitlahia.tech';
const STORE = 'blt-studio-v2';
const SVGNS = 'http://www.w3.org/2000/svg';
const PHOTOS = [['/img/beit-lahia-night.jpg', 'بيت لاهيا بالليل'], ['/img/beit-lahia-fields.jpg', 'حقول الفراولة']];
const STATUS = {
  scheduled: ['مجدول', 'st-scheduled'], publishing: ['عم ينتشر', 'st-publishing'], published: ['انتشر', 'st-published'],
  partial: ['انتشر جزئياً', 'st-partial'], failed: ['فشل', 'st-failed'],
};
const PLATFORM_NAME = { facebook: 'فيسبوك', instagram: 'إنستغرام' };
const whenFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const clone = (o) => JSON.parse(JSON.stringify(o));

let deps; // { h, toast, setBusy, getToken, db, fs, user }
let started = false;
const state = {
  src: { kind: 'builtin', id: BUILTIN[0].id }, // where the working design came from
  base: '',            // JSON of the source, to know if there are unsaved changes
  design: clone(BUILTIN[0]),
  sel: -1, pane: 'content',
  undo: [], redo: [],
  mine: [], caption: '', conn: null, posts: [],
};

/* =================== persistence (the working design survives a reload) =================== */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && s.design && Array.isArray(s.design.els)) {
      state.src = s.src; state.design = s.design; state.base = s.base || ''; state.caption = s.caption || '';
      return;
    }
  } catch { /* fresh start */ }
  state.base = JSON.stringify(state.design);
}
let saveT;
function persist() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ src: state.src, design: state.design, base: state.base, caption: state.caption })); } catch { /* too big / private */ }
  }, 300);
  $('studio-dirty').hidden = !dirty();
}
const dirty = () => JSON.stringify(state.design) !== state.base;

/* =================== history =================== */
let lastCheck = 0;
function checkpoint(force = false) {
  const now = Date.now();
  if (!force && now - lastCheck < 700) return; // typing in one field = one undo step
  lastCheck = now;
  state.undo.push(JSON.stringify(state.design));
  if (state.undo.length > 60) state.undo.shift();
  state.redo = [];
}
function undo() {
  if (!state.undo.length) return;
  state.redo.push(JSON.stringify(state.design));
  state.design = JSON.parse(state.undo.pop());
  if (state.sel >= state.design.els.length) state.sel = -1;
  lastCheck = 0; refreshAll();
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(JSON.stringify(state.design));
  state.design = JSON.parse(state.redo.pop());
  if (state.sel >= state.design.els.length) state.sel = -1;
  lastCheck = 0; refreshAll();
}

/* =================== text measuring with the real fonts =================== */
const mctx = document.createElement('canvas').getContext('2d');
const measure = (text, px, weight, family) => { mctx.font = `${weight} ${px}px ${family}`; return mctx.measureText(text).width; };
const fontsReady = Promise.all(['400', '600', '700', '800'].flatMap((w) => [`${w} 40px Cairo`, `${w} 40px Montserrat`]).map((f) => document.fonts.load(f, 'ابت abc'))).catch(() => {});

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
  if (kind === 'mine') { const m = state.mine.find((x) => x.id === id); return m && clone(m.design); }
  const b = BUILTIN.find((x) => x.id === id); return b && clone(b);
}
function openDesign(kind, id) {
  if (kind === state.src.kind && id === state.src.id) return;
  if (dirty() && !confirm('عندك تعديلات على القالب الحالي ما انحفظت. تفتح قالب تاني وتتركها؟')) return;
  const d = sourceDesign(kind, id);
  if (!d) return;
  state.src = { kind, id }; state.design = d; state.base = JSON.stringify(d);
  state.sel = -1; state.undo = []; state.redo = [];
  refreshAll(); renderPickers();
}

/* =================== content pane: quick text editing =================== */
function renderContent() {
  const els = state.design.els;
  const rows = els.map((e, i) => [e, i]).filter(([e]) => e.type === 'text' || e.type === 'button');
  if (!rows.length) { $('tpl-fields').replaceChildren(deps.h('p', { class: 'muted small' }, 'ما في نصوص بهالقالب. ضيف نص من «التصميم».')); return; }
  $('tpl-fields').replaceChildren(...rows.map(([e, i], k) => {
    const id = `sc-${i}`;
    const multi = String(e.text || '').includes('\n') || e.type === 'text' && (e.size || 0) >= 90;
    const input = deps.h(multi ? 'textarea' : 'input', {
      id, rows: multi ? 2 : null, type: multi ? null : 'text', value: e.text ?? '', dir: e.font === 'en' ? 'ltr' : 'auto',
      onfocus: () => select(i, false),
      oninput: (ev) => { checkpoint(); e.text = ev.target.value; renderStage(); persist(); },
    });
    const label = `${e.type === 'button' ? 'زر' : 'نص'} ${k + 1}${e.hidden ? ' (مخفي)' : ''}`;
    return deps.h('div', { class: 'field' }, deps.h('label', { for: id }, label), input);
  }));
}

/* =================== the canvas =================== */
let stageSvg = null;
function renderStage() {
  const stage = $('studio-stage');
  stage.innerHTML = renderDesign(state.design, { measure }); // escaped renderer output
  stageSvg = stage.querySelector('svg');
  stage.classList.toggle('is-tall', state.design.h > state.design.w * 1.4);
  $('studio-size').textContent = `${state.design.w} × ${state.design.h} بكسل · ${state.design.els.length} عنصر`;
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
  }
  stageSvg.append(ui);
}
function svgEl(tag, attrs) { const el = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); return el; }
function toSvg(ev) {
  const pt = stageSvg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
  return pt.matrixTransform(stageSvg.getScreenCTM().inverse());
}

// drag = move · corner handle = resize (keeps the element's top-left corner where it was)
let drag = null;
function onDown(ev) {
  if (!stageSvg || ev.button > 0) return;
  const handle = ev.target.closest('.sel-handle');
  const g = ev.target.closest('[data-i]');
  if (!handle && !g) { select(-1); return; }
  const i = handle ? state.sel : +g.dataset.i;
  if (i !== state.sel) select(i);
  const p = toSvg(ev); const b = bboxOf(i);
  if (!b) return;
  drag = { i, mode: handle ? 'resize' : 'move', p0: p, el0: clone(state.design.els[i]), b0: { x: b.x, y: b.y, width: b.width, height: b.height }, moved: false };
  $('studio-stage').setPointerCapture(ev.pointerId);
  ev.preventDefault();
}
let dragRaf = 0; let pending = null;
function onMove(ev) {
  if (!drag) return;
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
    if (drag.mode === 'move') {
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
  cancelAnimationFrame(dragRaf);
  applyDrag(); // a fast release must not drop the last movement
  const moved = drag.moved; drag = null;
  if (moved) { persist(); renderProps(); renderLayers(); drawSelection(); }
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

function propControl(e, [key, kind, label]) {
  const set = (v) => { checkpoint(); e[key] = v; renderStage(); persist(); if (key === 'text' || key === 'art' || key === 'icon') renderLayers(); };
  switch (kind) {
    case 'textarea': {
      const id = `pt-${++uid}`;
      return deps.h('div', { class: 'field span-2' }, deps.h('label', { for: id }, label),
        deps.h('textarea', { id, rows: 2, value: e[key] ?? '', dir: e.font === 'en' ? 'ltr' : 'auto', oninput: (ev) => set(ev.target.value) }));
    }
    case 'number': return numberField(label, e[key], set);
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

function renderAdd() {
  $('el-add').replaceChildren(...Object.entries(TYPES).map(([k, t]) => deps.h('button', {
    type: 'button', class: 'btn btn-ghost-dark btn-sm',
    onclick: () => { checkpoint(true); state.design.els.push(newElement(k, state.design)); state.sel = state.design.els.length - 1; refreshAll(); },
  }, `+ ${t.name}`)));
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
    selectField('المقاس', sizeKey, Object.entries(SIZES).map(([k, [w, h, n]]) => [k, `${n} (${w}×${h})`]), (k) => {
      checkpoint(true); const [w, h] = SIZES[k]; d.w = w; d.h = h; renderStage(); persist();
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

/* =================== export: SVG → canvas, fonts + images embedded =================== */
let fontCssP;
function fontCss() {
  fontCssP = fontCssP || (async () => {
    let css = await (await fetch(FONT_URL)).text();
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    const data = await Promise.all(urls.map(async (u) => [u, await toDataUrl(u)]));
    data.forEach(([u, d]) => { css = css.split(u).join(d); });
    return css;
  })().catch((e) => { fontCssP = null; throw e; });
  return fontCssP;
}
async function toDataUrl(src) {
  if (!src || src.startsWith('data:')) return src;
  const blob = await (await fetch(src)).blob();
  return new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
}
async function rasterize(type = 'image/png', quality) {
  const d = state.design;
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
    return await new Promise((resolve) => c.toBlob(resolve, type, quality));
  } finally { URL.revokeObjectURL(url); }
}
const blobToBase64 = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
const slug = () => (state.src.kind === 'builtin' ? state.src.id : 'custom');

async function download() {
  const btn = $('studio-download');
  deps.setBusy(btn, true);
  try {
    const blob = await rasterize('image/png');
    const a = deps.h('a', { href: URL.createObjectURL(blob), download: `beitlahia-${slug()}-${new Date().toISOString().slice(0, 10)}.png` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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
  const json = JSON.stringify({ ...state.design, name });
  if (json.length > 900000) throw new Error('القالب كبير كتير (غالباً صورة مرفوعة). صغّر الصورة أو استخدم صور بيت لاهيا الجاهزة.');
  return { name, design: json, updatedAt: deps.fs.serverTimestamp(), updatedBy: deps.user()?.email || '' };
}
async function saveNew() {
  if (!deps.db) { deps.toast('الحفظ بيحتاج تسجيل دخول', true); return; }
  const name = (prompt('اسم القالب الجديد؟', `${state.design.name} (نسخة)`) || '').trim().slice(0, 60);
  if (!name) return;
  const btn = $('tpl-save-new'); deps.setBusy(btn, true);
  try {
    const ref = await deps.fs.addDoc(deps.fs.collection(deps.db, 'socialTemplates'), payload(name));
    state.design.name = name;
    state.mine.unshift({ id: ref.id, name, design: clone(state.design), at: Date.now() });
    state.src = { kind: 'mine', id: ref.id }; state.base = JSON.stringify(state.design);
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
    m.design = clone(state.design); m.design.name = m.name;
    state.base = JSON.stringify(state.design);
    renderPickers(); persist(); deps.toast('انحفظت التعديلات ✓');
  } catch (e) { deps.toast(e.message?.startsWith('القالب') ? e.message : 'ما زبط الحفظ', true); } finally { deps.setBusy(btn, false); }
}
async function deleteMine() {
  const m = state.mine.find((x) => x.id === state.src.id);
  if (!m || !confirm(`نحذف القالب «${m.name}»؟ ما بيرجع.`)) return;
  try {
    await deps.fs.deleteDoc(deps.fs.doc(deps.db, 'socialTemplates', m.id));
    state.mine = state.mine.filter((x) => x.id !== m.id);
    state.design = clone(BUILTIN[0]); state.base = JSON.stringify(state.design); state.src = { kind: 'builtin', id: BUILTIN[0].id };
    state.sel = -1; state.undo = []; state.redo = [];
    refreshAll(); renderPickers(); deps.toast('انحذف');
  } catch { deps.toast('ما زبط الحذف', true); }
}
function resetToSource() {
  const d = sourceDesign(state.src.kind, state.src.id);
  if (!d || !dirty()) return;
  if (!confirm('نرجّع القالب زي ما كان ونلغي التعديلات؟')) return;
  checkpoint(true); state.design = d; state.sel = -1; refreshAll();
}

/* =================== the publishing service =================== */
async function api(path, opts = {}) {
  const token = await deps.getToken();
  const res = await fetch(WORKER + path, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'خدمة النشر ما ردّت صح');
  return data;
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
  if (deps.owner) renderConnect();
}

/* =================== connecting Facebook / Instagram (owner only) =================== */
const SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management';
const cn = { status: null, pages: null, form: false, loading: false };
const dayFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });

async function loadConnect() {
  try { cn.status = await api('/connect'); } catch (e) { cn.status = { error: e.message }; }
  renderConnect();
}
function copyBtn(text, label = 'نسخ') {
  return deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(text); deps.toast('انسخ ✓'); } catch { deps.toast('انسخه يدوي', true); } } }, label);
}
function metaGuide(open) {
  const li = (...k) => deps.h('li', {}, ...k);
  const a = (href, t) => deps.h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, t);
  return deps.h('details', { class: 'meta-guide', open },
    deps.h('summary', {}, 'شو بدك تجهّز من ميتا؟ (مرة وحدة، 5 دقايق)'),
    deps.h('ol', {},
      li('تأكد إنه حساب الإنستغرام ', deps.h('strong', {}, 'Business أو Creator'), ' ومربوط بصفحة الفيسبوك (من إعدادات الصفحة › الحسابات المرتبطة).'),
      li('افتح ', a('https://developers.facebook.com/apps/', 'developers.facebook.com/apps'), ' › Create App › اختار حالة الاستخدام «إدارة كل شي على صفحتك» (أو نوع Business) وكمّل.'),
      li('من التطبيق › App settings › Basic: انسخ ', deps.h('strong', {}, 'App ID'), ' و', deps.h('strong', {}, 'App Secret'), ' (اضغط Show).'),
      li('افتح ', a('https://developers.facebook.com/tools/explorer/', 'Graph API Explorer'), '، اختار تطبيقك فوق، وبـ «User or Page» خليها User Token، وضيف هالصلاحيات:',
        deps.h('div', { class: 'scope-row' }, deps.h('code', { dir: 'ltr' }, SCOPES), copyBtn(SCOPES))),
      li('اضغط ', deps.h('strong', {}, 'Generate Access Token'), '، ووافق واختار صفحة المجتمع وحساب الإنستغرام. انسخ التوكن اللي بيطلع والصقه تحت.'),
    ));
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
    if (st.missingScopes?.length) parts.push(deps.h('p', { class: 'conn-warn' }, `ناقص صلاحيات: ${st.missingScopes.join('، ')}. اعمل توكن جديد فيه كل الصلاحيات واضغط «ربط من جديد».`));
    if (st.check) parts.push(deps.h('p', { class: st.check.ok ? 'conn-ok' : 'conn-err' }, st.check.ok ? `✓ الاتصال شغّال مع «${st.check.name}»` : `✗ ${st.check.error}`));
    parts.push(deps.h('div', { class: 'acc-actions' },
      deps.h('button', { type: 'button', class: 'btn btn-primary btn-sm', onclick: (e) => connectAct(e.currentTarget, 'test') }, deps.h('span', { class: 'btn-label' }, 'اختبار الاتصال'), deps.h('span', { class: 'spinner', 'aria-hidden': 'true' })),
      deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => { cn.form = true; cn.pages = null; renderConnect(); } }, 'ربط من جديد / صفحة ثانية'),
      deps.h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: (e) => connectAct(e.currentTarget, 'disconnect') }, 'فصل الحسابات')));
    box.replaceChildren(...parts);
    return;
  }

  // the form: credentials → pages → choose one
  parts.push(metaGuide(!st.connected));
  if (!cn.pages) {
    const f = deps.h('form', { class: 'cn-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); fetchPages(f); } },
      deps.h('div', { class: 'acc-fields' },
        deps.h('div', { class: 'field' }, deps.h('label', { for: 'cn-app' }, 'App ID'), deps.h('input', { id: 'cn-app', name: 'appId', dir: 'ltr', inputmode: 'numeric', autocomplete: 'off', placeholder: '1234567890' })),
        deps.h('div', { class: 'field' }, deps.h('label', { for: 'cn-secret' }, 'App Secret'), deps.h('input', { id: 'cn-secret', name: 'appSecret', type: 'password', dir: 'ltr', autocomplete: 'off', placeholder: '••••••••' }))),
      deps.h('div', { class: 'field' }, deps.h('label', { for: 'cn-token' }, 'التوكن من Graph API Explorer'),
        deps.h('textarea', { id: 'cn-token', name: 'userToken', rows: 3, dir: 'ltr', autocomplete: 'off', placeholder: 'EAAB…' })),
      deps.h('p', { class: 'muted small' }, 'هالمعلومات بتروح لخدمة النشر بس وبتنحفظ فيها، وما بترجع للمتصفح. التوكن بيتحوّل لتوكن صفحة ما بينتهي.'),
      deps.h('div', { class: 'acc-actions' },
        deps.h('button', { type: 'submit', class: 'btn btn-primary' }, deps.h('span', { class: 'btn-label' }, 'جيب صفحاتي'), deps.h('span', { class: 'spinner', 'aria-hidden': 'true' })),
        st.connected ? deps.h('button', { type: 'button', class: 'btn btn-ghost-dark', onclick: () => { cn.form = false; renderConnect(); } }, 'إلغاء') : ''));
    parts.push(f);
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

async function fetchPages(form) {
  const btn = form.querySelector('[type="submit"]');
  const body = { appId: form.appId.value.trim(), appSecret: form.appSecret.value.trim(), userToken: form.userToken.value.trim() };
  if (!body.appId || !body.appSecret || !body.userToken) { deps.toast('عبّي الثلاث خانات', true); return; }
  deps.setBusy(btn, true);
  try {
    cn.pages = (await api('/connect/pages', { method: 'POST', body: JSON.stringify(body) })).pages;
    renderConnect();
  } catch (e) { deps.toast(e.message, true); deps.setBusy(btn, false); }
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
function syncPublishUi() {
  const later = document.querySelector('input[name="studio-when"]:checked')?.value === 'later';
  $('studio-at').hidden = !later;
  deps.setBusy($('studio-publish'), false, later ? 'جدول المنشور' : 'انشر الآن');
  const c = state.conn || {};
  ['facebook', 'instagram'].forEach((k) => {
    const box = $(`pub-${k}`);
    box.disabled = !c[k];
    box.closest('label').title = c[k] ? '' : `${PLATFORM_NAME[k]} مش مربوط لسا`;
  });
  $('studio-publish').disabled = !['facebook', 'instagram'].some((k) => c[k] && $(`pub-${k}`).checked);
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
  const d = state.design;
  const story = d.h / d.w > 1.6;
  const verb = later ? `يتجدول على ${whenFmt.format(new Date(scheduledAt))}` : 'ينتشر هلّق';
  if (!confirm(`المنشور «${d.name}» رح ${verb} على ${platforms.map((p) => PLATFORM_NAME[p]).join(' و')}${story && platforms.includes('instagram') ? ' (على إنستغرام كستوري)' : ''}. أكمل؟`)) return;
  const btn = $('studio-publish');
  deps.setBusy(btn, true);
  try {
    const jpeg = await rasterize('image/jpeg', 0.92);
    const title = d.els.filter((e) => (e.type === 'text' || e.type === 'button') && !e.hidden && String(e.text || '').trim())
      .map((e) => String(e.text).replace(/\n/g, ' ')).slice(0, 2).join(' · ') || d.name;
    const { post } = await api('/posts', { method: 'POST', body: JSON.stringify({ image: await blobToBase64(jpeg), caption: $('studio-caption').value, platforms, scheduledAt, template: slug(), title, story }) });
    const [label] = STATUS[post.status] || ['تم'];
    deps.toast(post.status === 'scheduled' ? 'تمت الجدولة ✓' : post.status === 'published' ? 'انتشر ✓' : `${label}: شوف التفاصيل بالقائمة`, post.status === 'failed');
    upsertPost(post);
  } catch (e) {
    deps.toast(e.message || 'ما زبط النشر', true);
  } finally { deps.setBusy(btn, false); syncPublishUi(); }
}

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
  $('studio-empty').hidden = state.posts.length > 0;
  list.replaceChildren(...state.posts.map((p) => {
    const [label, cls] = STATUS[p.status] || [p.status, ''];
    const tname = BUILTIN.find((t) => t.id === p.template)?.name || 'قالب خاص';
    const when = p.status === 'scheduled' ? `موعده: ${whenFmt.format(new Date(p.scheduledAt))}`
      : p.publishedAt ? `انتشر: ${whenFmt.format(new Date(p.publishedAt))}` : `انعمل: ${whenFmt.format(new Date(p.createdAt))}`;
    const results = p.platforms.map((k) => {
      const r = p.results?.[k] || {};
      const href = k === 'facebook' && r.id ? `https://www.facebook.com/${r.id}` : r.permalink || '';
      const txt = r.id ? `${PLATFORM_NAME[k]} ✓` : r.error ? `${PLATFORM_NAME[k]}: ${r.error}` : PLATFORM_NAME[k];
      return href ? deps.h('a', { class: 'res ok', href, target: '_blank', rel: 'noopener noreferrer' }, txt)
        : deps.h('span', { class: `res ${r.error ? 'err' : ''}` }, txt);
    });
    const actions = [];
    if (['scheduled', 'failed', 'partial'].includes(p.status)) {
      actions.push(deps.h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: (e) => postAct(e.currentTarget, p, 'publish') }, p.status === 'scheduled' ? 'انشر الآن' : 'جرّب كمان مرة'));
    }
    if (['scheduled', 'failed'].includes(p.status)) {
      actions.push(deps.h('button', { type: 'button', class: 'btn btn-danger btn-sm', onclick: (e) => postAct(e.currentTarget, p, 'delete') }, p.status === 'scheduled' ? 'إلغاء' : 'حذف'));
    }
    return deps.h('li', { class: 'studio-post' },
      deps.h('img', { src: `${WORKER}/img/${p.id}.jpg`, alt: '', loading: 'lazy', width: 64, height: 80 }),
      deps.h('div', { class: 'sp-body' },
        deps.h('div', { class: 'sp-top' }, deps.h('span', { class: `st ${cls}` }, label), deps.h('strong', {}, p.title || tname)),
        deps.h('p', { class: 'muted small' }, `${tname} · ${when}`),
        deps.h('div', { class: 'sp-res' }, results)),
      deps.h('div', { class: 'sp-actions' }, actions));
  }));
}
async function postAct(btn, p, what) {
  if (what === 'delete' && !confirm(p.status === 'scheduled' ? 'نلغي المنشور المجدول؟' : 'نحذف المنشور من القائمة؟')) return;
  if (what === 'publish' && !confirm('ننشره هلّق؟')) return;
  btn.disabled = true;
  try {
    if (what === 'delete') { await api(`/posts/${p.id}`, { method: 'DELETE' }); state.posts = state.posts.filter((x) => x.id !== p.id); renderPosts(); deps.toast('تم'); }
    else { const { post } = await api(`/posts/${p.id}/publish`, { method: 'POST' }); upsertPost(post); deps.toast(post.status === 'published' ? 'انتشر ✓' : STATUS[post.status]?.[0] || 'تم', post.status === 'failed'); }
  } catch (e) { deps.toast(e.message, true); btn.disabled = false; }
}

/* =================== entry points (called from admin.js) =================== */
export function initStudio(d) {
  deps = d;
  load();
  $('studio-caption').value = state.caption;
  const count = () => { $('studio-count').textContent = `${$('studio-caption').value.length} / 2200`; };
  count();
  $('studio-caption').addEventListener('input', (e) => { state.caption = e.target.value; count(); persist(); });
  document.querySelectorAll('input[name="studio-when"]').forEach((r) => r.addEventListener('change', () => {
    if (!$('studio-at').value) $('studio-at').value = defaultLater();
    syncPublishUi();
  }));
  ['facebook', 'instagram'].forEach((k) => $(`pub-${k}`).addEventListener('change', syncPublishUi));
  $('st-tab-content').addEventListener('click', () => setPane('content'));
  $('st-tab-design').addEventListener('click', () => setPane('design'));
  $('tpl-reset').addEventListener('click', resetToSource);
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
  if (started) { renderStage(); return; }
  started = true;
  renderPickers(); renderAdd(); setPane('content'); renderStage(); syncPublishUi(); persist();
  fontsReady.then(() => { renderPickers(); renderStage(); }); // re-fit the texts once the real fonts are in
  loadMine();
  checkConnection();
}
