// Beit Lahia Tech — the blog, shared by the admin editor and the public pages.
// Posts are written in a small Markdown: ## and ### headings, paragraphs, **bold**, *italic*, `code`,
// ```code blocks```, > quotes, - and 1. lists, [links](https://…), ![images](media:ID or https://…),
// @[youtube](link) videos, --- lines and :::note boxes. renderMarkdown() escapes every piece of text
// first and only lets safe links through, so its output can go into innerHTML.
//
// Firestore:
//   blog/{id}      → title, slug, excerpt, cover (small), coverAlt, tags, author, date, status, publishAt, pinned, readMin
//   blogBody/{id}  → md, cover (full size)
//   blogMedia/{id} → src, post, w, h   (images inside a post, written as ![alt](media:ID))

export const BLOG_STATUS = { draft: 'مسودة', published: 'منشور', scheduled: 'مجدول' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** a URL-friendly name from a title: Arabic and Latin letters, digits and dashes */
export function slugify(title) {
  return String(title || '').trim().toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '') // harakat + tatweel
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}
export const cleanSlug = (s) => slugify(String(s || '').replace(/-/g, ' '));

/** minutes to read (Arabic reads a bit slower than English) */
export function readMinutes(md) {
  const words = String(md || '').replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

export const parseTags = (s) => [...new Set(String(s || '').split(/[,،#\n]/).map((t) => t.trim().replace(/\s+/g, '_')).filter(Boolean))].slice(0, 8).map((t) => t.slice(0, 30));

const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export function postDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : '';
}
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/** where a post stands for visitors: draft, scheduled (published but its time hasn't come) or published */
export function postState(p, now = Date.now()) {
  if (p.status !== 'published') return 'draft';
  const at = p.publishAt?.toMillis ? p.publishAt.toMillis() : p.publishAt?.seconds ? p.publishAt.seconds * 1000 : 0;
  return at && at > now ? 'scheduled' : 'published';
}

/** public posts in the order the blog shows them: pinned first, then newest */
export const sortPosts = (list) => [...list].sort((a, b) => (!!b.pinned - !!a.pinned) || String(b.date || '').localeCompare(String(a.date || '')) || ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));

export function youtubeId(url) {
  const m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/.exec(String(url || ''));
  return m ? m[1] : '';
}

// links: web, mail, phone, on-site paths and anchors. Images: media:ID, https, or a data URL while editing.
const safeHref = (u) => (/^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i.test(u) ? u : '');
const safeSrc = (u, media) => {
  const m = /^media:([\w-]{4,40})$/.exec(u);
  if (m) return media?.[m[1]] || '';
  return /^https:\/\//i.test(u) ? u : '';
};

// inline marks on text that is already escaped
function inline(t, media) {
  const codes = [];
  t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, u) => {
    const src = safeSrc(u.replace(/&amp;/g, '&'), media);
    return src ? `<img src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async">` : '';
  });
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, u) => {
    const href = safeHref(u.replace(/&amp;/g, '&'));
    if (!href) return label;
    const ext = /^https?:/i.test(href);
    return `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,،)])/g, (_, pre, u) => `${pre}<a href="${u}" target="_blank" rel="noopener noreferrer" dir="ltr">${u}</a>`);
  return t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

/**
 * Markdown → { html, toc } (toc = the ## headings, for a table of contents).
 * media: { ID: src } for ![alt](media:ID) images.
 */
export function renderMarkdown(md, media = {}) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; const toc = []; const used = new Set();
  let para = []; let list = null; let quote = [];
  const headId = (text) => {
    let id = slugify(text.replace(/<[^>]+>/g, '')); let k = 2;
    while (used.has(id)) id = `${slugify(text)}-${k++}`;
    used.add(id); return id;
  };
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map((l) => inline(esc(l), media)).join('<br>')}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(esc(i), media)}</li>`).join('')}</${list.tag}>`); list = null; } };
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${renderMarkdown(quote.join('\n'), media).html}</blockquote>`); quote = []; } };
  const flush = () => { flushPara(); flushList(); flushQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) { // code block
      flush();
      const code = [];
      while (++i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre dir="ltr"><code${fence[1] ? ` data-lang="${esc(fence[1])}"` : ''}>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const box = /^:::\s*(note|tip|warn)\s*$/.exec(line);
    if (box) { // :::note … :::
      flush();
      const body = [];
      while (++i < lines.length && !/^:::\s*$/.test(lines[i])) body.push(lines[i]);
      out.push(`<aside class="post-box is-${box[1]}">${renderMarkdown(body.join('\n'), media).html}</aside>`);
      continue;
    }
    if (/^>\s?/.test(line)) { flushPara(); flushList(); quote.push(line.replace(/^>\s?/, '')); continue; }
    flushQuote();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const hd = /^(#{1,4})\s+(.+?)\s*#*$/.exec(line);
    if (hd) {
      flush();
      const level = Math.min(4, Math.max(2, hd[1].length + (hd[1].length === 1 ? 1 : 0)));
      const text = inline(esc(hd[2]), media); const id = headId(hd[2]);
      if (level === 2) toc.push({ id, text: hd[2] });
      out.push(`<h${level} id="${esc(id)}">${text}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); out.push('<hr>'); continue; }
    const yt = /^@\[(?:youtube|video)\]\(([^)\s]+)\)\s*$/i.exec(line);
    if (yt) {
      flush();
      const id = youtubeId(yt[1]);
      if (id) out.push(`<div class="post-video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="فيديو" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`);
      continue;
    }
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (img) { // an image on its own line becomes a figure with its caption
      flush();
      const src = safeSrc(img[2], media);
      if (src) out.push(`<figure><img src="${esc(src)}" alt="${esc(img[1])}" loading="lazy" decoding="async">${img[1] ? `<figcaption>${inline(esc(img[1]), media)}</figcaption>` : ''}</figure>`);
      continue;
    }
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line); const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const tag = ul ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((ul || ol)[1]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += ` ${line.trim()}`; continue; }
    flushList();
    para.push(line);
  }
  flush();
  return { html: out.join('\n'), toc };
}

/** media IDs used in a post */
export const mediaIds = (md) => [...new Set([...String(md || '').matchAll(/\(media:([\w-]{4,40})\)/g)].map((m) => m[1]))];

/** plain text from Markdown (for excerpts) */
export function plainText(md, n = 220) {
  const t = String(md || '').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/@\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/^:::.*$/gm, ' ').replace(/[#>*_`~-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, '')}…` : t;
}
