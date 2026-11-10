// Beit Lahia Tech — landing page.
// Order of work: 1) paint the page from its own files (plus the last saved content, from this browser),
// 2) start the motion, 3) only after the page has loaded and the browser is idle, fetch fresh content
// from Firestore in the background and update what changed.
import { getDbLite } from './firebase-init.js';
import { DEFAULT_CONTENT, withDefaults, safeUrl, EVENT_TYPES } from './content-defaults.js';
import { LINES } from './motivation.js';

const root = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
root.classList.add('js');

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

/* ---------- tiny DOM helper (text only — never innerHTML with data) ---------- */
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((k) => k != null && el.append(k.nodeType ? k : String(k)));
  return el;
}

/* ---------- Header: solid on scroll + mobile menu ---------- */
const header = document.querySelector('.site-header');
const onScrollHeader = () => header && header.classList.toggle('is-scrolled', window.scrollY > 8);
onScrollHeader();
window.addEventListener('scroll', onScrollHeader, { passive: true });

(function mobileMenu() {
  const btn = document.getElementById('menu-btn');
  const nav = document.getElementById('site-nav');
  if (!btn || !nav) return;
  const set = (open) => {
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
    nav.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('is-open')) { set(false); btn.focus(); } });
  document.addEventListener('click', (e) => { if (!header.contains(e.target)) set(false); });
  window.matchMedia('(min-width: 861px)').addEventListener('change', () => set(false));
})();

/* ---------- Hero: the pixel strawberry assembles itself ---------- */
const GRID = ['..g..g..', '.gggggg.', 'rrrrrrrr', 'rrhrrhrr', 'rrrrrrrr', '.rrhrrr.', '.rrrrhr.', '..rrrr..', '...rr...'];
const FILL = { g: '#34D399', r: '#F43F5E', h: '#FDA4AF' };
(function heroPixels() {
  const heroLogo = document.getElementById('hero-logo');
  if (!heroLogo) return;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 236 266');
  svg.setAttribute('class', 'art-logo is-pixels');
  svg.setAttribute('aria-hidden', 'true');
  const pixels = [];
  GRID.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', x * 30); r.setAttribute('y', y * 30);
    r.setAttribute('width', 26); r.setAttribute('height', 26); r.setAttribute('rx', 5);
    r.setAttribute('fill', FILL[ch]);
    r.style.setProperty('--delay', `${y * 70 + Math.round(Math.random() * 140)}ms`);
    r.style.setProperty('--from', `${-60 - Math.round(Math.random() * 60)}px`);
    r.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 40)}deg`);
    r.dataset.i = pixels.length; // each pixel owns one motivational line
    svg.appendChild(r);
    pixels.push(r);
  }));
  heroLogo.replaceWith(svg);
  if (!reduce) setTimeout(() => {
    svg.classList.add('is-floating'); // pixels: hover transitions on
    svg.parentElement.classList.add('is-floating'); // the stage floats, so the ghost cursor moves with it
  }, 1500);
  motivationCard(svg, pixels);
})();

/* ---------- Code card: every pixel types its own motivational line ---------- */
const KEYWORDS = /\b(const|let|while|if|else|return|for|of|try|catch|await|new|function|export|default|null|Infinity|git|commit|npm|install)\b/;
function highlight(text) {
  // tokens: comment | string | keyword | function call | number/operator
  const re = /(\/\/[^\n]*)|("[^"\n]*"?)|\b([A-Za-z_$][\w$]*)\b(?=\s*\()|\b([A-Za-z_$][\w$]*)\b|(\d+%?|\+\+)/g;
  const frag = document.createDocumentFragment();
  let last = 0; let m;
  const span = (cls, s) => { const el = document.createElement('span'); el.className = cls; el.textContent = s; return el; };
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    if (m[1]) frag.append(span('c-c', m[1]));
    else if (m[2]) frag.append(span('c-s', m[2]));
    else if (m[3]) frag.append(KEYWORDS.test(m[3]) ? span('c-k', m[3]) : span('c-f', m[3]));
    else if (m[4]) frag.append(span(KEYWORDS.test(m[4]) ? 'c-k' : 'c-v', m[4]));
    else if (m[5]) frag.append(span('c-n', m[5]));
    last = re.lastIndex;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

function motivationCard(svg, pixels) {
  const out = document.getElementById('code-line');
  const card = document.getElementById('code-card');
  if (!out || !card) return;
  let typing = 0; let active = null; let pausedUntil = 0; let lastIndex = -1;

  const type = (text) => {
    const run = ++typing;
    card.classList.add('is-typing');
    if (reduce) { out.replaceChildren(highlight(text)); card.classList.remove('is-typing'); return; }
    let n = 0;
    const step = () => {
      if (run !== typing) return; // a newer line took over
      n = Math.min(text.length, n + (text[n] === ' ' ? 2 : 1));
      out.replaceChildren(highlight(text.slice(0, n)));
      if (n < text.length) setTimeout(step, 26 + Math.random() * 30);
      else card.classList.remove('is-typing');
    };
    step();
  };

  const select = (px, fromUser) => {
    const i = Number(px.dataset.i);
    if (i === lastIndex) { if (fromUser) pausedUntil = Date.now() + 9000; return; } // same pixel: don't restart
    lastIndex = i;
    if (active) active.classList.remove('is-active');
    active = px;
    px.classList.add('is-active');
    if (!reduce) { px.classList.remove('tw'); void px.getBBox(); px.classList.add('tw'); }
    type(LINES[i % LINES.length]);
    if (fromUser) pausedUntil = Date.now() + 9000; // let the person read before auto-play resumes
  };

  // the ghost cursor teaches "click a pixel" until the visitor tries it once
  const ghost = document.getElementById('ghost-cursor');
  const stage = svg.parentElement;
  let learned = false;
  const retireGhost = () => { if (learned) return; learned = true; if (ghost) ghost.classList.add('is-gone'); };

  const ghostClick = (px) => {
    const s = stage.getBoundingClientRect();
    const r = px.getBoundingClientRect();
    // the arrow's tip is ~ (5px, 2px) inside its 26px box
    ghost.style.setProperty('--x', `${r.left + r.width / 2 - s.left - 5}px`);
    ghost.style.setProperty('--y', `${r.top + r.height / 2 - s.top - 2}px`);
    ghost.classList.add('is-on');
    setTimeout(() => {
      if (learned) return;
      ghost.classList.add('is-click');
      select(px, false);
      setTimeout(() => ghost.classList.remove('is-click'), 260);
    }, 1000);
  };

  // hover on desktop, tap on touch
  svg.addEventListener('pointerover', (e) => {
    if (e.target.dataset.i && e.pointerType === 'mouse') { retireGhost(); select(e.target, true); }
  });
  svg.addEventListener('click', (e) => { if (e.target.dataset.i) { retireGhost(); select(e.target, true); } });

  if (reduce) return;
  // auto-play: every few seconds a pixel gets "clicked" (by the ghost until the visitor has tried it)
  const autoplay = () => {
    if (document.hidden || Date.now() < pausedUntil) return;
    let px;
    do { px = pixels[Math.floor(Math.random() * pixels.length)]; } while (pixels.length > 1 && Number(px.dataset.i) === lastIndex);
    if (!learned && ghost) ghostClick(px); else select(px, false);
  };
  setTimeout(() => { autoplay(); setInterval(autoplay, 4800); }, 2200);
}

/* ---------- Scroll reveal (staggered inside [data-stagger]); re-runnable for new content ---------- */
const io = !reduce && 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add('is-in');
      const d = parseFloat(el.style.getPropertyValue('--d')) || 0;
      setTimeout(() => el.classList.add('is-done'), 900 + d * 90);
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 })
  : null;

function setupReveals(scope = document) {
  scope.querySelectorAll('[data-stagger]').forEach((parent) => {
    [...parent.children].forEach((el, i) => {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      el.style.setProperty('--d', i);
    });
  });
  scope.querySelectorAll('.reveal:not([data-rv])').forEach((el) => {
    el.dataset.rv = '1';
    if (io) io.observe(el); else el.classList.add('is-in', 'is-done');
  });
}

/* ---------- Journey: the line draws itself as you scroll (refreshable) ---------- */
const journey = (function journeyLine() {
  const wrap = document.querySelector('.journey-wrap');
  if (!wrap) return { refresh() {} };
  const track = wrap.querySelector('.journey-track');
  const wide = window.matchMedia('(min-width: 861px)');
  let steps = []; let nodes = [];

  const layout = () => {
    if (!nodes.length) return;
    if (wide.matches) { track.style.top = ''; track.style.height = ''; return; }
    const box = wrap.getBoundingClientRect();
    const first = nodes[0].getBoundingClientRect();
    const last = nodes[nodes.length - 1].getBoundingClientRect();
    track.style.top = `${first.top + first.height / 2 - box.top}px`;
    track.style.height = `${last.top - first.top}px`;
  };
  let ticking = false;
  const update = () => {
    ticking = false;
    if (!steps.length) return;
    if (reduce) { wrap.style.setProperty('--p', 1); steps.forEach((s) => s.classList.add('is-on')); return; }
    const line = window.innerHeight * 0.62;
    const r = (wide.matches ? wrap : track).getBoundingClientRect();
    let p = wide.matches ? (line - r.top) / (r.height * 0.9) : (line - r.top) / Math.max(r.height, 1);
    p = Math.min(1, Math.max(0, p));
    wrap.style.setProperty('--p', p.toFixed(4));
    steps.forEach((s, i) => {
      const on = wide.matches
        ? p > 0 && p >= i / Math.max(steps.length - 1, 1) - 0.001
        : nodes[i].getBoundingClientRect().top + nodes[i].offsetHeight / 2 <= line;
      s.classList.toggle('is-on', on);
    });
  };
  const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  const refresh = () => {
    steps = [...wrap.querySelectorAll('.jstep')];
    nodes = steps.map((s) => s.querySelector('.jnode'));
    layout(); update();
  };
  if (!reduce) {
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', () => { layout(); request(); });
  }
  if (document.fonts) document.fonts.ready.then(() => { layout(); request(); }); // fonts swap in late now
  return { refresh };
})();

/* ---------- Live content (edited from /admin) ---------- */
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
const pad = (n) => String(n).padStart(2, '0');
const dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

function renderContent(c) {
  document.querySelectorAll('[data-c]').forEach((el) => {
    const v = get(c, el.dataset.c);
    if (typeof v === 'string' && v.trim() && el.textContent !== v) el.textContent = v;
  });

  // goals: keep the six icons from the static markup and reuse them in order
  const goals = document.getElementById('goals-grid');
  if (goals && c.goals.length) {
    const icons = [...goals.querySelectorAll('.card-icon')].map((n) => n.cloneNode(true));
    goals.replaceChildren(...c.goals.map((g, i) => h('article', { class: 'card' },
      icons.length ? icons[i % icons.length].cloneNode(true) : null,
      h('h3', {}, g.title), h('p', {}, g.text))));
  }
  const list = document.getElementById('journey-list');
  if (list && c.journey.length) {
    list.replaceChildren(...c.journey.map((s, i, all) => h('li', { class: i === all.length - 1 ? 'jstep jstep-last' : 'jstep' },
      h('span', { class: 'jnode', 'aria-hidden': 'true' }, h('i')),
      h('span', { class: 'stage' }, pad(i + 1)), h('h3', {}, s.title), h('p', {}, s.text))));
  }
  const fields = document.getElementById('fields-list');
  if (fields && c.fields.length) fields.replaceChildren(...c.fields.filter(Boolean).map((t) => h('li', {}, t)));
  const faq = document.getElementById('faq-list');
  if (faq && c.faq.length) faq.replaceChildren(...c.faq.map((f) => h('details', {}, h('summary', {}, f.q), h('p', {}, f.a))));
}

// Upcoming first (soonest on top), announcements without a date after them; past events are hidden.
function sortEvents(events) {
  const t = today();
  return events
    .filter((e) => !e.date || e.date >= t)
    .sort((a, b) => {
      if (a.date && b.date) return a.date.localeCompare(b.date);
      if (a.date) return -1;
      if (b.date) return 1;
      return (b.ts || 0) - (a.ts || 0);
    });
}

function renderEvents(events) {
  const section = document.getElementById('events');
  const grid = document.getElementById('events-grid');
  const nav = document.getElementById('nav-events');
  if (!section || !grid) return;
  const list = sortEvents(events);
  section.hidden = !list.length;
  if (nav) nav.hidden = !list.length;
  if (!list.length) return;
  grid.setAttribute('data-stagger', '');
  grid.replaceChildren(...list.map((e) => {
    const link = safeUrl(e.link);
    let when = '';
    if (e.date) { const d = new Date(`${e.date}T12:00:00`); if (!isNaN(d)) when = dateFmt.format(d); }
    return h('article', { class: `event-card type-${EVENT_TYPES[e.type] ? e.type : 'event'}` },
      h('div', { class: 'event-meta' },
        h('span', { class: 'event-type' }, EVENT_TYPES[e.type] || EVENT_TYPES.event),
        when ? h('time', { datetime: e.date }, when) : null),
      h('h3', {}, e.title),
      e.place ? h('p', { class: 'event-place' }, e.place) : null,
      e.description ? h('p', { class: 'event-desc' }, e.description) : null,
      link ? h('a', { class: 'event-link', href: link, target: '_blank', rel: 'noopener noreferrer' }, 'التفاصيل') : null);
  }));
}

// The eyebrow above the headline follows the registration switch in /admin › الإعدادات.
function renderSettings(s, content) {
  const eyebrow = document.querySelector('[data-c="hero.eyebrow"]');
  if (eyebrow) {
    const open = !s || s.registrationOpen !== false;
    const text = open ? (content?.hero?.eyebrow || DEFAULT_CONTENT.hero.eyebrow) : 'التسجيل مسكّر حالياً';
    if (eyebrow.textContent !== text) eyebrow.textContent = text;
    eyebrow.closest('.eyebrow')?.classList.toggle('is-closed', !open);
  }
  const contact = document.getElementById('footer-contact');
  const wa = s && typeof s.contactWhatsapp === 'string' && /^\+\d{8,15}$/.test(s.contactWhatsapp) ? s.contactWhatsapp : '';
  if (contact) {
    contact.hidden = !wa;
    if (wa) contact.href = `https://wa.me/${wa.slice(1)}`;
  }
}

/* ---------- Gallery (hidden until the admin publishes photos) ---------- */
let photos = [];
let lbIndex = 0;

function renderGallery(list) {
  const section = document.getElementById('gallery');
  const grid = document.getElementById('gallery-grid');
  if (!section || !grid || !list.length) return;
  photos = list;
  grid.setAttribute('data-stagger', '');
  grid.replaceChildren(...list.map((p, i) => h('button', {
    type: 'button', class: 'gallery-item', 'aria-label': p.caption ? `عرض الصورة: ${p.caption}` : `عرض الصورة ${i + 1}`,
  }, h('img', { src: p.thumb, alt: p.caption || '', loading: 'lazy', decoding: 'async', width: p.w || null, height: p.h || null }),
  p.caption ? h('span', { class: 'gallery-cap' }, p.caption) : null)));
  grid.querySelectorAll('.gallery-item').forEach((b, i) => b.addEventListener('click', () => openLightbox(i)));
  section.hidden = false;
  const nav = document.getElementById('nav-gallery');
  if (nav) nav.hidden = false;
}

const lb = document.getElementById('lightbox');
async function showPhoto(i) {
  lbIndex = (i + photos.length) % photos.length;
  const p = photos[lbIndex];
  const img = document.getElementById('lb-img');
  img.src = p.thumb; // instant preview, then swap in the full-size image
  img.alt = p.caption || '';
  document.getElementById('lb-caption').textContent = p.caption || '';
  document.getElementById('lb-count').textContent = `${lbIndex + 1} / ${photos.length}`;
  lb.classList.toggle('is-single', photos.length < 2);
  try {
    const { db, fs } = await getDbLite();
    const snap = await fs.getDoc(fs.doc(db, 'galleryFull', p.id));
    if (snap.exists() && photos[lbIndex] === p) img.src = snap.data().src;
  } catch { /* keep the preview */ }
}
function openLightbox(i) {
  if (!lb || !photos.length) return;
  showPhoto(i);
  lb.showModal();
}
if (lb) {
  lb.addEventListener('click', (e) => {
    const act = e.target.closest('[data-lb]')?.dataset.lb;
    if (act === 'close' || e.target === lb) lb.close();
    else if (act === 'next') showPhoto(lbIndex + 1);
    else if (act === 'prev') showPhoto(lbIndex - 1);
  });
  lb.addEventListener('keydown', (e) => {
    // RTL: the left arrow moves forward
    if (e.key === 'ArrowLeft') { e.preventDefault(); showPhoto(lbIndex + 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); showPhoto(lbIndex - 1); }
  });
  let x0 = null;
  lb.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) > 50) showPhoto(lbIndex + (dx > 0 ? 1 : -1)); // RTL: swipe right = next
  });
}

/* ---------- Putting live data on the page ---------- */
const CACHE_KEY = 'blt-live-v1';
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch { return null; } };
const writeCache = (v) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(v)); } catch { /* private mode / full */ } };

function applyLive(live) {
  const content = live.content ? withDefaults(live.content) : null;
  if (content) renderContent(content);
  renderEvents(live.events || []);
  renderSettings(live.settings || null, content);
}

async function fetchLive() {
  const { db, fs } = await getDbLite();
  const [contentSnap, settingsSnap, eventsSnap, gallerySnap] = await Promise.all([
    fs.getDoc(fs.doc(db, 'site', 'content')).catch(() => null),
    fs.getDoc(fs.doc(db, 'site', 'settings')).catch(() => null),
    fs.getDocs(fs.query(fs.collection(db, 'events'), fs.where('published', '==', true))).catch(() => null),
    fs.getDocs(fs.query(fs.collection(db, 'gallery'), fs.where('published', '==', true))).catch(() => null),
  ]);
  const plain = (snap) => {
    if (!snap || !snap.exists()) return null;
    const { updatedAt, createdAt, ...rest } = snap.data();
    return rest;
  };
  const live = {
    content: plain(contentSnap),
    settings: plain(settingsSnap),
    events: eventsSnap ? eventsSnap.docs.map((d) => {
      const e = d.data();
      return { type: e.type, title: e.title, date: e.date || '', place: e.place || '', description: e.description || '', link: e.link || '', ts: e.createdAt?.toMillis?.() || 0 };
    }) : [],
  };
  const gallery = gallerySnap ? gallerySnap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)) : [];
  return { live, gallery };
}

// 1) last-known content from this browser: shows instantly, no network
const cached = readCache();
if (cached) applyLive(cached);

// 2) motion starts right away on whatever is on the page
setupReveals();
journey.refresh();

// 3) fresh data, only once the page is fully loaded and the browser is idle
const whenIdle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2500 }) : setTimeout(fn, 200));
const afterLoad = (fn) => (document.readyState === 'complete' ? whenIdle(fn) : window.addEventListener('load', () => whenIdle(fn), { once: true }));
afterLoad(async () => {
  try {
    const { live, gallery } = await fetchLive();
    if (JSON.stringify(live) !== JSON.stringify(cached)) {
      applyLive(live);
      writeCache(live);
    }
    renderGallery(gallery);
    setupReveals();
    journey.refresh();
  } catch (e) {
    console.warn('[content]', e); // the static page is already complete
  }
});
