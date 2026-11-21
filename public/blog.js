// Beit Lahia Tech — /blog (all posts: search + tags) and /blog/<slug> (one post).
// Hosting sends every /blog/<slug> to post.html (firebase.json › rewrites); /post?s=<slug> works too.
import { getDbLite } from './firebase-init.js';
import { renderMarkdown, mediaIds, postDate, postState } from './blog-shared.js';
import { fetchPosts, postCard, postUrl, h } from './blog-ui.js';
import { renderFooterLinks } from './content-defaults.js';

const $ = (id) => document.getElementById(id);
document.documentElement.classList.add('js');
const year = $('year'); if (year) year.textContent = new Date().getFullYear();
renderFooterLinks($('footer-social'), null);

const setMeta = (sel, attr, v) => { const el = document.querySelector(sel); if (el && v) el.setAttribute(attr, v); };

/* =================== /blog =================== */
async function listPage() {
  const grid = $('blog-grid'); const status = $('blog-status');
  let posts = [];
  try {
    const { db, fs } = await getDbLite();
    posts = await fetchPosts(db, fs);
  } catch (e) {
    console.warn(e); status.textContent = 'ما قدرنا نجيب المقالات هلّق. جرّب كمان شوي.'; return;
  }
  if (!posts.length) { status.textContent = 'لسا ما في مقالات. قريباً إن شاء الله.'; return; }
  status.textContent = '';
  const params = new URLSearchParams(location.search);
  let tag = params.get('tag') || ''; let q = '';
  const tags = [...new Set(posts.flatMap((p) => p.tags || []))];
  const chips = $('blog-tags');
  const paintChips = () => chips.replaceChildren(...['', ...tags].map((t) => {
    const b = h('button', { type: 'button', class: 'tag-chip', 'aria-pressed': String(t === tag) }, t ? `#${t}` : 'الكل');
    b.addEventListener('click', () => {
      tag = t; paintChips(); paint();
      const u = new URL(location.href); if (t) u.searchParams.set('tag', t); else u.searchParams.delete('tag');
      history.replaceState(null, '', u);
    });
    return b;
  }));
  chips.hidden = !tags.length;
  const paint = () => {
    const needle = q.trim().toLowerCase();
    const list = posts.filter((p) => (!tag || (p.tags || []).includes(tag))
      && (!needle || `${p.title} ${p.excerpt || ''} ${(p.tags || []).join(' ')}`.toLowerCase().includes(needle)));
    // the first post gets the big card when nothing is filtered
    grid.replaceChildren(...list.map((p, i) => postCard(p, { big: i === 0 && !tag && !needle && list.length > 2 })));
    status.textContent = list.length ? '' : 'ما في مقالات بتطابق البحث.';
    $('blog-count').textContent = `${list.length} ${list.length === 1 ? 'مقال' : list.length === 2 ? 'مقالين' : list.length <= 10 ? 'مقالات' : 'مقال'}`;
  };
  $('blog-q').addEventListener('input', (e) => { q = e.target.value; paint(); });
  $('blog-tools').hidden = false;
  paintChips(); paint();
}

/* =================== /blog/<slug> =================== */
function slugFromUrl() {
  const m = /^\/blog\/(.+?)\/?$/.exec(location.pathname);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  return new URLSearchParams(location.search).get('s') || '';
}
function notFound() {
  document.title = 'المقال مش موجود | مدونة بيت لاهيا التقني';
  $('post-loading').hidden = true;
  $('post-missing').hidden = false;
}
async function postPage() {
  const slug = slugFromUrl();
  if (!slug) { notFound(); return; }
  let db; let fs; let post;
  try {
    ({ db, fs } = await getDbLite());
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'blog'), fs.where('slug', '==', slug), fs.where('status', '==', 'published')));
    post = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((p) => postState(p) === 'published');
  } catch (e) { console.warn(e); }
  if (!post) { notFound(); return; }

  // the card first (title, cover), then the text and its images
  document.title = `${post.title} | مدونة بيت لاهيا التقني`;
  setMeta('meta[name="description"]', 'content', post.excerpt);
  setMeta('meta[property="og:title"]', 'content', post.title);
  setMeta('meta[property="og:description"]', 'content', post.excerpt);
  setMeta('link[rel="canonical"]', 'href', `https://beitlahia.tech${postUrl(post)}`);
  $('post-title').textContent = post.title;
  $('post-meta').replaceChildren(...[postDate(post.date), post.author, post.readMin ? `${post.readMin} د قراءة` : ''].filter(Boolean).map((t) => h('span', {}, t)));
  $('post-tags').replaceChildren(...(post.tags || []).map((t) => h('a', { class: 'tag-chip', href: `/blog?tag=${encodeURIComponent(t)}` }, `#${t}`)));
  if (post.cover) { $('post-cover-img').src = post.cover; $('post-cover-img').alt = post.coverAlt || ''; $('post-cover').hidden = false; }
  $('post-loading').hidden = true; $('post').hidden = false;

  let body = { md: '' };
  try { body = (await fs.getDoc(fs.doc(db, 'blogBody', post.id))).data() || body; } catch (e) { console.warn(e); }
  if (body.cover) $('post-cover-img').src = body.cover; // the full-size cover replaces the small one
  const media = {};
  await Promise.all(mediaIds(body.md).map(async (id) => {
    try { const d = await fs.getDoc(fs.doc(db, 'blogMedia', id)); if (d.exists()) media[id] = d.data().src; } catch { /* skip that image */ }
  }));
  const { html, toc } = renderMarkdown(body.md, media);
  $('post-body').innerHTML = html; // renderMarkdown escapes every piece of text and only lets safe links through
  if (toc.length >= 3) {
    $('post-toc').hidden = false;
    $('post-toc-list').replaceChildren(...toc.map((t) => h('li', {}, h('a', { href: `#${t.id}` }, t.text))));
  }
  share(post);
  related(post, db, fs);
}

function share(post) {
  const url = `https://beitlahia.tech${postUrl(post)}`;
  const text = post.title;
  $('share-wa').href = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  $('share-fb').href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
  $('share-x').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
  $('share-copy').addEventListener('click', async () => {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ title: text, url }); return; }
      await navigator.clipboard.writeText(url);
      $('share-copy').dataset.done = '1'; $('share-copy').querySelector('span').textContent = 'انسخ الرابط ✓';
      setTimeout(() => { delete $('share-copy').dataset.done; $('share-copy').querySelector('span').textContent = 'انسخ الرابط'; }, 2200);
    } catch { /* cancelled */ }
  });
}
async function related(post, db, fs) {
  try {
    const all = (await fetchPosts(db, fs)).filter((p) => p.id !== post.id);
    const tags = new Set(post.tags || []);
    const score = (p) => (p.tags || []).filter((t) => tags.has(t)).length;
    const pick = [...all].sort((a, b) => score(b) - score(a)).slice(0, 3);
    if (!pick.length) return;
    $('post-more-grid').replaceChildren(...pick.map((p) => postCard(p)));
    $('post-more').hidden = false;
  } catch { /* the post is complete without it */ }
}

// reading progress along the top
const bar = $('read-bar');
if (bar) {
  const tick = () => {
    const el = $('post-body'); if (!el) return;
    const r = el.getBoundingClientRect();
    const k = Math.min(1, Math.max(0, (innerHeight - r.top) / (r.height + innerHeight * 0.4)));
    bar.style.transform = `scaleX(${k})`;
  };
  addEventListener('scroll', tick, { passive: true }); addEventListener('resize', tick);
}

if ($('blog-grid')) listPage();
if ($('post-body')) postPage();

// the admin's contact in the footer, once the page has loaded
addEventListener('load', async () => {
  try {
    const { db, fs } = await getDbLite();
    renderFooterLinks($('footer-social'), (await fs.getDoc(fs.doc(db, 'site', 'settings'))).data() || {});
  } catch { /* the default contact stays */ }
}, { once: true });
