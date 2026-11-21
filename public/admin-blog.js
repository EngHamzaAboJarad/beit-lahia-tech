// Admin › «المدونة»: the list of posts (search, filter, publish / hide, pin, copy, delete) and the editor
// (Markdown with a toolbar and a live preview, images pasted or dropped right into the text, a cover,
// tags, a draft / published / scheduled state). Unsaved text is kept in this browser so a closed tab
// never loses a post. Data layout: see blog-shared.js.
import {
  renderMarkdown, slugify, cleanSlug, readMinutes, parseTags, plainText, mediaIds, postState, postDate, today, youtubeId,
} from './blog-shared.js';

const $ = (id) => document.getElementById(id);
const DRAFT_KEY = (id) => `blt-blog-draft-${id}`;
const STATE_NAME = { draft: ['مسودة', 'st-draft'], scheduled: ['مجدول', 'st-scheduled'], published: ['منشور', 'st-published'] };

let deps; // { h, toast, setBusy, db, fs, errMsg, user }
let started = false;
const state = { posts: [], q: '', filter: '', cur: null, media: {}, dirty: false, mode: null, newMedia: new Set() };

/* =================== images: shrink in the browser, store as data URLs =================== */
const loadImage = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file); const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad-image')); };
  img.src = url;
});
function encode(img, maxSide, maxChars, q0 = 0.84) {
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  let w = Math.round(img.naturalWidth * k); let h = Math.round(img.naturalHeight * k);
  for (let t = 0; t < 8; t++) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    for (let q = q0; q >= 0.5; q -= 0.08) { const d = c.toDataURL('image/jpeg', q); if (d.length <= maxChars) return { data: d, w, h }; }
    w = Math.round(w * 0.82); h = Math.round(h * 0.82);
  }
  throw new Error('too-big');
}

/* =================== the list =================== */
const viewUrl = (p) => `/blog/${encodeURIComponent(p.slug)}`;
const atLocal = (ts) => { // Firestore timestamp → value for <input type=datetime-local>
  const ms = ts?.toMillis ? ts.toMillis() : 0; if (!ms) return '';
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
};
const whenFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

async function loadPosts() {
  const { db, fs } = deps;
  try {
    const snap = await fs.getDocs(fs.collection(db, 'blog'));
    state.posts = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderList();
  } catch (e) { deps.toast(deps.errMsg(e), true); }
}

function renderList() {
  const { h } = deps;
  const q = state.q.trim().toLowerCase();
  const all = [...state.posts].sort((a, b) => (!!b.pinned - !!a.pinned) || String(b.date || '').localeCompare(String(a.date || '')) || ((b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)));
  const count = { published: 0, scheduled: 0, draft: 0 };
  all.forEach((p) => { count[postState(p)]++; });
  $('blog-stats').replaceChildren(
    ...[['الكل', all.length, ''], ['منشور', count.published, 'is-pub'], ['مجدول', count.scheduled, 'is-sch'], ['مسودة', count.draft, 'is-draft']]
      .map(([label, n, cls]) => h('div', { class: `blog-stat ${cls}` }, h('strong', {}, String(n)), h('span', {}, label))));
  const list = all.filter((p) => (!state.filter || postState(p) === state.filter)
    && (!q || `${p.title} ${(p.tags || []).join(' ')} ${p.author || ''}`.toLowerCase().includes(q)));
  $('blog-empty').hidden = list.length > 0;
  $('blog-empty').textContent = state.posts.length ? 'ما في مقالات بتطابق البحث.' : 'ما في مقالات لسا. اضغط «مقال جديد» واكتب أول واحد.';
  $('blog-rows').replaceChildren(...list.map((p) => {
    const st = postState(p); const [stName, stCls] = STATE_NAME[st];
    const when = st === 'scheduled' ? `بينزل ${whenFmt.format(p.publishAt.toDate())}` : postDate(p.date);
    return h('li', { class: `blog-row${p.pinned ? ' is-pinned' : ''}` },
      h('button', { type: 'button', class: 'blog-row-main', onclick: () => openEditor(p) },
        p.cover ? h('img', { class: 'blog-row-cover', src: p.cover, alt: '' }) : h('span', { class: 'blog-row-cover is-empty', 'aria-hidden': 'true' }),
        h('span', { class: 'blog-row-text' },
          h('strong', {}, p.title || 'بدون عنوان'),
          h('span', { class: 'blog-row-meta' },
            h('span', { class: `st ${stCls}` }, stName),
            p.pinned ? h('span', { class: 'st st-pin' }, 'مثبّت') : null,
            p.publishReq && p.status !== 'published' ? h('span', { class: 'st st-ask', title: p.reqBy ? `طلبه ${p.reqBy}` : null }, 'بانتظار الموافقة') : null,
            when ? h('span', {}, when) : null,
            p.readMin ? h('span', {}, `${p.readMin} د قراءة`) : null,
            ...(p.tags || []).slice(0, 3).map((t) => h('span', { class: 'blog-tag' }, `#${t}`))))),
      h('div', { class: 'blog-row-actions' },
        h('button', { type: 'button', class: 'btn btn-ghost-dark btn-sm', onclick: () => quickPublish(p, p.status !== 'published') },
          p.status === 'published' ? 'إخفاء' : !asks() ? 'انشر' : p.publishReq ? 'إلغاء الطلب' : 'اطلب النشر'),
        h('button', { type: 'button', class: 'icon-btn', title: p.pinned ? 'شيل التثبيت' : 'ثبّت فوق', 'aria-label': p.pinned ? 'شيل التثبيت' : 'ثبّت فوق', 'aria-pressed': String(!!p.pinned), onclick: () => quickPin(p) },
          icon('M12 17v5M9 3h6l-1 7 4 3H6l4-3z')),
        st === 'published' ? h('a', { class: 'icon-btn', href: viewUrl(p), target: '_blank', rel: 'noopener', title: 'شوفه على الموقع', 'aria-label': 'شوفه على الموقع' }, icon('M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5')) : null,
        h('button', { type: 'button', class: 'icon-btn', title: 'نسخة', 'aria-label': 'اعمل نسخة', onclick: () => duplicate(p) }, icon('M8 8h12v12H8zM16 8V4H4v12h4')),
        h('button', { type: 'button', class: 'icon-btn is-danger', title: 'حذف', 'aria-label': 'احذف المقال', onclick: () => removePost(p) }, icon('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3'))));
  }));
  $('be-tag-list').replaceChildren(...[...new Set(state.posts.flatMap((p) => p.tags || []))].map((t) => h('option', { value: t })));
}
function icon(d) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p);
  return s;
}

// site/approvals.blog (the owner's switch): another admin's «انشر» asks the owner (publishReq) instead
const asks = () => !!deps.mustAsk?.();
async function quickPublish(p, on) {
  const { db, fs } = deps;
  if (on && asks()) {
    try {
      const patch = p.publishReq ? { publishReq: false, updatedAt: fs.serverTimestamp() } : deps.reqFields();
      await fs.updateDoc(fs.doc(db, 'blog', p.id), patch);
      p.publishReq = !p.publishReq;
      deps.toast(p.publishReq ? 'انبعت طلب النشر لصاحب المنصة: بينتشر لما يوافق' : 'انلغى طلب النشر');
      renderList();
    } catch (e) { deps.toast(deps.errMsg(e), true); }
    return;
  }
  try {
    const patch = { status: on ? 'published' : 'draft', updatedAt: fs.serverTimestamp() };
    if (on && !p.date) patch.date = today();
    await fs.updateDoc(fs.doc(db, 'blog', p.id), patch);
    Object.assign(p, patch, { updatedAt: fs.Timestamp.now() });
    deps.toast(on ? (postState(p) === 'scheduled' ? 'انجدول، بينزل بموعده' : 'انشر على المدونة') : 'رجع مسودة وانخفى من الموقع');
    renderList();
  } catch (e) { deps.toast(deps.errMsg(e), true); }
}
async function quickPin(p) {
  const { db, fs } = deps;
  try {
    await fs.updateDoc(fs.doc(db, 'blog', p.id), { pinned: !p.pinned, updatedAt: fs.serverTimestamp() });
    p.pinned = !p.pinned; deps.toast(p.pinned ? 'تثبّت بأول المدونة' : 'انشال التثبيت'); renderList();
  } catch (e) { deps.toast(deps.errMsg(e), true); }
}
async function postMedia(postId) {
  const { db, fs } = deps;
  const snap = await fs.getDocs(fs.query(fs.collection(db, 'blogMedia'), fs.where('post', '==', postId)));
  return snap.docs;
}
async function removePost(p) {
  if (!confirm(`حذف «${p.title}» نهائياً؟ المقال ونصّه وصوره بينحذفوا وما بيرجعوا.`)) return;
  const { db, fs } = deps;
  try {
    const media = await postMedia(p.id);
    const batch = fs.writeBatch(db);
    batch.delete(fs.doc(db, 'blog', p.id)); batch.delete(fs.doc(db, 'blogBody', p.id));
    media.forEach((m) => batch.delete(m.ref));
    await batch.commit();
    try { localStorage.removeItem(DRAFT_KEY(p.id)); } catch { /* private mode */ }
    state.posts = state.posts.filter((x) => x !== p);
    deps.toast('انحذف المقال'); renderList();
    if (state.cur?.id === p.id) closeEditor(true);
  } catch (e) { deps.toast(deps.errMsg(e), true); }
}
function uniqueSlug(slug, id) {
  const taken = new Set(state.posts.filter((p) => p.id !== id).map((p) => p.slug));
  let s = slug; let k = 2;
  while (taken.has(s)) s = `${slug}-${k++}`;
  return s;
}
async function duplicate(p) {
  const { db, fs } = deps;
  try {
    const body = (await fs.getDoc(fs.doc(db, 'blogBody', p.id))).data() || { md: '' };
    const ref = fs.doc(fs.collection(db, 'blog'));
    let md = body.md || '';
    const batch = fs.writeBatch(db);
    // the images get copies of their own, so the copy keeps them even if the original goes
    for (const m of await postMedia(p.id)) {
      const nm = fs.doc(fs.collection(db, 'blogMedia'));
      batch.set(nm, { ...m.data(), post: ref.id });
      md = md.split(`(media:${m.id})`).join(`(media:${nm.id})`);
    }
    const { id, ...meta } = p;
    const copy = { ...meta, title: `${p.title} (نسخة)`.slice(0, 140), slug: uniqueSlug(`${p.slug}-نسخة`, ref.id), status: 'draft', publishAt: null, pinned: false, createdAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() };
    batch.set(ref, copy);
    batch.set(fs.doc(db, 'blogBody', ref.id), { md, cover: body.cover || '' });
    await batch.commit();
    state.posts.push({ id: ref.id, ...copy, createdAt: fs.Timestamp.now(), updatedAt: fs.Timestamp.now() });
    deps.toast('انعملت نسخة كمسودة'); renderList();
  } catch (e) { deps.toast(deps.errMsg(e), true); }
}

/* =================== the editor =================== */
const md = () => $('be-md');
function fields() { // the form → a post (meta) + its text
  const at = $('be-at').value ? new Date($('be-at').value) : null;
  return {
    title: $('be-title').value.trim(),
    slug: $('be-slug').value.trim(),
    excerpt: $('be-excerpt').value.trim(),
    coverAlt: $('be-cover-alt').value.trim(),
    tags: parseTags($('be-tags').value),
    author: $('be-author').value.trim(),
    date: $('be-date').value,
    status: document.querySelector('input[name="be-status"]:checked')?.value || 'draft',
    at: at && !Number.isNaN(+at) ? at : null,
    pinned: $('be-pin').checked,
    md: md().value,
  };
}
function setDirty(on) {
  state.dirty = on; $('be-dirty').hidden = !on;
  if (on) saveLocalSoon();
}
let localT = 0;
function saveLocalSoon() {
  clearTimeout(localT);
  localT = setTimeout(() => {
    if (!state.cur) return;
    const { at, ...f } = fields();
    try { localStorage.setItem(DRAFT_KEY(state.cur.id), JSON.stringify({ ...f, at: at ? +at : 0, cover: state.cur.coverChanged ? 'changed' : '', savedAt: Date.now() })); } catch { /* full / private */ }
  }, 600);
}
function updateState() {
  const f = fields(); const cur = state.cur;
  const st = f.status !== 'published' ? 'draft' : f.at && +f.at > Date.now() ? 'scheduled' : 'published';
  const [name, cls] = STATE_NAME[st];
  $('be-state').className = `be-state st ${cls}`; $('be-state').textContent = cur.isNew ? `جديد · ${name}` : name;
  $('be-save').querySelector('.btn-label').textContent = st === 'draft' ? 'احفظ المسودة' : st === 'scheduled' ? 'احفظ وجدوله' : cur.saved?.status === 'published' ? 'احفظ التعديلات' : 'احفظ وانشر';
  $('be-hint').textContent = st === 'scheduled' ? `بيضل مخفي وبينزل لحاله ${whenFmt.format(f.at)}.`
    : st === 'published' ? 'بيظهر بالمدونة أول ما تحفظ.' : 'المسودة بتشوفها إنت والمشرفين بس.';
  const live = !cur.isNew && cur.saved && postState(cur.saved) === 'published';
  $('be-view').hidden = !live; if (live) $('be-view').href = viewUrl(cur.saved);
  $('be-delete').hidden = cur.isNew;
  $('be-excerpt-n').textContent = `${$('be-excerpt').value.length} / 320`;
}
let prevT = 0;
function renderPreview() {
  const f = fields();
  const { html, toc } = renderMarkdown(f.md, state.media);
  const head = `<header class="be-pv-head">${state.cur.cover ? `<img class="be-pv-cover" src="${state.cur.cover}" alt="">` : ''}`
    + `<h1>${esc(f.title || 'عنوان المقال')}</h1><p class="be-pv-meta">${esc([postDate(f.date), f.author, `${readMinutes(f.md)} د قراءة`].filter(Boolean).join(' · '))}</p></header>`;
  const tocHtml = toc.length >= 3 ? `<nav class="post-toc"><strong>بهالمقال</strong><ol>${toc.map((t) => `<li>${esc(t.text)}</li>`).join('')}</ol></nav>` : '';
  $('be-preview').innerHTML = head + tocHtml + (html || '<p class="muted">المعاينة بتطلع هون وانت بتكتب.</p>'); // renderMarkdown escapes the text
  const words = f.md.split(/\s+/).filter(Boolean).length;
  $('be-words').textContent = `${words} كلمة · ${readMinutes(f.md)} د قراءة`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const previewSoon = () => { clearTimeout(prevT); prevT = setTimeout(renderPreview, 120); };

async function loadMedia(text) {
  const { db, fs } = deps;
  const need = mediaIds(text).filter((id) => !state.media[id]);
  await Promise.all(need.map(async (id) => {
    try { const d = await fs.getDoc(fs.doc(db, 'blogMedia', id)); if (d.exists()) state.media[id] = d.data().src; } catch { /* shows without it */ }
  }));
}

async function openEditor(p) {
  const { db, fs } = deps;
  if (state.cur && state.dirty && !confirm('فيه تعديلات ما انحفظت على المقال المفتوح. تتركها؟')) return;
  let body = { md: '', cover: '' };
  if (p) {
    try { body = (await fs.getDoc(fs.doc(db, 'blogBody', p.id))).data() || body; } catch (e) { deps.toast(deps.errMsg(e), true); return; }
  }
  const id = p ? p.id : fs.doc(fs.collection(db, 'blog')).id;
  const me = deps.user?.();
  state.cur = { id, isNew: !p, saved: p || null, cover: p?.cover || '', coverFull: body.cover || '', coverChanged: false };
  state.newMedia = new Set();
  const v = {
    title: p?.title || '', slug: p?.slug || '', excerpt: p?.excerpt || '', coverAlt: p?.coverAlt || '',
    tags: (p?.tags || []).join('، '), author: p?.author ?? (me?.displayName || ''), date: p?.date || today(),
    status: p?.status || 'draft', at: atLocal(p?.publishAt), pinned: !!p?.pinned, md: body.md || '',
  };
  // text kept in this browser that is newer than the saved post: offer it back
  try {
    const local = JSON.parse(localStorage.getItem(DRAFT_KEY(id)) || 'null');
    const savedAt = p?.updatedAt?.toMillis ? p.updatedAt.toMillis() : 0;
    if (local && local.savedAt > savedAt + 2000 && (local.md !== v.md || local.title !== v.title)
      && confirm('في نسخة من هالمقال ما انحفظت (من آخر مرة كتبت فيه بهالمتصفح). ترجّعها؟')) {
      Object.assign(v, { ...local, tags: (local.tags || []).join('، '), at: local.at ? new Date(local.at - new Date(local.at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '' });
    } else if (local) localStorage.removeItem(DRAFT_KEY(id));
  } catch { /* nothing kept */ }
  $('be-title').value = v.title; $('be-slug').value = v.slug; $('be-excerpt').value = v.excerpt; $('be-cover-alt').value = v.coverAlt;
  $('be-tags').value = v.tags; $('be-author').value = v.author; $('be-date').value = v.date; $('be-at').value = v.at;
  $('be-pin').checked = v.pinned; md().value = v.md;
  document.querySelectorAll('input[name="be-status"]').forEach((r) => { r.checked = r.value === v.status; });
  state.slugTouched = !!v.slug;
  paintCover();
  $('blog-list-view').hidden = true; $('blog-editor').hidden = false;
  setMode(state.mode || (matchMedia('(max-width: 900px)').matches ? 'write' : 'split'));
  setDirty(false); updateState(); renderPreview();
  await loadMedia(v.md); renderPreview();
  (v.title ? md() : $('be-title')).focus({ preventScroll: true });
  scrollTo({ top: 0 });
}
async function closeEditor(force = false) {
  if (!force && state.dirty && !confirm('فيه تعديلات ما انحفظت. تطلع بدونها؟ (النص بيضل محفوظ بهالمتصفح)')) return;
  const cur = state.cur;
  if (cur?.isNew && state.newMedia.size) { // images uploaded for a post that was never saved
    const { db, fs } = deps;
    const batch = fs.writeBatch(db);
    state.newMedia.forEach((mid) => batch.delete(fs.doc(db, 'blogMedia', mid)));
    batch.commit().catch(() => {});
  }
  state.cur = null; state.dirty = false;
  $('blog-editor').hidden = true; $('blog-list-view').hidden = false;
  renderList();
}
function paintCover() {
  const c = state.cur.cover;
  $('be-cover-img').hidden = !c; if (c) $('be-cover-img').src = state.cur.coverFull || c;
  $('be-cover-empty').hidden = !!c; $('be-cover-rm').hidden = !c;
}
async function pickCover(file) {
  if (!file) return;
  try {
    const img = await loadImage(file);
    state.cur.cover = encode(img, 760, 150000, 0.8).data;
    state.cur.coverFull = encode(img, 1600, 620000).data;
    state.cur.coverChanged = true;
    paintCover(); setDirty(true); renderPreview();
  } catch { deps.toast('ما قدرت أفتح الصورة. جرّب JPG أو PNG', true); }
}

async function save() {
  const { db, fs } = deps; const cur = state.cur; const f = fields();
  if (!f.title) { deps.toast('اكتب عنوان للمقال', true); $('be-title').focus(); return; }
  if (f.status === 'published' && !f.md.trim()) { deps.toast('المقال فاضي. اكتب النص قبل ما تنشر', true); md().focus(); return; }
  const slug = uniqueSlug(cleanSlug(f.slug || slugify(f.title)), cur.id);
  const b = $('be-save'); deps.setBusy(b, true);
  try {
    const meta = {
      title: f.title, slug, excerpt: (f.excerpt || plainText(f.md, 200)).slice(0, 320), cover: cur.cover || '', coverAlt: f.coverAlt,
      tags: f.tags, author: f.author, date: f.date || today(), status: f.status,
      publishAt: f.status === 'published' && f.at && +f.at > Date.now() ? fs.Timestamp.fromDate(f.at) : null,
      pinned: f.pinned, readMin: readMinutes(f.md),
      createdAt: cur.saved?.createdAt || fs.serverTimestamp(), updatedAt: fs.serverTimestamp(),
    };
    // another admin publishing a draft: it stays a draft and asks the owner
    const asking = f.status === 'published' && cur.saved?.status !== 'published' && asks();
    if (asking) Object.assign(meta, { status: 'draft', publishAt: null }, deps.reqFields());
    const batch = fs.writeBatch(db);
    batch.set(fs.doc(db, 'blog', cur.id), meta);
    batch.set(fs.doc(db, 'blogBody', cur.id), { md: f.md, cover: cur.cover ? cur.coverFull || cur.cover : '' });
    await batch.commit();
    // images no longer in the text go away
    const used = new Set(mediaIds(f.md));
    const stale = (await postMedia(cur.id)).filter((m) => !used.has(m.id));
    if (stale.length) { const c = fs.writeBatch(db); stale.forEach((m) => c.delete(m.ref)); await c.commit().catch(() => {}); }
    const saved = { id: cur.id, ...meta, createdAt: cur.saved?.createdAt || fs.Timestamp.now(), updatedAt: fs.Timestamp.now() };
    state.posts = [...state.posts.filter((p) => p.id !== cur.id), saved];
    Object.assign(cur, { isNew: false, saved, coverChanged: false });
    state.newMedia = new Set();
    $('be-slug').value = slug; $('be-excerpt').value = meta.excerpt;
    try { localStorage.removeItem(DRAFT_KEY(cur.id)); } catch { /* private mode */ }
    setDirty(false); updateState();
    const st = postState(saved);
    if (asking) { deps.toast('انحفظ كمسودة، وانبعت طلب النشر لصاحب المنصة'); deps.onRequest?.(); return; }
    deps.toast(st === 'published' ? 'انحفظ ✓ المقال منشور' : st === 'scheduled' ? 'انحفظ ✓ وبينزل بموعده' : 'انحفظت المسودة ✓');
  } catch (e) { console.error(e); deps.toast(deps.errMsg(e), true); } finally { deps.setBusy(b, false); updateState(); }
}

/* ----- writing helpers: keep the textarea's own undo (execCommand), fall back to setRangeText ----- */
function insert(text, selFrom, selTo) {
  const t = md(); t.focus();
  const start = t.selectionStart;
  if (!document.execCommand('insertText', false, text)) { t.setRangeText(text, t.selectionStart, t.selectionEnd, 'end'); t.dispatchEvent(new Event('input')); }
  if (selFrom != null) t.setSelectionRange(start + selFrom, start + (selTo ?? selFrom));
}
function wrap(before, after, placeholder) {
  const t = md(); const sel = t.value.slice(t.selectionStart, t.selectionEnd) || placeholder;
  insert(before + sel + after, before.length, before.length + sel.length);
}
function linePrefix(prefix, numbered) {
  const t = md(); const v = t.value;
  const s = v.lastIndexOf('\n', t.selectionStart - 1) + 1; let e = v.indexOf('\n', t.selectionEnd); if (e < 0) e = v.length;
  const lines = v.slice(s, e).split('\n');
  const done = lines.map((l, i) => (numbered ? `${i + 1}. ${l.replace(/^\d+[.)]\s+/, '')}` : l.startsWith(prefix) ? l.slice(prefix.length) : prefix + l.replace(/^#{1,4}\s+/, ''))).join('\n');
  t.focus(); t.setSelectionRange(s, e); insert(done);
}
function block(text) { // on its own lines
  const t = md(); const v = t.value; const i = t.selectionStart;
  const pre = i === 0 || v[i - 1] === '\n' ? (i > 1 && v[i - 2] !== '\n' ? '\n' : '') : '\n\n';
  const post = v[t.selectionEnd] === '\n' ? '\n' : '\n\n';
  insert(pre + text + post);
}
const ACTIONS = {
  h2: () => linePrefix('## '), h3: () => linePrefix('### '),
  bold: () => wrap('**', '**', 'نص عريض'), italic: () => wrap('*', '*', 'نص مائل'),
  link: () => {
    const t = md(); const sel = t.value.slice(t.selectionStart, t.selectionEnd) || 'نص الرابط';
    const url = prompt('الرابط (https://…)', 'https://');
    if (!url || url === 'https://') return;
    insert(`[${sel}](${url.trim()})`, 1, 1 + sel.length);
  },
  ul: () => linePrefix('- '), ol: () => linePrefix('', true), quote: () => linePrefix('> '),
  code: () => { const t = md(); const sel = t.value.slice(t.selectionStart, t.selectionEnd); if (sel.includes('\n') || !sel) block(`\`\`\`\n${sel || 'الكود هون'}\n\`\`\``); else wrap('`', '`', ''); },
  box: () => block(':::tip\nملاحظة مهمة\n:::'),
  hr: () => block('---'),
  video: () => {
    const url = prompt('رابط فيديو يوتيوب');
    if (!url) return;
    if (!youtubeId(url)) { deps.toast('هاد مش رابط يوتيوب', true); return; }
    block(`@[youtube](${url.trim()})`);
  },
};

async function uploadImages(files) {
  const { db, fs } = deps; const cur = state.cur;
  const list = [...files].filter((f) => /^image\/(jpeg|png|webp|gif)$/.test(f.type));
  if (!list.length || !cur) return;
  const out = $('be-upload');
  for (let i = 0; i < list.length; i++) {
    out.textContent = `جاري رفع الصورة ${i + 1} من ${list.length}…`;
    try {
      const img = await loadImage(list[i]);
      const { data, w, h } = encode(img, 1600, 850000);
      const ref = fs.doc(fs.collection(db, 'blogMedia'));
      await fs.setDoc(ref, { src: data, post: cur.id, w, h });
      state.media[ref.id] = data; if (cur.isNew) state.newMedia.add(ref.id);
      const alt = (list[i].name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').slice(0, 60);
      block(`![${/^(image|img|screenshot|ص)/i.test(alt) || !alt ? 'وصف الصورة' : alt}](media:${ref.id})`);
    } catch (e) { console.error(e); deps.toast(e?.code ? deps.errMsg(e) : 'ما قدرت أرفع الصورة', true); }
  }
  out.textContent = '';
}

function setMode(mode) {
  state.mode = mode;
  $('be-panes').dataset.mode = mode;
  document.querySelectorAll('.be-modes [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  if (mode !== 'write') renderPreview();
}

function wire() {
  $('blog-new').addEventListener('click', () => openEditor(null));
  $('blog-q').addEventListener('input', (e) => { state.q = e.target.value; renderList(); });
  document.querySelectorAll('#blog-filter [role="tab"]').forEach((b) => b.addEventListener('click', () => {
    state.filter = b.dataset.f;
    document.querySelectorAll('#blog-filter [role="tab"]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    renderList();
  }));
  $('be-back').addEventListener('click', () => closeEditor());
  $('be-save').addEventListener('click', save);
  $('be-delete').addEventListener('click', () => { const p = state.posts.find((x) => x.id === state.cur?.id); if (p) removePost(p); });
  $('be-title').addEventListener('input', () => {
    if (!state.slugTouched) $('be-slug').value = slugify($('be-title').value);
    setDirty(true); updateState(); previewSoon();
  });
  $('be-slug').addEventListener('input', () => { state.slugTouched = !!$('be-slug').value.trim(); setDirty(true); });
  $('be-slug').addEventListener('change', () => { $('be-slug').value = $('be-slug').value.trim() ? cleanSlug($('be-slug').value) : slugify($('be-title').value); });
  ['be-excerpt', 'be-tags', 'be-author', 'be-date', 'be-at', 'be-pin', 'be-cover-alt'].forEach((id) => $(id).addEventListener('input', () => { setDirty(true); updateState(); previewSoon(); }));
  document.querySelectorAll('input[name="be-status"]').forEach((r) => r.addEventListener('change', () => { setDirty(true); updateState(); }));
  md().addEventListener('input', () => { setDirty(true); previewSoon(); });
  document.querySelectorAll('.be-tb[data-md]').forEach((b) => b.addEventListener('click', () => ACTIONS[b.dataset.md]()));
  document.querySelectorAll('.be-modes [role="tab"]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('be-img').addEventListener('change', (e) => { uploadImages(e.target.files); e.target.value = ''; });
  $('be-cover-in').addEventListener('change', (e) => { pickCover(e.target.files[0]); e.target.value = ''; });
  $('be-cover-rm').addEventListener('click', (e) => { e.preventDefault(); state.cur.cover = ''; state.cur.coverFull = ''; state.cur.coverChanged = true; paintCover(); setDirty(true); renderPreview(); });
  // images pasted or dropped into the text
  md().addEventListener('paste', (e) => {
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); uploadImages(files); }
  });
  const write = document.querySelector('.be-write');
  ['dragenter', 'dragover'].forEach((t) => write.addEventListener(t, (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); write.classList.add('is-over'); } }));
  ['dragleave', 'drop'].forEach((t) => write.addEventListener(t, () => write.classList.remove('is-over')));
  write.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { e.preventDefault(); uploadImages(e.dataTransfer.files); } });
  // shortcuts
  $('blog-editor').addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); save(); return; }
    if (e.target !== md()) return;
    if (k === 'b') { e.preventDefault(); ACTIONS.bold(); } else if (k === 'i') { e.preventDefault(); ACTIONS.italic(); } else if (k === 'k') { e.preventDefault(); ACTIONS.link(); }
  });
  // the preview follows the text while scrolling side by side
  md().addEventListener('scroll', () => {
    if (state.mode !== 'split') return;
    const t = md(); const p = $('be-preview');
    const k = t.scrollTop / Math.max(1, t.scrollHeight - t.clientHeight);
    p.scrollTop = k * (p.scrollHeight - p.clientHeight);
  }, { passive: true });
  addEventListener('beforeunload', (e) => { if (state.cur && state.dirty) { e.preventDefault(); e.returnValue = ''; } });
}

export function initBlog(d) { deps = d; }
export function showBlog() {
  if (!started) { started = true; wire(); loadPosts(); return; }
  if (!state.cur) loadPosts();
}
