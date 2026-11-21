// The photo gallery, shared by the home page section and /gallery.
// Photos come in albums: each album is a stack of cards; a stack opens on all its photos (#album-view),
// and a photo opens the lightbox (#lightbox), which walks through that album.
// Firestore: gallery/{id} (thumb, caption, album, albumDesc, published, order) + galleryFull/{id} (full image).
// albumDesc is the album's description («وصف البوست»): the same on every photo of it.
import { getDbLite } from './firebase-init.js';
import { h } from './blog-ui.js';

let photos = []; // the album the lightbox walks through
let lbIndex = 0;
const ALBUM_NONE = 'صور متنوعة';
export const photoCount = (n) => (n === 1 ? 'صورة وحدة' : n === 2 ? 'صورتين' : n <= 10 ? `${n} صور` : `${n} صورة`);
const SVGNS = 'http://www.w3.org/2000/svg';
// the shape of an album = its cover's (the studio frames are 16:9, 4:5…), so no edge of the picture is cut
const ratioOf = (p) => { const r = p && p.w > 0 && p.h > 0 ? p.w / p.h : 4 / 3; return Math.min(1.9, Math.max(0.75, r)).toFixed(4); };
function stackIcon() {
  const s = document.createElementNS(SVGNS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="7" y="7" width="13" height="13" rx="2"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>'; // fixed markup, no data
  return s;
}

/** the published photos, in the admin's order */
export async function fetchGallery(db, fs) {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'gallery'), fs.where('published', '==', true)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export function albumsOf(list) {
  const map = new Map();
  list.forEach((p) => { const k = String(p.album || '').trim(); if (!map.has(k)) map.set(k, []); map.get(k).push(p); });
  return [...map].map(([name, items]) => ({ name: name || ALBUM_NONE, photos: items, desc: String(items.find((p) => p.albumDesc)?.albumDesc || '').trim() }));
}

/** the albums as stacks of cards into `grid`; returns how many albums */
export function renderAlbums(grid, list) {
  const albums = albumsOf(list);
  grid.setAttribute('data-stagger', '');
  grid.replaceChildren(...albums.map((a) => {
    // three cards: the cover in front, the next photos (or brand-coloured cards) behind it
    const layers = [0, 1, 2].map((k) => {
      const p = a.photos[k];
      return p ? h('img', { class: `album-layer l${k}`, src: p.thumb, alt: '', loading: 'lazy', decoding: 'async' })
        : h('span', { class: `album-layer l${k} is-blank` });
    }).reverse();
    const badge = h('span', { class: 'album-badge' }, stackIcon(), String(a.photos.length));
    const card = h('button', { type: 'button', class: 'album-card', 'aria-label': `افتح ألبوم ${a.name}: ${photoCount(a.photos.length)}` },
      h('span', { class: 'album-stack', 'aria-hidden': 'true', style: `--ar:${ratioOf(a.photos[0])}` }, ...layers, badge),
      h('span', { class: 'album-info' }, h('strong', {}, a.name),
        a.desc ? h('span', { class: 'album-desc' }, a.desc) : null,
        h('span', {}, photoCount(a.photos.length))));
    card.addEventListener('click', () => openAlbum(a));
    return card;
  }));
  return albums.length;
}

const av = document.getElementById('album-view');
export function openAlbum(a) {
  if (!av) return;
  photos = a.photos;
  document.getElementById('av-title').textContent = a.name;
  document.getElementById('av-count').textContent = photoCount(a.photos.length);
  const desc = document.getElementById('av-desc');
  if (desc) { desc.textContent = a.desc || ''; desc.hidden = !a.desc; }
  const grid = document.getElementById('av-grid');
  grid.style.setProperty('--ar', ratioOf(a.photos[0])); // every tile in the album's shape; another shape fits inside, whole
  grid.replaceChildren(...a.photos.map((p, i) => {
    const b = h('button', {
      type: 'button', class: 'gallery-item', style: `--i:${Math.min(i, 24)};--r:${((i * 37) % 9) - 4}deg`,
      'aria-label': p.caption ? `عرض الصورة: ${p.caption}` : `عرض الصورة ${i + 1}`,
    }, h('img', { src: p.thumb, alt: p.caption || '', loading: 'lazy', decoding: 'async', width: p.w || null, height: p.h || null }),
    p.caption ? h('span', { class: 'gallery-cap' }, p.caption) : null);
    b.addEventListener('click', () => openLightbox(i));
    return b;
  }));
  av.showModal();
  av.scrollTop = 0;
}
if (av) av.addEventListener('click', (e) => {
  if (!e.target.closest('[data-av="close"]')) return;
  av.close();
  // closed with the mouse or a finger (detail > 0): no focus ring left on the album card; with the keyboard it stays, to keep your place
  if (e.detail > 0) document.activeElement?.closest?.('.album-card')?.blur();
});

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
