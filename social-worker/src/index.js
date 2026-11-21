// Beit Lahia Tech — social publishing service (Cloudflare Worker).
//
// The admin panel sends a finished post (JPEG + caption + platforms + optional time). This Worker
// keeps it in KV, publishes it to the Facebook Page and/or Instagram account through the Meta Graph
// API — right away, or from the cron trigger when its time comes — and serves the image at a public
// URL (Instagram only accepts images it can download).
//
// Who may call it: a signed-in Firebase user who has a document in admins/{uid} (same rule as the
// admin panel) with the «studio» permission. The Meta page token never leaves this Worker.
//
// Connecting Facebook / Instagram happens from the admin panel (owner only): the owner pastes the Meta
// App ID + App Secret + a user token from the Graph API Explorer; the Worker turns it into a long-lived
// token, lists the pages, and keeps the chosen page's token (it never expires) in KV › config:meta.
//
// Routes
//   GET    /health              public: is the service up, which platforms are connected
//   GET    /connect             owner: connection details (never the token)
//   POST   /connect/pages       owner: { appId, appSecret, userToken } → the pages that token manages
//   POST   /connect/select      owner: { pageId } → keep that page (+ its Instagram account)
//   POST   /connect/test        owner: check the saved connection against Meta right now
//   DELETE /connect             owner: forget the connection
//   GET    /img/:id.jpg         public: the post image (Instagram/Facebook download it from here)
//   GET    /vid/:id.mp4         public: the post video, when it has music (Range requests supported)
//   GET    /posts               admin: latest posts (scheduled, published, failed)
//   POST   /posts               admin: { image, video?: true, duration?, music?, caption, captions?[], platforms[], scheduledAt?, template, title, story? }
//   PUT    /posts/:id/video     admin: the MP4 of a post made with { video: true } (raw bytes) → publish/schedule
//   PUT    /posts/:id/page/:n   admin: page n (2…10) of a post made with { pages: N } (raw JPEG) → after the last one: publish/schedule
//   PATCH  /posts/:id           admin: { scheduledAt } move a scheduled post (the studio calendar)
//   PUT    /posts/:id           admin: edit a scheduled post { image, caption?, captions?[], title?, video?, scheduledAt? }
//   PUT|GET /posts/:id/design   admin: the post's editable design (studio JSON), to open it again in the editor
//   POST   /posts/:id/publish   admin: publish now (a scheduled post, or retry a failed one)
//   DELETE /posts/:id           admin: cancel a scheduled post / remove a failed one
//   GET    /notify              owner: e-mail alert settings · POST /notify: save them · POST /notify/test
//   POST   /notify/reg          public (site forms): { kind: member|workshop, name, workshop? } → the daily digest
//   GET    /mail · POST /mail/workshop   admin «workshops»: e-mail registrants their check-in pass / certificate (mail.js)
//   GET    /site/home|gallery|blog   public: the site's data from the edge cache · POST /site/purge: admin (site.js)
//
// What goes out where:
//   post  + image → Facebook page photo        · Instagram feed photo
//   post  + video → Facebook page video        · Instagram reel (also shown in the feed)
//   story + image → Facebook page photo story  · Instagram story
//   story + video → Facebook page video story  · Instagram story (video, with its music)
//   post  + pages → Facebook multi-photo post (captions[k] on picture k) · Instagram carousel (2…10 pictures, one caption)
//   story + pages → one story per page, in order, on both
// The video is made in the admin panel (the design + the chosen music, as MP4/H.264/AAC); the image
// always comes along too (the thumbnail in the posts list).

import { handleMail } from './mail.js';
import { handleLive } from './live.js';
import { handleSite } from './site.js';

const MAX_IMAGE = 8 * 1024 * 1024; // Instagram's limit for photos
const MAX_DESIGN = 3 * 1024 * 1024; // a design with an uploaded photo inside is ~1–2 MB of JSON
const MAX_VIDEO = 24 * 1024 * 1024; // below KV's 25 MiB value limit (a 60 s story is ~10–18 MB)
const MAX_CAPTION = 2200;          // Instagram's caption limit
const MAX_AHEAD = 75 * 864e5;      // schedule at most ~75 days ahead
const PLATFORMS = ['facebook', 'instagram'];
const MAX_PAGES = 10;       // Instagram's carousel limit

export default {
  async fetch(req, env, ctx) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      const res = await route(req, env, ctx);
      Object.entries(cors).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error(e);
      return json({ error: e.expose ? e.message : 'خطأ داخلي بالخدمة' }, status, cors);
    }
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDue(env).then(() => dailyJobs(env)).catch((e) => console.error('[cron]', e)));
  },
};

/* ---------------- routing ---------------- */
async function route(req, env, ctx) {
  const url = new URL(req.url);
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && parts[0] === 'health') {
    const m = await getMeta(env);
    return json({ ok: true, ...(await connected(env)), page: m?.pageName || '', instagramUser: m?.igUsername || '' });
  }
  if (req.method === 'GET' && parts[0] === 'img' && parts[1]) {
    const id = parts[1].replace(/\.jpe?g$/, '');
    if (!/^[a-z0-9-]{6,40}$/.test(id)) throw fail(404, 'مش موجود');
    const bytes = await env.SOCIAL.get(`img:${id}`, 'arrayBuffer');
    if (!bytes) throw fail(404, 'مش موجود');
    return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600' } });
  }
  if ((req.method === 'GET' || req.method === 'HEAD') && parts[0] === 'vid' && parts[1]) {
    const id = parts[1].replace(/\.mp4$/, '');
    if (!/^[a-z0-9-]{6,40}$/.test(id)) throw fail(404, 'مش موجود');
    const buf = await env.SOCIAL.get(`vid:${id}`, 'arrayBuffer');
    if (!buf) throw fail(404, 'مش موجود');
    return videoResponse(req, new Uint8Array(buf));
  }

  if (parts[0] === 'connect') {
    const owner = await requireAdmin(req, env);
    if (!isOwner(env, owner)) throw fail(403, 'ربط الحسابات لصاحب المنصة بس');
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : null;
    if (req.method === 'GET' && parts.length === 1) return json(await connectStatus(env));
    if (req.method === 'POST' && parts[1] === 'oauth-start') {
      const origin = req.headers.get('Origin');
      if (!origin || !corsHeaders(req, env)['Access-Control-Allow-Origin']) throw fail(403, 'عنوان الاستوديو مش معتمد');
      const saved = await getMeta(env);
      const appId = env.META_APP_ID || saved?.appId;
      const appSecret = env.META_APP_SECRET || saved?.appSecret;
      if (!appId || !appSecret) throw fail(409, 'أضف META_APP_ID وMETA_APP_SECRET لإعدادات خدمة النشر');
      const state = crypto.randomUUID();
      const redirect = origin + '/social-callback.html';
      await env.SOCIAL.put('oauth:' + state, JSON.stringify({ uid: owner.uid, redirect, appId, appSecret }), { expirationTtl: 600 });
      const params = new URLSearchParams({ client_id: appId, redirect_uri: redirect, state, response_type: 'code', scope: [...SCOPES_NEEDED, ...STATS_SCOPES].join(',') });
      if (env.META_LOGIN_CONFIG_ID) params.set('config_id', env.META_LOGIN_CONFIG_ID);
      return json({ state, url: 'https://www.facebook.com/' + (env.GRAPH_VERSION || 'v23.0') + '/dialog/oauth?' + params });
    }
    if (req.method === 'POST' && parts[1] === 'oauth-finish') {
      const key = 'oauth:' + body.state;
      const flow = await env.SOCIAL.get(key, 'json');
      if (!flow || flow.uid !== owner.uid || !body.code) throw fail(400, 'جلسة الربط انتهت. جرّب من جديد.');
      await env.SOCIAL.delete(key);
      const data = await graphGet(env, 'oauth/access_token', { client_id: flow.appId, client_secret: flow.appSecret, redirect_uri: flow.redirect, code: body.code });
      return json({ pages: await connectPages(env, { ...flow, userToken: data.access_token }) });
    }
    if (req.method === 'POST' && parts[1] === 'pages') return json({ pages: await connectPages(env, body) });
    if (req.method === 'POST' && parts[1] === 'select') return json(await connectSelect(env, body, owner));
    if (req.method === 'POST' && parts[1] === 'test') return json(await connectStatus(env, true));
    if (req.method === 'DELETE' && parts.length === 1) { await env.SOCIAL.delete(META_KEY); await env.SOCIAL.delete(PENDING_KEY); return json(await connectStatus(env)); }
    throw fail(405, 'طلب مش مدعوم');
  }

  if (parts[0] === 'notify') {
    if (req.method === 'POST' && parts[1] === 'reg') return json(await noteRegistration(req, env));
    const owner = await requireAdmin(req, env);
    if (!isOwner(env, owner)) throw fail(403, 'التنبيهات لصاحب المنصة بس');
    if (req.method === 'GET' && parts.length === 1) return json(await notifyStatus(env));
    if (req.method === 'POST' && parts.length === 1) return json(await saveNotify(env, await req.json().catch(() => ({}))));
    if (req.method === 'POST' && parts[1] === 'test') {
      await sendMail(env, 'تجربة تنبيهات بيت لاهيا تيك ✓', 'وصلك هاد الإيميل من خدمة النشر. يعني التنبيهات شغّالة.\n\nلوحة الإدارة: https://beitlahia.tech/admin', true);
      return json({ ok: true, ...(await notifyStatus(env)) });
    }
    throw fail(405, 'طلب مش مدعوم');
  }

  if (parts[0] === 'library') {
    await requireAdmin(req, env, 'studio');
    if (req.method === 'POST' && parts.length === 1) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body.image !== 'string' || !body.image.startsWith('data:image/jpeg;base64,')) throw fail(400, 'اختار صورة JPEG');
      const { image, name } = body;
      const bytes = jpegFrom(image);
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const id = Array.from(hash, x => x.toString(16).padStart(2, '0')).join('');
      const label = String(name || 'صورة').slice(0, 100);
      await env.SOCIAL.put('library:' + id, image, { metadata: { name: label } });
      return json({ id, name: label });
    }
    if (req.method === 'GET' && parts.length === 1) {
      const page = await env.SOCIAL.list({ prefix: 'library:', limit: 60, cursor: url.searchParams.get('cursor') || undefined });
      return json({ photos: page.keys.map(k => ({ id: k.name.slice(8), name: k.metadata.name })), cursor: page.list_complete ? null : page.cursor });
    }
    if (req.method === 'GET' && /^[a-f0-9]{64}$/.test(parts[1])) {
      const image = await env.SOCIAL.get('library:' + parts[1]);
      if (image) return json({ image });
    }
    throw fail(404, 'الصورة مش موجودة');
  }
  // e-mails to workshop registrants (check-in pass / certificate): see mail.js
  if (parts[0] === 'mail') return handleMail(req, env, parts, { requireAdmin, fail, json });
  // online workshops: the meeting link behind /live (see live.js)
  if (parts[0] === 'live') return handleLive(req, env, parts, { requireAdmin, fail, json });
  if (parts[0] === 'site') return handleSite(req, env, ctx, parts, { requireAdmin, fail, json });

  if (parts[0] !== 'posts') throw fail(404, 'مش موجود');
  const user = await requireAdmin(req, env, 'studio');

  if (req.method === 'GET' && parts.length === 1) return json({ posts: await listPosts(env) });

  if (req.method === 'POST' && parts.length === 1) {
    const body = await req.json().catch(() => null);
    const post = await createPost(env, body, user);
    if (['pending', 'uploading'].includes(post.status)) return json({ post }, 201); // the video comes next (PUT …/video)
    if (!post.scheduledAt) {
      const done = await publishPost(env, post);
      return json({ post: done }, 201);
    }
    return json({ post }, 201);
  }

  const id = parts[1];
  const post = id && (await getPost(env, id));
  if (!post) throw fail(404, 'المنشور مش موجود');

  const owner = isOwner(env, user);
  if (!owner && req.method !== 'GET') {
    const attachment = req.method === 'PUT' && ['video', 'design', 'page'].includes(parts[2]);
    const mine = post.preparedBy === user.uid || (!post.preparedBy && post.createdBy === (user.email || user.uid));
    if (!attachment || !mine || !['pending', 'uploading'].includes(post.status)) {
      throw fail(403, 'الموافقة وتعديل المنشورات الجاهزة للنشر لصاحب المنصة بس');
    }
  }
  if (req.method === 'GET' && parts[2] === 'stats') return json(await postStats(env, post));
  if (req.method === 'POST' && parts[2] === 'approve') {
    if (post.status !== 'pending') throw fail(409, 'المنشور مش بانتظار الموافقة');
    // An approval is a receipt. Double clicks and retried requests cannot publish a second copy.
    const approvedAt = new Date().toISOString();
    await env.SOCIAL.put('approval:' + id, approvedAt, { expirationTtl: post.keepFor || 120 * 86400 });
    return json({ post: { ...post, status: 'approved', approvedAt } });
  }

  if (req.method === 'PATCH' && parts.length === 2) {
    if (post.status !== 'scheduled') throw fail(409, 'بس المنشور المجدول بينقل لموعد ثاني');
    const body = await req.json().catch(() => ({}));
    const t = Date.parse(body.scheduledAt);
    if (Number.isNaN(t)) throw fail(400, 'موعد النشر مش صالح');
    if (t < Date.now() + 60e3) throw fail(400, 'الموعد لازم يكون بالمستقبل');
    if (t > Date.now() + MAX_AHEAD) throw fail(400, 'ما بنقدر نجدول لأبعد من 75 يوم');
    post.scheduledAt = new Date(t).toISOString();
    await savePost(env, post);
    return json({ post });
  }

  // the editable design (studio JSON), kept so a post can be opened again in the editor
  if (req.method === 'PUT' && parts[2] === 'design') {
    if (Number(req.headers.get('Content-Length') || 0) > MAX_DESIGN) throw fail(400, 'التصميم كبير كتير');
    const text = await req.text();
    if (text.length > MAX_DESIGN || !text.startsWith('{')) throw fail(400, 'التصميم مش صالح');
    await env.SOCIAL.put(`des:${post.id}`, text, { expirationTtl: post.keepFor || 120 * 86400 });
    if (!post.preparedBy && !post.hasDesign) { post.hasDesign = true; await savePost(env, post); }
    return json({ ok: true, post });
  }
  if (req.method === 'GET' && parts[2] === 'design') {
    const text = await env.SOCIAL.get(`des:${post.id}`);
    if (!text) throw fail(404, 'ما في تصميم محفوظ لهالمنشور');
    return new Response(text, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  }

  // edit a scheduled post: new picture (+ caption / time); a video, if any, follows with PUT …/video
  if (req.method === 'PUT' && parts.length === 2) {
    if (post.status !== 'scheduled') throw fail(409, 'بس المنشور المجدول بيتعدّل. المنتشر ما بينعدّل، انشر نسخة جديدة منه.');
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') throw fail(400, 'الطلب فاضي');
    const bytes = jpegFrom(body.image);
    const caption = typeof body.caption === 'string' ? body.caption.trim() : post.caption;
    if (caption.length > MAX_CAPTION) throw fail(400, `النص أطول من ${MAX_CAPTION} حرف`);
    if (body.scheduledAt) {
      const t = Date.parse(body.scheduledAt);
      if (Number.isNaN(t) || t < Date.now() + 60e3) throw fail(400, 'الموعد لازم يكون بالمستقبل');
      if (t > Date.now() + MAX_AHEAD) throw fail(400, 'ما بنقدر نجدول لأبعد من 75 يوم');
      post.scheduledAt = new Date(t).toISOString();
    }
    post.keepFor = Math.ceil(Math.max(0, Date.parse(post.scheduledAt) - Date.now()) / 1000 + 120 * 86400);
    await env.SOCIAL.put(`img:${post.id}`, bytes, { expirationTtl: post.keepFor });
    await env.SOCIAL.delete(`vid:${post.id}`);
    post.caption = post.story ? '' : caption;
    if (typeof body.title === 'string' && body.title.trim()) post.title = body.title.slice(0, 120);
    post.video = body.video === true;
    post.duration = post.video ? Math.max(0, Math.min(90, Number(body.duration) || 0)) : 0;
    post.music = post.video ? String(body.music || '').slice(0, 120) : '';
    await dropPages(env, post);
    post.pages = pageCountOf(body, post.video);
    post.captions = captionsOf(body, post.pages, post.story);
    post.got = [];
    post.status = post.video || post.pages > 1 ? 'uploading' : 'scheduled';
    post.results = {};
    post.done = {};
    post.editedAt = new Date().toISOString();
    await savePost(env, post);
    return json({ post });
  }

  if (req.method === 'PUT' && parts[2] === 'video') {
    if (post.status !== 'uploading') throw fail(409, 'الفيديو انرفع من قبل');
    if (Number(req.headers.get('Content-Length') || 0) > MAX_VIDEO) throw fail(400, 'الفيديو أكبر من 24MB. قصّر مدة الموسيقى.');
    const buf = await req.arrayBuffer();
    const head = new Uint8Array(buf, 0, Math.min(12, buf.byteLength));
    if (buf.byteLength < 1000 || String.fromCharCode(...head.slice(4, 8)) !== 'ftyp') throw fail(400, 'لازم الفيديو يكون MP4');
    if (buf.byteLength > MAX_VIDEO) throw fail(400, 'الفيديو أكبر من 24MB. قصّر مدة الموسيقى.');
    await env.SOCIAL.put(`vid:${post.id}`, buf, { expirationTtl: post.keepFor || 120 * 86400 });
    return json({ post: await uploaded(env, post) });
  }

  // page n of a carousel / multi-page story (page 1 came with the post)
  if (req.method === 'PUT' && parts[2] === 'page') {
    const n = Number(parts[3]);
    if (post.status !== 'uploading') throw fail(409, 'الصفحات انرفعت من قبل');
    if (!Number.isInteger(n) || n < 2 || n > (post.pages || 1)) throw fail(400, 'رقم الصفحة مش صالح');
    if (Number(req.headers.get('Content-Length') || 0) > MAX_IMAGE) throw fail(400, 'الصورة أكبر من 8MB');
    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw fail(400, 'لازم الصورة تكون JPEG');
    if (bytes.length > MAX_IMAGE) throw fail(400, 'الصورة أكبر من 8MB');
    await env.SOCIAL.put(`img:${post.id}-p${n}`, bytes, { expirationTtl: post.keepFor || 120 * 86400 });
    post.got = [...new Set([...(post.got || []), n])].sort((a, b) => a - b);
    const all = post.got.length >= (post.pages || 1) - 1;
    if (!all) { await savePost(env, post); return json({ post }); }
    return json({ post: await uploaded(env, post) });
  }

  if (req.method === 'POST' && parts[2] === 'publish') {
    if (post.status === 'uploading') throw fail(409, 'الفيديو لسا ما انرفع');
    if (post.status === 'pending') throw fail(409, 'المنشور بحاجة لموافقة');
    if (post.status === 'published' || post.status === 'publishing') throw fail(409, 'المنشور انتشر أو عم ينتشر هلّق');
    return json({ post: await publishPost(env, post) });
  }
  if (req.method === 'DELETE' && parts.length === 2) {
    if (post.status === 'published' || post.status === 'partial' || post.status === 'publishing') {
      throw fail(409, 'ما بنقدر نحذف منشور انتشر. احذفه من فيسبوك أو إنستغرام نفسهم.');
    }
    await env.SOCIAL.delete(`post:${id}`);
    await env.SOCIAL.delete(`img:${id}`);
    await env.SOCIAL.delete(`vid:${id}`);
    await env.SOCIAL.delete(`des:${id}`);
    await env.SOCIAL.delete('approval:' + id);
    await dropPages(env, post);
    return json({ ok: true });
  }
  throw fail(405, 'طلب مش مدعوم');
}

/* ---------------- posts ---------------- */
// how many pictures: 1 (default) or 2…10 (carousel / stories in a row); music goes with one page only
function pageCountOf(body, video) {
  const n = body.pages == null ? 1 : Number(body.pages);
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGES) throw fail(400, `عدد الصفحات لازم يكون من 1 لـ ${MAX_PAGES}`);
  if (n > 1 && video) throw fail(400, 'الموسيقى بتشتغل مع صفحة وحدة بس');
  return n;
}
// a carousel's own caption under each picture (Facebook shows it when the picture is opened; an
// Instagram carousel takes one text only, the post's). [] when there are none.
const MAX_PIC_CAPTION = 500;
function captionsOf(body, pages, story) {
  if (story || pages < 2 || !Array.isArray(body.captions)) return [];
  const list = body.captions.slice(0, pages).map((c) => (typeof c === 'string' ? c.trim().slice(0, MAX_PIC_CAPTION) : ''));
  return list.some(Boolean) ? list : [];
}
async function dropPages(env, post) {
  for (let k = 2; k <= MAX_PAGES; k++) await env.SOCIAL.delete(`img:${post.id}-p${k}`);
}
// everything a post needs is uploaded: wait for approval, wait for its time, or go out now
async function uploaded(env, post) {
  if (post.preparedBy && !post.approvedAt) { post.status = 'pending'; await savePost(env, post); return post; }
  if (post.scheduledAt && Date.parse(post.scheduledAt) > Date.now()) { post.status = 'scheduled'; await savePost(env, post); return post; }
  return publishPost(env, post);
}
const imageUrls = (base, post) => [`${base}/img/${post.id}.jpg`,
  ...Array.from({ length: Math.max(0, (post.pages || 1) - 1) }, (_, i) => `${base}/img/${post.id}-p${i + 2}.jpg`)];

function jpegFrom(image) {
  const b64 = typeof image === 'string' ? image.replace(/^data:image\/jpeg;base64,/, '') : '';
  let bytes;
  try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); } catch { throw fail(400, 'الصورة مش صالحة'); }
  if (bytes.length < 1000 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw fail(400, 'لازم الصورة تكون JPEG');
  if (bytes.length > MAX_IMAGE) throw fail(400, 'الصورة أكبر من 8MB');
  return bytes;
}

// site/approvals.social (the owner's switch in the admin panel › الإعدادات): false = other admins publish without
// waiting for the owner. No document / no answer = true (wait), the safe side.
async function socialNeedsOk(env) {
  try {
    const r = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/site/approvals`);
    if (r.status === 404) return true;
    if (!r.ok) return true;
    const v = (await r.json()).fields?.social;
    return v ? v.booleanValue !== false : true;
  } catch { return true; }
}

async function createPost(env, body, user) {
  if (!body || typeof body !== 'object') throw fail(400, 'الطلب فاضي');
  const platforms = Array.isArray(body.platforms) ? [...new Set(body.platforms)].filter((p) => PLATFORMS.includes(p)) : [];
  if (!platforms.length) throw fail(400, 'اختار فيسبوك أو إنستغرام أو الاثنين');
  const conn = await connected(env);
  const missing = platforms.filter((p) => !conn[p]);
  if (missing.length) throw fail(400, `${missing.map(nameOf).join(' و')} مش مربوط بخدمة النشر لسا`);

  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  if (caption.length > MAX_CAPTION) throw fail(400, `النص أطول من ${MAX_CAPTION} حرف`);

  const bytes = jpegFrom(body.image);

  // optional: the same design as an MP4 with music. It comes in a second request (PUT /posts/:id/video,
  // raw bytes): decoding megabytes of base64 here would blow the Worker's CPU budget.
  const video = body.video === true;
  const duration = video ? Math.max(0, Math.min(90, Number(body.duration) || 0)) : 0;
  const pages = pageCountOf(body, video);

  let scheduledAt = null;
  if (body.scheduledAt) {
    const t = Date.parse(body.scheduledAt);
    if (Number.isNaN(t)) throw fail(400, 'موعد النشر مش صالح');
    if (t > Date.now() + 60e3) {
      if (t > Date.now() + MAX_AHEAD) throw fail(400, 'ما بنقدر نجدول لأبعد من 75 يوم');
      scheduledAt = new Date(t).toISOString();
    }
  }

  // the owner, or anyone when the owner switched approval off for social media, publishes without waiting
  const direct = isOwner(env, user) || !(await socialNeedsOk(env));
  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const post = {
    id,
    template: String(body.template || '').slice(0, 40),
    title: String(body.title || '').slice(0, 120),
    caption,
    platforms,
    story: body.story === true,
    video,
    duration,
    music: video ? String(body.music || '').slice(0, 120) : '',
    pages,
    captions: captionsOf(body, pages, body.story === true),
    preparedBy: direct ? null : user.uid,
    status: video || pages > 1 ? 'uploading' : !direct ? 'pending' : scheduledAt ? 'scheduled' : 'publishing',
    scheduledAt,
    createdAt: new Date().toISOString(),
    createdBy: user.email || user.uid,
    results: {},
  };
  const keepFor = Math.max(0, (scheduledAt ? Date.parse(scheduledAt) : Date.now()) - Date.now()) / 1000 + 120 * 86400;
  await env.SOCIAL.put(`img:${id}`, bytes, { expirationTtl: Math.ceil(keepFor) });
  post.keepFor = Math.ceil(keepFor);
  await savePost(env, post);
  return post;
}

async function postStats(env, post) {
  if (!['partial', 'published'].includes(post.status)) throw fail(409, 'الإحصائيات بتظهر بعد النشر');
  const meta = await getMeta(env);
  const token = meta?.pageToken;
  if (!token) throw fail(409, 'اربط حساب ميتا لعرض الأرقام');
  const rows = {};
  const issues = [];
  // which permission each number needs (when the saved connection doesn't have it, say so instead of a bare «#10»)
  const NEED = { likes: 'pages_read_user_content', comments: 'pages_read_user_content', fbreach: 'read_insights', igreach: 'instagram_manage_insights' };
  const granted = meta.scopes || [];
  for (const platform of post.platforms) {
    const result = post.results?.[platform];
    if (!result?.id) continue;
    const row = rows[platform] = { likes: null, comments: null, reach: null };
    const fb = platform === 'facebook';
    if (fb && result.story) continue;
    const read = async (metric, path, params) => {
      try { return await graphGet(env, path, { ...params, access_token: token }); }
      catch (e) {
        const need = NEED[metric === 'reach' ? (fb ? 'fbreach' : 'igreach') : metric] || null;
        issues.push({ platform, metric, code: e.graphCode ?? null, need: e.graphCode === 10 && need ? need : null });
        return null;
      }
    };
    const [counts, comments, insights] = await Promise.all([
      fb ? read('likes', result.id + '/reactions', { type: 'LIKE', limit: 0, summary: 'total_count' })
        : read('engagement', result.id, { fields: 'like_count,comments_count' }),
      fb ? read('comments', result.id + '/comments', { limit: 0, summary: 'true' }) : null,
      read('reach', result.id + '/insights', { metric: fb ? 'post_total_media_view_unique' : 'reach' }),
    ]);
    row.likes = (fb ? counts?.summary?.total_count : counts?.like_count) ?? null;
    row.comments = (fb ? comments?.summary?.total_count : counts?.comments_count) ?? null;
    row.reach = insights?.data?.[0]?.values?.[0]?.value ?? insights?.data?.[0]?.total_value?.value ?? null;
    // without read_insights Meta answers Facebook insights with an empty list, not an error
    if (fb && insights && row.reach === null && granted.length && !granted.includes('read_insights')) {
      issues.push({ platform, metric: 'reach', code: 10, need: 'read_insights' });
    }
  }
  const missing = granted.length ? STATS_SCOPES.filter(x => !granted.includes(x)) : [];
  return { rows, issues, missing };
}

async function savePost(env, post) {
  await env.SOCIAL.put(`post:${post.id}`, JSON.stringify(post), {
    metadata: { s: post.status, at: post.scheduledAt ? Date.parse(post.scheduledAt) : 0, c: Date.parse(post.createdAt) },
  });
}
const getPost = (env, id) => (/^[a-z0-9-]{6,40}$/.test(id) ? env.SOCIAL.get(`post:${id}`, 'json') : null);

async function listPosts(env, limit = 60) {
  const keys = await allKeys(env);
  keys.sort((a, b) => (b.metadata?.c || 0) - (a.metadata?.c || 0));
  const visible = keys.filter((key, i) => i < limit || key.metadata?.s === 'pending');
  const posts = await Promise.all(visible.map((k) => env.SOCIAL.get(k.name, 'json')));
  return Promise.all(posts.filter(Boolean).map(async post => {
    if (post.status !== 'pending') return post;
    const approvedAt = await env.SOCIAL.get('approval:' + post.id);
    return approvedAt ? { ...post, approvedAt, status: 'approved' } : post;
  }));
}
async function allKeys(env, prefix = 'post:') {
  const out = [];
  let cursor;
  do {
    const page = await env.SOCIAL.list({ prefix, cursor });
    out.push(...page.keys);
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return out;
}

// cron: publish every scheduled post whose time has come
export async function runDue(env) {
  const now = Date.now();
  const keys = await allKeys(env);
  // Only cron releases approved submissions. The approval endpoint never starts a second publisher.
  const receipts = await allKeys(env, 'approval:');
  const due = keys.filter((k) => k.metadata?.s === 'scheduled' && k.metadata.at <= now);
  for (const k of due) {
    const post = await env.SOCIAL.get(k.name, 'json');
    if (post && post.status === 'scheduled') {
      const done = await publishPost(env, post);
      if (done.status === 'failed' || done.status === 'partial') await alertFailed(env, done).catch((e) => console.error('[notify]', e));
    }
  }
  let released = 0;
  for (const receipt of receipts) {
    const post = await getPost(env, receipt.name.slice('approval:'.length));
    if (!post || post.status !== 'pending') continue;
    post.approvedAt = await env.SOCIAL.get(receipt.name);
    if (!post.approvedAt) continue;
    if (Date.parse(post.scheduledAt) > now) {
      post.status = 'scheduled';
      await savePost(env, post);
    } else {
      const done = await publishPost(env, post);
      if (['failed', 'partial'].includes(done.status)) await alertFailed(env, done).catch(e => console.error('[notify]', e));
    }
    await env.SOCIAL.delete(receipt.name);
    released++;
  }
  return due.length + released;
}

/* ---------------- the Meta connection ---------------- */
const META_KEY = 'config:meta';
const PENDING_KEY = 'config:pending';
export const SCOPES_NEEDED = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'];
// only for the numbers under each post: Facebook likes and comments are «user content» on the page
// (pages_read_user_content), Facebook reach is read_insights, Instagram reach is instagram_manage_insights
export const STATS_SCOPES = ['pages_read_user_content', 'read_insights', 'instagram_manage_insights'];

// saved from the admin panel (KV) — or, for a manual setup, from the Worker's variables/secrets
async function getMeta(env) {
  const saved = await env.SOCIAL.get(META_KEY, 'json');
  if (saved && saved.pageToken) return { ...saved, source: 'platform' };
  if (env.META_PAGE_TOKEN && (env.FB_PAGE_ID || env.IG_USER_ID)) {
    return { pageToken: env.META_PAGE_TOKEN, pageId: env.FB_PAGE_ID || '', igId: env.IG_USER_ID || '', source: 'env' };
  }
  return null;
}
async function connected(env) {
  const m = await getMeta(env);
  return { facebook: !!(m && m.pageToken && m.pageId), instagram: !!(m && m.pageToken && m.igId) };
}
const isOwner = (env, user) => !!env.OWNER_EMAIL && (user.email || '').toLowerCase() === env.OWNER_EMAIL.toLowerCase();

async function graphGet(env, path, params) {
  const res = await fetch(`${graph(env)}/${path}?${new URLSearchParams(params)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const error = fail(400, `ميتا: ${data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`}`);
    error.graphCode = data.error?.code;
    throw error;
  }
  return data;
}

async function connectPages(env, body) {
  const appId = String(body?.appId || '').trim();
  const appSecret = String(body?.appSecret || '').trim();
  const userToken = String(body?.userToken || '').trim();
  if (!/^\d{5,25}$/.test(appId)) throw fail(400, 'الـ App ID لازم يكون أرقام بس (من إعدادات التطبيق › Basic)');
  if (!/^[a-f0-9]{32}$/i.test(appSecret)) throw fail(400, 'الـ App Secret مش صحيح (32 حرف ورقم، من إعدادات التطبيق › Basic)');
  if (userToken.length < 30) throw fail(400, 'الصق التوكن كامل من Graph API Explorer');
  // a token from the Explorer lasts ~1 hour: swap it for a long-lived one (pages derived from it don't expire)
  const ex = await graphGet(env, 'oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: userToken });
  const token = ex.access_token;
  const FIELDS = 'id,name,access_token,instagram_business_account{id,username}';
  const found = new Map();
  const keep = (p) => {
    if (!p || !p.id || !p.access_token || found.has(String(p.id))) return;
    found.set(String(p.id), {
      id: String(p.id), name: p.name || '', token: p.access_token,
      ig: p.instagram_business_account ? { id: String(p.instagram_business_account.id), username: p.instagram_business_account.username || '' } : null,
    });
  };
  const pages = await graphGet(env, 'me/accounts', { fields: FIELDS, limit: '100', access_token: token });
  (pages.data || []).forEach(keep);

  // me/accounts can come back empty: when the pages were granted one by one (Facebook Login for Business
  // asks «only the current pages»), or when the page belongs to a business portfolio. The token itself
  // says which pages and businesses were chosen, so ask for those directly.
  let granted = { scopes: [], targets: {} };
  if (!found.size) {
    try {
      const d = (await graphGet(env, 'debug_token', { input_token: token, access_token: `${appId}|${appSecret}` })).data || {};
      granted = { scopes: d.scopes || [], targets: Object.fromEntries((d.granular_scopes || []).map((g) => [g.scope, (g.target_ids || []).map(String)])) };
    } catch { /* keep going with what we have */ }
    const pageIds = new Set([...(granted.targets.pages_show_list || []), ...(granted.targets.pages_manage_posts || []), ...(granted.targets.pages_read_engagement || [])]);
    for (const id of [...pageIds].slice(0, 25)) {
      try { keep(await graphGet(env, id, { fields: FIELDS, access_token: token })); } catch { /* not a page we can manage */ }
    }
    for (const biz of (granted.targets.business_management || []).slice(0, 10)) {
      try { (await graphGet(env, `${biz}/owned_pages`, { fields: FIELDS, limit: '100', access_token: token })).data?.forEach(keep); } catch { /* no access */ }
      try { (await graphGet(env, `${biz}/client_pages`, { fields: FIELDS, limit: '100', access_token: token })).data?.forEach(keep); } catch { /* no access */ }
    }
  }
  const list = [...found.values()];
  if (!list.length) {
    const missing = SCOPES_NEEDED.filter((s) => granted.scopes.length && !granted.scopes.includes(s));
    throw fail(400, missing.length
      ? `التوكن ناقصه صلاحيات: ${missing.join('، ')}. ضيفهم بـ Graph API Explorer واعمل توكن جديد.`
      : 'ما لقينا صفحات فيسبوك بهاد الحساب. تأكد إنك أدمن على الصفحة، وإنك اخترت الصفحة بنافذة الصلاحيات وأنت بتعمل التوكن.');
  }
  await env.SOCIAL.put(PENDING_KEY, JSON.stringify({ appId, appSecret, pages: list }), { expirationTtl: 1800 });
  return list.map(({ token, ...p }) => p);
}

async function connectSelect(env, body, user) {
  const pending = await env.SOCIAL.get(PENDING_KEY, 'json');
  if (!pending) throw fail(400, 'انتهت مهلة الربط (30 دقيقة). ابدأ من جديد.');
  const page = pending.pages.find((p) => p.id === String(body?.pageId || ''));
  if (!page) throw fail(400, 'اختار صفحة من القائمة');
  const info = await inspectToken(env, pending.appId, pending.appSecret, page.token);
  if (!info.valid) throw fail(400, 'ميتا بتقول التوكن مش صالح. اعمل توكن جديد وجرّب.');
  await env.SOCIAL.put(META_KEY, JSON.stringify({
    pageId: page.id, pageName: page.name, pageToken: page.token,
    igId: page.ig?.id || '', igUsername: page.ig?.username || '',
    appId: pending.appId, appSecret: pending.appSecret,
    scopes: info.scopes, expiresAt: info.expiresAt,
    connectedAt: new Date().toISOString(), connectedBy: user.email || user.uid,
  }));
  await env.SOCIAL.delete(PENDING_KEY);
  return connectStatus(env);
}

async function inspectToken(env, appId, appSecret, token) {
  try {
    const d = (await graphGet(env, 'debug_token', { input_token: token, access_token: `${appId}|${appSecret}` })).data || {};
    return { valid: d.is_valid !== false, scopes: d.scopes || [], expiresAt: d.expires_at ? d.expires_at * 1000 : 0 };
  } catch {
    return { valid: true, scopes: [], expiresAt: 0, unknown: true }; // couldn't check: don't block
  }
}

async function connectStatus(env, check = false) {
  const m = await getMeta(env);
  if (!m) return { connected: false };
  const out = {
    connected: true, source: m.source,
    page: m.pageId ? { id: m.pageId, name: m.pageName || '' } : null,
    instagram: m.igId ? { id: m.igId, username: m.igUsername || '' } : null,
    connectedAt: m.connectedAt || null, connectedBy: m.connectedBy || '',
    expiresAt: m.expiresAt || 0,
    missingInsightScopes: m.scopes?.length ? STATS_SCOPES.filter(x => !m.scopes.includes(x)) : [],
    missingScopes: m.scopes && m.scopes.length ? SCOPES_NEEDED.filter((x) => !m.scopes.includes(x)) : [],
  };
  if (check) {
    try {
      const p = await graphGet(env, m.pageId || 'me', { fields: 'name', access_token: m.pageToken });
      out.check = { ok: true, name: p.name || '' };
      if (m.appId && m.appSecret) {
        const info = await inspectToken(env, m.appId, m.appSecret, m.pageToken);
        if (!info.valid) out.check = { ok: false, error: 'التوكن انتهى أو انسحب. اربط من جديد.' };
        if (info.scopes.length) out.missingScopes = SCOPES_NEEDED.filter((x) => !info.scopes.includes(x));
      }
    } catch (e) { out.check = { ok: false, error: e.message }; }
  }
  return out;
}

/* ---------------- e-mail alerts (Cloudflare Email Routing › send_email) ---------------- */
// Sent from MAIL_FROM (on beitlahia.tech) to the owner, or to the address saved in the panel. Cloudflare only
// delivers to addresses verified under Email Routing › Destination addresses (the Gmail that info@ forwards to is).
const NOTIFY_KEY = 'config:notify';
const NOTIFY_DEFAULT = { failed: true, conn: true, digest: true, to: '' };
async function getNotify(env) { return { ...NOTIFY_DEFAULT, ...((await env.SOCIAL.get(NOTIFY_KEY, 'json')) || {}) }; }
async function notifyStatus(env) {
  const n = await getNotify(env);
  return { ...n, to: n.to || env.OWNER_EMAIL || '', mail: !!env.MAIL, from: mailFrom(env), last: await env.SOCIAL.get('notify:last', 'json') };
}
async function saveNotify(env, b) {
  const to = String(b?.to || '').trim().toLowerCase();
  if (to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw fail(400, 'الإيميل مش صحيح');
  await env.SOCIAL.put(NOTIFY_KEY, JSON.stringify({ failed: b?.failed !== false, conn: b?.conn !== false, digest: b?.digest !== false, to }));
  return notifyStatus(env);
}
const mailFrom = (env) => env.MAIL_FROM || 'notify@beitlahia.tech';
const b64 = (s) => { let bin = ''; new TextEncoder().encode(s).forEach((c) => { bin += String.fromCharCode(c); }); return btoa(bin); };
let EmailMessageCls;
async function emailMessage(from, to, raw) {
  if (EmailMessageCls === undefined) { try { ({ EmailMessage: EmailMessageCls } = await import('cloudflare:email')); } catch { EmailMessageCls = null; } }
  return EmailMessageCls ? new EmailMessageCls(from, to, raw) : { from, to, raw }; // plain object: tests / local dev
}
export async function sendMail(env, subject, text, throwOnError = false) {
  const n = await getNotify(env);
  const to = n.to || env.OWNER_EMAIL;
  if (!env.MAIL || !to) {
    if (throwOnError) throw fail(400, 'إرسال الإيميل مش مفعّل بخدمة النشر (send_email بـ wrangler.toml).');
    return false;
  }
  const from = mailFrom(env);
  const raw = [
    `From: Beit Lahia Tech <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${b64(subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@beitlahia.tech>`, `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    b64(text).replace(/.{76}/g, '$&\r\n'),
  ].join('\r\n');
  try {
    await env.MAIL.send(await emailMessage(from, to, raw));
    await env.SOCIAL.put('notify:last', JSON.stringify({ at: new Date().toISOString(), subject, ok: true }));
    return true;
  } catch (e) {
    const msg = String(e.message || e).slice(0, 200);
    await env.SOCIAL.put('notify:last', JSON.stringify({ at: new Date().toISOString(), subject, ok: false, error: msg }));
    if (throwOnError) throw fail(400, `ما وصل الإيميل (${msg}). تأكد إنه ${to} متحقق منه بـ Cloudflare › Email Routing › Destination addresses.`);
    return false;
  }
}

async function alertFailed(env, post) {
  if (!(await getNotify(env)).failed) return;
  const lines = post.platforms.map((p) => `• ${nameOf(p)}: ${post.results?.[p]?.id ? 'انتشر ✓' : `فشل: ${post.results?.[p]?.error || 'خطأ مش معروف'}`}`);
  await sendMail(env, `منشور مجدول ما انتشر: ${post.title || 'بدون عنوان'}`,
    `المنشور المجدول «${post.title || 'بدون عنوان'}»${post.story ? ' (ستوري)' : ''} ${post.status === 'partial' ? 'انتشر على منصة وحدة بس' : 'ما انتشر'}:\n${lines.join('\n')}\n\n`
    + 'افتح استوديو السوشيال وكبس «جرّب كمان مرة» جنبه:\nhttps://beitlahia.tech/admin#studio');
}

// Gaza's calendar day and hour (the cron runs in UTC)
export function gazaClock(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}

// once a day: check the Meta connection (morning) and send the registrations digest (evening)
export async function dailyJobs(env, now = new Date()) {
  if (!env.MAIL) return;
  const n = await getNotify(env);
  const { day, hour } = gazaClock(now);
  const key = `notify:done:${day}`;
  const done = (await env.SOCIAL.get(key, 'json')) || {};
  const todo = { conn: n.conn && !done.conn && hour >= 9, digest: n.digest && !done.digest && hour >= 20 };
  if (!todo.conn && !todo.digest) return;
  await env.SOCIAL.put(key, JSON.stringify({ ...done, ...(todo.conn ? { conn: true } : {}), ...(todo.digest ? { digest: true } : {}) }), { expirationTtl: 3 * 86400 });
  if (todo.conn) {
    const st = await connectStatus(env, true);
    const problem = !st.connected ? '' : st.check && !st.check.ok ? st.check.error : st.missingScopes?.length ? `ناقص صلاحيات: ${st.missingScopes.join('، ')}` : '';
    if (problem) {
      await sendMail(env, 'ربط فيسبوك وإنستغرام فيه مشكلة',
        `فحص الربط اليومي لقى مشكلة:\n${problem}\n\nالمنشورات المجدولة ممكن ما تنتشر لحد ما تصلّحها. من استوديو السوشيال › «ربط فيسبوك وإنستغرام» › «ربط من جديد»:\nhttps://beitlahia.tech/admin#studio`);
    }
  }
  if (todo.digest) {
    const list = (await env.SOCIAL.get(`digest:${day}`, 'json')) || [];
    if (list.length) {
      const members = list.filter((x) => x.k === 'member'); const ws = list.filter((x) => x.k === 'workshop');
      const names = list.slice(0, 40).map((x) => `- ${x.n || 'بدون اسم'}${x.k === 'workshop' ? ` (ورشة${x.w ? `: ${x.w}` : ''})` : ' (عضو جديد)'}`);
      await sendMail(env, `${list.length} تسجيل جديد اليوم`,
        `وصل اليوم ${day}:\n• أعضاء جدد بالمجتمع: ${members.length}\n• تسجيلات بالورشات: ${ws.length}\n\n${names.join('\n')}${list.length > 40 ? `\n… و${list.length - 40} كمان` : ''}\n\n`
        + 'التفاصيل الكاملة بلوحة الإدارة:\nhttps://beitlahia.tech/admin');
    }
  }
}

// the site's forms tell us about a new registration (no personal data beyond the name; capped per visitor)
async function noteRegistration(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim());
  if (!allowed.includes(origin)) throw fail(403, 'مش مسموح');
  const b = JSON.parse(await req.text().catch(() => '{}') || '{}');
  const k = b.kind === 'workshop' ? 'workshop' : b.kind === 'member' ? 'member' : '';
  if (!k) throw fail(400, 'نوع مش معروف');
  const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const ipHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(req.headers.get('CF-Connecting-IP') || 'local')))]
    .slice(0, 4).map((x) => x.toString(16).padStart(2, '0')).join('');
  const key = `digest:${gazaClock().day}`;
  const list = (await env.SOCIAL.get(key, 'json')) || [];
  if (list.length >= 300 || list.filter((x) => x.i === ipHash).length >= 20) return { ok: true }; // quietly ignore floods
  list.push({ k, n: clean(b.name, 60), w: clean(b.workshop, 80), i: ipHash, t: Date.now() });
  await env.SOCIAL.put(key, JSON.stringify(list), { expirationTtl: 3 * 86400 });
  return { ok: true };
}

/* ---------------- Meta Graph API ---------------- */
const nameOf = (p) => (p === 'facebook' ? 'فيسبوك' : 'إنستغرام');
const graph = (env) => `https://graph.facebook.com/${env.GRAPH_VERSION || 'v23.0'}`;

async function graphCall(env, path, params, method = 'POST', token = '') {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = method === 'GET'
    ? await fetch(`${graph(env)}/${path}?${body}`)
    : await fetch(`${graph(env)}/${path}`, { method, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.error?.error_user_msg || data.error?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function publishPost(env, post) {
  post.status = 'publishing';
  await savePost(env, post);
  const meta = (await getMeta(env)) || {};
  const tk = meta.pageToken || '';
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const imageUrl = `${base}/img/${post.id}.jpg`;
  const urls = imageUrls(base, post);
  const videoUrl = post.video ? `${base}/vid/${post.id}.mp4` : '';
  const results = post.results || {};

  for (const p of post.platforms) {
    if (results[p]?.id) continue; // already out (retry only does what failed)
    try {
      if (p === 'facebook') {
        if (!meta.pageId) throw new Error('فيسبوك مش مربوط');
        results.facebook = { ...(urls.length > 1 ? await facebookPages(env, meta, post, urls) : await publishFacebook(env, meta, post, imageUrl, videoUrl)), at: new Date().toISOString() };
      } else {
        if (!meta.igId) throw new Error('إنستغرام مش مربوط');
        if (urls.length > 1) {
          results.instagram = { ...(await instagramPages(env, meta, post, urls)), at: new Date().toISOString() };
          continue;
        }
        const params = post.story
          ? (videoUrl ? { video_url: videoUrl, media_type: 'STORIES' } : { image_url: imageUrl, media_type: 'STORIES' })
          : (videoUrl ? { video_url: videoUrl, media_type: 'REELS', caption: post.caption, share_to_feed: 'true' } : { image_url: imageUrl, caption: post.caption });
        const container = await graphCall(env, `${meta.igId}/media`, params, 'POST', tk);
        await waitForContainer(env, container.id, tk, !!videoUrl);
        const r = await graphCall(env, `${meta.igId}/media_publish`, { creation_id: container.id }, 'POST', tk);
        let permalink = '';
        try { permalink = (await graphCall(env, r.id, { fields: 'permalink' }, 'GET', tk)).permalink || ''; } catch { /* optional */ }
        results.instagram = { id: r.id, permalink, at: new Date().toISOString() };
      }
    } catch (e) {
      results[p] = { error: String(e.message || e).slice(0, 300), at: new Date().toISOString() };
    }
  }

  const ok = post.platforms.filter((p) => results[p]?.id).length;
  post.results = results;
  post.status = ok === post.platforms.length ? 'published' : ok ? 'partial' : 'failed';
  post.publishedAt = ok ? new Date().toISOString() : post.publishedAt || null;
  await savePost(env, post);
  return post;
}

// several pictures. Post: they go up unpublished, then one feed post holds them all (Facebook's
// multi-photo post). Story: one photo story per page, in order; the ones already out are remembered
// (post.done) so a retry only adds the missing ones.
async function facebookPages(env, meta, post, urls) {
  const tk = meta.pageToken; const page = meta.pageId;
  if (!post.story) {
    const ids = [];
    for (const [k, url] of urls.entries()) {
      const caption = post.captions?.[k] || '';
      ids.push((await graphCall(env, `${page}/photos`, { url, published: 'false', ...(caption ? { caption } : {}) }, 'POST', tk)).id);
    }
    const media = Object.fromEntries(ids.map((id, i) => [`attached_media[${i}]`, JSON.stringify({ media_fbid: id })]));
    const r = await graphCall(env, `${page}/feed`, { message: post.caption, ...media }, 'POST', tk);
    return { id: r.id, pages: urls.length };
  }
  const done = (post.done ||= {}).facebook ||= [];
  for (let i = done.length; i < urls.length; i++) {
    const ph = await graphCall(env, `${page}/photos`, { url: urls[i], published: 'false' }, 'POST', tk);
    const r = await graphCall(env, `${page}/photo_stories`, { photo_id: ph.id }, 'POST', tk);
    done.push(r.post_id || ph.id);
    await savePost(env, post);
  }
  return { id: done[0], ids: done, story: true, pages: urls.length };
}
// Instagram: a carousel (an item container per picture, then one CAROUSEL container), or stories in a row
async function instagramPages(env, meta, post, urls) {
  const tk = meta.pageToken; const ig = meta.igId;
  if (!post.story) {
    const children = [];
    for (const url of urls) {
      const c = await graphCall(env, `${ig}/media`, { image_url: url, is_carousel_item: 'true' }, 'POST', tk);
      await waitForContainer(env, c.id, tk);
      children.push(c.id);
    }
    const box = await graphCall(env, `${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption: post.caption }, 'POST', tk);
    await waitForContainer(env, box.id, tk);
    const r = await graphCall(env, `${ig}/media_publish`, { creation_id: box.id }, 'POST', tk);
    let permalink = '';
    try { permalink = (await graphCall(env, r.id, { fields: 'permalink' }, 'GET', tk)).permalink || ''; } catch { /* optional */ }
    return { id: r.id, permalink, pages: urls.length };
  }
  const done = (post.done ||= {}).instagram ||= [];
  for (let i = done.length; i < urls.length; i++) {
    const c = await graphCall(env, `${ig}/media`, { image_url: urls[i], media_type: 'STORIES' }, 'POST', tk);
    await waitForContainer(env, c.id, tk);
    done.push((await graphCall(env, `${ig}/media_publish`, { creation_id: c.id }, 'POST', tk)).id);
    await savePost(env, post);
  }
  let permalink = '';
  try { permalink = (await graphCall(env, done[0], { fields: 'permalink' }, 'GET', tk)).permalink || ''; } catch { /* optional */ }
  return { id: done[0], ids: done, permalink, story: true, pages: urls.length };
}

// Facebook page: feed photo / feed video / photo story / video story
async function publishFacebook(env, meta, post, imageUrl, videoUrl) {
  const tk = meta.pageToken; const page = meta.pageId;
  if (!post.story) {
    if (videoUrl) {
      const r = await graphCall(env, `${page}/videos`, { file_url: videoUrl, description: post.caption }, 'POST', tk);
      return { id: r.id, link: `https://www.facebook.com/${page}/videos/${r.id}` };
    }
    const r = await graphCall(env, `${page}/photos`, { url: imageUrl, caption: post.caption, published: 'true' }, 'POST', tk);
    return { id: r.post_id || r.id };
  }
  if (!videoUrl) {
    // the photo goes up unpublished first, then becomes the story
    const ph = await graphCall(env, `${page}/photos`, { url: imageUrl, published: 'false' }, 'POST', tk);
    const r = await graphCall(env, `${page}/photo_stories`, { photo_id: ph.id }, 'POST', tk);
    return { id: r.post_id || ph.id, story: true };
  }
  // video story: start an upload, let Facebook fetch the file from our URL, then finish
  const start = await graphCall(env, `${page}/video_stories`, { upload_phase: 'start' }, 'POST', tk);
  const up = await fetch(start.upload_url || `https://rupload.facebook.com/video-upload/${env.GRAPH_VERSION || 'v23.0'}/${start.video_id}`, {
    method: 'POST', headers: { Authorization: `OAuth ${tk}`, file_url: videoUrl },
  });
  const upData = await up.json().catch(() => ({}));
  if (!up.ok || upData.error || upData.success === false) throw new Error(upData.error?.message || `رفع الفيديو لفيسبوك فشل (HTTP ${up.status})`);
  const done = await graphCall(env, `${page}/video_stories`, { upload_phase: 'finish', video_id: start.video_id }, 'POST', tk);
  return { id: done.post_id || start.video_id, story: true };
}

async function waitForContainer(env, id, tk, isVideo = false) {
  // photos are ready in seconds; a video needs Instagram to download and process it (up to a few minutes)
  const tries = isVideo ? 60 : 8; const gap = isVideo ? 4000 : 2000;
  const what = isVideo ? 'الفيديو' : 'الصورة';
  for (let i = 0; i < tries; i++) {
    const { status_code: s } = await graphCall(env, id, { fields: 'status_code' }, 'GET', tk);
    if (s === 'FINISHED') return;
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`إنستغرام رفض ${what} (${s})`);
    await new Promise((r) => setTimeout(r, gap));
  }
  throw new Error(`إنستغرام تأخر بتجهيز ${what}، جرّب «انشر الآن» كمان مرة`);
}

// serves the MP4 with byte ranges (Meta's downloaders and browsers ask for parts of it)
function videoResponse(req, bytes) {
  const size = bytes.length;
  const head = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('Range') || '');
  if (m && (m[1] || m[2])) {
    let start = m[1] ? +m[1] : size - +m[2];
    let end = m[1] && m[2] ? +m[2] : size - 1;
    start = Math.max(0, start); end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { ...head, 'Content-Range': `bytes */${size}` } });
    return new Response(req.method === 'HEAD' ? null : bytes.slice(start, end + 1), {
      status: 206, headers: { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  return new Response(req.method === 'HEAD' ? null : bytes, { headers: { ...head, 'Content-Length': String(size) } });
}

/* ---------------- auth: Firebase ID token + admins/{uid} ---------------- */
let jwks = null; let jwksAt = 0;
const adminCache = new Map(); // uid → expiry

async function requireAdmin(req, env, perm = '') {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) throw fail(401, 'لازم تسجّل دخول');
  let user;
  try { user = await verifyIdToken(token, env.FIREBASE_PROJECT_ID); } catch { throw fail(401, 'جلسة الدخول انتهت، سجّل دخول من جديد'); }
  const cached = adminCache.get(user.uid);
  if (cached && cached.until > Date.now()) {
    if (perm && cached.perms && !cached.perms.includes(perm)) throw fail(403, 'ما عندك صلاحية النشر (استوديو السوشيال)');
    return user;
  }
  // the admin's own token can read admins/{uid} only if that document exists (firestore.rules)
  const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/admins/${user.uid}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw fail(403, 'ما عندك صلاحية');
  // admins/{uid}.perms: an admin with a permissions list needs «studio»; no list = an admin with everything
  const doc = await res.json().catch(() => ({}));
  const list = doc.fields?.perms?.arrayValue;
  const perms = list ? (list.values || []).map((v) => v.stringValue) : null; // null = an admin with everything
  adminCache.set(user.uid, { until: Date.now() + 5 * 60e3, perms });
  if (perm && perms && !perms.includes(perm)) throw fail(403, 'ما عندك صلاحية النشر (استوديو السوشيال)');
  return user;
}

const b64urlBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

export async function verifyIdToken(token, projectId) {
  const [h, p, sig] = token.split('.');
  if (!h || !p || !sig) throw new Error('malformed');
  const header = b64urlJson(h); const payload = b64urlJson(p);
  if (header.alg !== 'RS256') throw new Error('alg');
  if (!jwks || Date.now() - jwksAt > 3600e3) {
    const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
    jwks = (await r.json()).keys; jwksAt = Date.now();
  }
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) { jwks = null; throw new Error('kid'); }
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(sig), new TextEncoder().encode(`${h}.${p}`));
  const now = Date.now() / 1000;
  if (!ok || payload.exp < now || payload.iat > now + 300 || payload.aud !== projectId
    || payload.iss !== `https://securetoken.google.com/${projectId}` || !payload.sub) throw new Error('invalid');
  return { uid: payload.sub, email: payload.email || '' };
}

/* ---------------- helpers ---------------- */
function corsHeaders(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const h = { Vary: 'Origin' };
  if (allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    h['Access-Control-Max-Age'] = '86400';
  }
  return h;
}
function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
function fail(status, message) {
  const e = new Error(message); e.status = status; e.expose = true; return e;
}
