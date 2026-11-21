// Blog cards and fetching, shared by /blog, a post page and the home page section.
import { postDate, postState, sortPosts } from './blog-shared.js';

export const postUrl = (p) => `/blog/${encodeURIComponent(p.slug)}`;

/* tiny DOM helper (text only) */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((k) => k != null && el.append(k.nodeType ? k : String(k)));
  return el;
}

/** the published posts whose time has come, pinned first then newest */
export async function fetchPosts(db, fs) {
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'blog'), fs.where('status', '==', 'published')));
  return publicPosts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}
/** the posts visitors see (their time has come), in the blog's order */
export const publicPosts = (list) => sortPosts(list.filter((p) => postState(p) === 'published'));

const meta = (p) => [postDate(p.date), p.readMin ? `${p.readMin} د قراءة` : ''].filter(Boolean).join(' · ');

/** a post as a card (a link) */
export function postCard(p, { big = false } = {}) {
  const cover = p.cover
    ? h('img', { src: p.cover, alt: p.coverAlt || '', loading: 'lazy', decoding: 'async' })
    : h('span', { class: 'pc-pix', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));
  return h('a', { class: `post-card${big ? ' is-big' : ''}${p.pinned ? ' is-pinned' : ''}`, href: postUrl(p) },
    h('span', { class: 'pc-cover' }, cover, p.pinned ? h('span', { class: 'pc-pin' }, 'مثبّت') : null),
    h('span', { class: 'pc-body' },
      (p.tags || []).length ? h('span', { class: 'pc-tags' }, ...(p.tags || []).slice(0, 3).map((t) => h('span', {}, `#${t}`))) : null,
      h('strong', { class: 'pc-title' }, p.title),
      p.excerpt ? h('span', { class: 'pc-excerpt' }, p.excerpt) : null,
      h('span', { class: 'pc-meta' }, meta(p), h('span', { class: 'pc-go', 'aria-hidden': 'true' }, 'اقرأ ←'))));
}
