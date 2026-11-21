// The public site data (/site/*): Firestore REST → one JSON answer, kept in the edge cache.
// Run: node test/site.test.mjs
import assert from 'node:assert/strict';
import { handleSite, fromValue } from '../src/site.js';

/* fake edge cache */
const store = new Map();
globalThis.caches = { default: {
  async match(r) { const v = store.get(r.url); return v ? new Response(v.body, { headers: v.headers }) : undefined; },
  async put(r, res) { store.set(r.url, { body: await res.text(), headers: Object.fromEntries(res.headers) }); },
  async delete(r) { return store.delete(r.url); },
} };

/* fake Firestore */
let reads = 0;
const S = (v) => ({ stringValue: v });
const doc = (path, fields) => ({ name: `projects/p/databases/(default)/documents/${path}`, fields });
const photo = (id, album, order) => doc(`gallery/${id}`, { thumb: S(`data:${id}`), album: S(album), order: { integerValue: String(order) }, published: { booleanValue: true } });
globalThis.fetch = async (url, init = {}) => {
  reads++;
  url = String(url);
  const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
  if (url.endsWith(':runQuery')) {
    const col = JSON.parse(init.body).structuredQuery.from[0].collectionId;
    const docs = {
      gallery: ['a1', 'a2', 'a3', 'a4'].map((id, i) => photo(id, 'رحلة', i)).concat([photo('b1', 'ورشة', 9)]),
      workshops: [doc('workshops/w0', { status: S('done'), date: S('2026-10-01') })],
      blog: [doc('blog/p1', { title: S('أول بوست'), publishAt: { timestampValue: '2026-11-01T10:00:00Z' } })],
      team: [doc('team/t1', { name: S('حمزة') })],
    }[col] || [];
    return ok(docs.length ? docs.map((document) => ({ document })) : [{ readTime: 'x' }]);
  }
  if (url.endsWith('/site/settings')) return ok(doc('site/settings', { nextWorkshop: S('w1'), showMembers: { booleanValue: false } }));
  if (url.endsWith('/site/content')) return ok(doc('site/content', { hero: { mapValue: { fields: { title: S('مرحبا') } } } }));
  if (url.endsWith('/workshops/w1')) return ok(doc('workshops/w1', { status: S('live') }));
  return new Response('{}', { status: 404 });
};

const env = { FIREBASE_PROJECT_ID: 'p' };
const waits = [];
const ctx = { waitUntil: (p) => waits.push(p) };
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const json = (d) => new Response(JSON.stringify(d));
const call = async (method, path, admin = true) => {
  const req = new Request(`https://x${path}`, { method });
  const res = await handleSite(req, env, ctx, path.split('/').filter(Boolean), { requireAdmin: async () => { if (!admin) throw fail(401, 'no'); }, fail, json });
  await Promise.all(waits.splice(0));
  return res;
};
let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };

await t('values convert', () => {
  assert.deepEqual(fromValue({ arrayValue: { values: [{ integerValue: '3' }, { nullValue: null }] } }), [3, null]);
  assert.deepEqual(fromValue({ timestampValue: '1970-01-01T00:00:01Z' }), { $ts: 1000 });
});

await t('home: one answer, light gallery, workshops, no team when hidden', async () => {
  const res = await call('GET', '/site/home');
  assert.equal(res.headers.get('X-Cache'), 'MISS');
  const d = await res.json();
  assert.equal(d.content.hero.title, 'مرحبا');
  assert.deepEqual(d.gallery.map((p) => p.id), ['a1', 'a2', 'a3', 'a4', 'b1']);
  assert.deepEqual(d.gallery.map((p) => !!p.thumb), [true, true, true, false, true]); // 4th of an album: no picture
  assert.deepEqual(d.workshops.map((w) => w.id), ['w0', 'w1']);
  assert.deepEqual(d.team, []);
  assert.deepEqual(d.posts[0].publishAt, { $ts: Date.parse('2026-11-01T10:00:00Z') });
});

await t('second visit comes from the cache (no Firestore reads)', async () => {
  const before = reads;
  const res = await call('GET', '/site/home');
  assert.equal(res.headers.get('X-Cache'), 'HIT');
  assert.equal(reads, before);
});

await t('a stale copy is served at once and rebuilt behind it', async () => {
  const k = 'https://site-data.internal/v1/home';
  store.get(k).headers['x-built'] = String(Date.now() - 120e3);
  const before = reads;
  const res = await call('GET', '/site/home');
  assert.equal(res.headers.get('X-Cache'), 'STALE');
  assert.ok(reads > before);
  assert.ok(Date.now() - Number(store.get(k).headers['x-built']) < 5e3);
});

await t('gallery has every picture', async () => {
  const d = await (await call('GET', '/site/gallery')).json();
  assert.equal(d.gallery.filter((p) => p.thumb).length, 5);
});

await t('purge: admins only, then rebuilt', async () => {
  await assert.rejects(call('POST', '/site/purge', false), /no/);
  const res = await call('POST', '/site/purge');
  assert.equal((await res.json()).ok, true);
  assert.ok(!store.has('https://site-data.internal/v1/gallery'));
  assert.ok(store.has('https://site-data.internal/v1/home'));
});

await t('unknown paths are 404', async () => {
  await assert.rejects(call('GET', '/site/admins'), (e) => e.status === 404);
  await assert.rejects(call('POST', '/site/home'), (e) => e.status === 404);
});
console.log(`${n} passed`);
