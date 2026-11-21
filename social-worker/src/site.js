// Beit Lahia Tech — the public site's data, from Cloudflare's edge instead of Firestore (US) directly.
//
//   GET  /site/home      everything the home page shows, in one answer (gallery: thumbs of the first 3 photos of
//                        each album only; the rest come from /site/gallery when an album is opened)
//   GET  /site/gallery   the published photos (thumbs)
//   GET  /site/blog      the published posts (the page still hides the ones whose time hasn't come)
//   POST /site/purge     admin: forget the saved copies (the admin panel calls it after a change)
//
// Each answer is built from Firestore's public REST API (the same reads the rules allow anyone) and kept in
// the edge cache: up to FRESH seconds it is served as is; older, it is served at once and rebuilt behind it.
// Timestamps travel as {"$ts": ms}; the site turns them back into Timestamp-like objects (site-data.js).

const FRESH = 60;           // seconds a saved answer counts as current
const KEEP = 7 * 86400;     // seconds a stale answer may still be served while a new one is built
const KINDS = ['home', 'gallery', 'blog'];
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

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
/** collection where field == value (one equality: no index needed) */
async function query(env, col, field, value) {
  const val = typeof value === 'boolean' ? { booleanValue: value } : { stringValue: value };
  const r = await fetch(`${base(env)}:runQuery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: val } } } }),
  });
  if (r.status === 403) return [];
  if (!r.ok) throw new Error(`firestore query ${col}: ${r.status}`);
  return (await r.json()).filter((x) => x.document).map((x) => docOf(x.document));
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || ms(b.createdAt) - ms(a.createdAt);
async function gallery(env) { return (await query(env, 'gallery', 'published', true)).sort(byOrder); }
async function blog(env) { return query(env, 'blog', 'status', 'published'); }

async function home(env) {
  const [content, settings, events, photos, posts, done] = await Promise.all([
    getDoc(env, 'site/content'), getDoc(env, 'site/settings'),
    query(env, 'events', 'published', true), gallery(env), blog(env),
    query(env, 'workshops', 'status', 'done'),
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
  // the post covers stay (3 newest only are shown; the page picks them); the body is in blogBody anyway
  return {
    content, settings, events,
    gallery: light,
    team: team.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || ms(a.createdAt) - ms(b.createdAt)),
    posts,
    // the home cards show the title, date, place and state: the certificate design, topics… stay on /workshop
    workshops: [...done, ...more.filter(Boolean)].map(({ cert, topics, description, closedMessage, whatsappGroup, ...w }) => w),
  };
}
// /gallery and /blog also show the footer's contact links (site/settings)
const withSettings = async (env, key, list) => { const [items, settings] = await Promise.all([list, getDoc(env, 'site/settings')]); return { [key]: items, settings }; };
const BUILD = { home, gallery: (env) => withSettings(env, 'gallery', gallery(env)), blog: (env) => withSettings(env, 'posts', blog(env)) };

/* ---------- the edge cache ---------- */
const cacheKey = (kind) => new Request(`https://site-data.internal/v1/${kind}`);
async function build(env, kind) {
  const body = JSON.stringify({ at: Date.now(), ...(await BUILD[kind](env)) });
  return new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${KEEP}`, 'X-Built': String(Date.now()) } });
}
async function save(env, ctx, kind) {
  const res = await build(env, kind);
  const job = caches.default.put(cacheKey(kind), res.clone());
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
    await Promise.all(KINDS.map((k) => caches.default.delete(cacheKey(k))));
    // build the home answer again right away, so the next visitor doesn't wait for it
    ctx.waitUntil(save(env, null, 'home').catch((e) => console.error('[site] rebuild', e)));
    return json({ ok: true });
  }
  if (req.method !== 'GET' || parts.length !== 2 || !KINDS.includes(kind)) throw fail(404, 'مش موجود');
  const hit = await caches.default.match(cacheKey(kind));
  if (hit) {
    const age = (Date.now() - Number(hit.headers.get('X-Built') || 0)) / 1000;
    if (age > FRESH) ctx.waitUntil(save(env, null, kind).catch((e) => console.error('[site] refresh', e)));
    return out(hit, age > FRESH ? 'STALE' : 'HIT');
  }
  return out(await save(env, ctx, kind), 'MISS');
}
