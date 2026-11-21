// Beit Lahia Tech — the public site's data, from Cloudflare's edge instead of Firestore (US) directly.
//
//   GET  /site/home            everything the home page shows, in one answer (gallery: thumbs of the first 3 photos
//                              of each album only; the rest come from /site/gallery when an album is opened)
//   GET  /site/gallery         the published photos (thumbs) + settings
//   GET  /site/blog            the published posts (the page still hides the ones whose time hasn't come) + settings
//   GET  /site/post/:slug      one published post with its text and pictures + settings
//   GET  /site/workshop[/:id]  the workshop (that id, else the next / current one) + the held ones + settings
//   GET  /site/settings        site/settings + site/forms (join, survey, trainer pages)
//   POST /site/purge           admin: forget every saved copy (the admin panel calls it after a change)
//
// Each answer is built from Firestore's public REST API (the same reads the rules allow anyone) and kept in
// the edge cache: up to FRESH seconds it is served as is; older, it is served at once and rebuilt behind it.
// Timestamps travel as {"$ts": ms}; the site turns them back into Timestamp-like objects (site-data.js).

const FRESH = 60;           // seconds a saved answer counts as current
const KEEP = 7 * 86400;     // seconds a stale answer may still be served while a new one is built
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const SLUG_RE = /^[^/?#\s]{1,160}$/;

/* ---------- Firestore REST → plain JSON ---------- */
export function fromValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return { $ts: Date.parse(v.timestampValue) };
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  return null;
}
export const fromFields = (f) => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, fromValue(v)]));
const docOf = (d) => ({ id: d.name.split('/').pop(), ...fromFields(d.fields) });
const ms = (t) => (t && t.$ts) || 0;

function base(env) { return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`; }
async function getDoc(env, path) {
  const r = await fetch(`${base(env)}/${path}`);
  if (r.status === 404 || r.status === 403) return null;
  if (!r.ok) throw new Error(`firestore get ${path}: ${r.status}`);
  return docOf(await r.json());
}
/** collection where field == value [and field2 == value2…] (equalities only: no index needed) */
async function query(env, col, ...pairs) {
  const eq = ([field, value]) => ({ fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value } } });
  const list = [];
  for (let i = 0; i < pairs.length; i += 2) list.push(eq([pairs[i], pairs[i + 1]]));
  const where = list.length === 1 ? list[0] : { compositeFilter: { op: 'AND', filters: list } };
  const r = await fetch(`${base(env)}:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where } }),
  });
  if (r.status === 403) return [];
  if (!r.ok) throw new Error(`firestore query ${col}: ${r.status}`);
  return (await r.json()).filter((x) => x.document).map((x) => docOf(x.document));
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || ms(b.createdAt) - ms(a.createdAt);
const settingsOf = (env) => getDoc(env, 'site/settings');
async function gallery(env) { return (await query(env, 'gallery', 'published', true)).sort(byOrder); }
async function blog(env) { return query(env, 'blog', 'status', 'published'); }
// a workshop as a card (home, the held ones): no certificate design (~100 KB), no long texts
const card = ({ cert, description, closedMessage, whatsappGroup, ...w }) => w;
const held = (env) => query(env, 'workshops', 'status', 'done');

async function home(env) {
  const [content, settings, events, photos, posts, done] = await Promise.all([
    getDoc(env, 'site/content'), settingsOf(env),
    query(env, 'events', 'published', true), gallery(env), blog(env), held(env),
  ]);
  const ids = [settings?.nextWorkshop, settings?.currentWorkshop].filter((id) => id && ID_RE.test(id) && !done.some((w) => w.id === id));
  const [more, team] = await Promise.all([
    Promise.all([...new Set(ids)].map((id) => getDoc(env, `workshops/${id}`))),
    settings?.showMembers === true ? query(env, 'team', 'published', true) : [],
  ]);
  // only the first 3 photos of each album carry their picture (the stack on the album card)
  const seen = new Map();
  const light = photos.map((p) => {
    const k = String(p.album || '').trim();
    const n = seen.get(k) || 0; seen.set(k, n + 1);
    if (n < 3) return p;
    const { thumb, ...rest } = p; return rest;
  });
  return {
    content, settings, events,
    gallery: light,
    team: team.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || ms(a.createdAt) - ms(b.createdAt)),
    posts,
    workshops: [...done, ...more.filter(Boolean)].map(({ topics, ...w }) => card(w)),
  };
}

/** ?w=<id>, else the scheduled next workshop (readable only once its publish time came), else the current one */
async function workshop(env, id) {
  const settings = await settingsOf(env);
  const ids = id ? [id] : [...new Set([settings?.nextWorkshop, settings?.currentWorkshop].filter((x) => x && ID_RE.test(x)))];
  const [found, done] = await Promise.all([Promise.all(ids.map((x) => getDoc(env, `workshops/${x}`))), held(env)]);
  // the page doesn't show the certificate design (~100 KB); the certificate page reads it itself
  const w = found.find(Boolean);
  return { settings, workshop: w ? (({ cert, ...rest }) => rest)(w) : null, past: done.map(card) };
}

async function post(env, slug) {
  const [list, settings] = await Promise.all([query(env, 'blog', 'slug', slug, 'status', 'published'), settingsOf(env)]);
  // the page itself checks the publish time (a post scheduled for later is in the list too)
  const posts = list;
  const ids = posts.map((p) => p.id);
  const bodies = await Promise.all(ids.map((id) => getDoc(env, `blogBody/${id}`)));
  const media = {};
  const want = new Set();
  // the same ids as blog-shared.js › mediaIds
  bodies.forEach((b) => { for (const m of String(b?.md || '').matchAll(/\(media:([\w-]{4,40})\)/g)) want.add(m[1]); });
  await Promise.all([...want].map(async (m) => { const d = await getDoc(env, `blogMedia/${m}`); if (d?.src) media[m] = d.src; }));
  return { settings, posts, bodies: Object.fromEntries(ids.map((id, i) => [id, bodies[i]])), media };
}

const BUILD = {
  home: { run: (env) => home(env) },
  gallery: { run: async (env) => { const [g, settings] = await Promise.all([gallery(env), settingsOf(env)]); return { gallery: g, settings }; } },
  blog: { run: async (env) => { const [p, settings] = await Promise.all([blog(env), settingsOf(env)]); return { posts: p, settings }; } },
  settings: { run: async (env) => { const [settings, forms] = await Promise.all([settingsOf(env), getDoc(env, 'site/forms')]); return { settings, forms }; } },
  workshop: { arg: ID_RE, optional: true, run: (env, id) => workshop(env, id) },
  post: { arg: SLUG_RE, run: (env, slug) => post(env, slug) },
};

/* ---------- the edge cache ---------- */
// every saved copy's key carries the current «generation»; a purge starts a new one, so all old copies are skipped
const GEN_KEY = new Request('https://site-data.internal/gen');
async function generation() {
  const r = await caches.default.match(GEN_KEY);
  return r ? await r.text() : '0';
}
const cacheKey = (gen, kind, arg) => new Request(`https://site-data.internal/v2/${gen}/${kind}${arg ? `/${encodeURIComponent(arg)}` : ''}`);
async function build(env, kind, arg) {
  const body = JSON.stringify({ at: Date.now(), ...(await BUILD[kind].run(env, arg)) });
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${KEEP}`, 'X-Built': String(Date.now()) } });
}
async function save(env, ctx, key, kind, arg) {
  const res = await build(env, kind, arg);
  const job = caches.default.put(key, res.clone());
  if (ctx) ctx.waitUntil(job); else await job;
  return res;
}
const out = (res, state) => new Response(res.body, {
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Cache': state },
});

export async function handleSite(req, env, ctx, parts, { requireAdmin, fail, json }) {
  const kind = parts[1] || '';
  if (req.method === 'POST' && kind === 'purge' && parts.length === 2) {
    await requireAdmin(req, env);
    const gen = String(Date.now());
    await caches.default.put(GEN_KEY, new Response(gen, { headers: { 'Cache-Control': `public, max-age=${30 * 86400}` } }));
    // build the home answer again right away, so the next visitor doesn't wait for it
    ctx.waitUntil(save(env, null, cacheKey(gen, 'home'), 'home').catch((e) => console.error('[site] rebuild', e)));
    return json({ ok: true });
  }
  const spec = Object.hasOwn(BUILD, kind) ? BUILD[kind] : null;
  if (req.method !== 'GET' || !spec) throw fail(404, 'مش موجود');
  let arg = '';
  if (spec.arg) {
    try { arg = parts[2] ? decodeURIComponent(parts[2]) : ''; } catch { throw fail(404, 'مش موجود'); }
    if (parts.length > 3 || (arg && !spec.arg.test(arg)) || (!arg && !spec.optional)) throw fail(404, 'مش موجود');
  } else if (parts.length !== 2) throw fail(404, 'مش موجود');

  const key = cacheKey(await generation(), kind, arg);
  const hit = await caches.default.match(key);
  if (hit) {
    const age = (Date.now() - Number(hit.headers.get('X-Built') || 0)) / 1000;
    if (age > FRESH) ctx.waitUntil(save(env, null, key, kind, arg).catch((e) => console.error('[site] refresh', e)));
    return out(hit, age > FRESH ? 'STALE' : 'HIT');
  }
  return out(await save(env, ctx, key, kind, arg), 'MISS');
}
