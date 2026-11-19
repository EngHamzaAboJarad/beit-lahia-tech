// End-to-end test of the Worker with fake Google/Firestore/Meta servers (no network, no accounts).
// Run: node test/worker.test.mjs
import assert from 'node:assert/strict';
import worker, { runDue } from '../src/index.js';

const PROJECT = 'demo-project';

/* ---- a Firebase-like ID token signed with our own key ---- */
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function idToken(uid, { aud = PROJECT, exp = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const p = b64url(JSON.stringify({ sub: uid, aud, iss: `https://securetoken.google.com/${aud}`, iat: now, exp: now + exp, email: `${uid}@x.test` }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(sig)}`;
}

/* ---- fake KV ---- */
function kv() {
  const m = new Map();
  return {
    m,
    async get(k, type) {
      const v = m.get(k); if (!v) return null;
      if (type === 'json') return JSON.parse(v.value);
      if (type === 'arrayBuffer') return v.value.buffer ?? v.value;
      return v.value;
    },
    async put(k, value, opts = {}) { m.set(k, { value, metadata: opts.metadata }); },
    async delete(k) { m.delete(k); },
    async list({ prefix }) { return { keys: [...m].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }; },
  };
}

/* ---- fake network ---- */
const calls = [];
let failInstagram = false;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const body = init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null;
  calls.push({ url, body, headers: init.headers || {} });
  const ok = (d) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('securetoken@system')) return ok({ keys: [jwk] });
  if (url.includes('firestore.googleapis.com')) {
    if (url.endsWith('/admins/admin1')) return new Response('{}', { status: 200 }); // no perms list = everything
    if (url.endsWith('/admins/social1')) return new Response(JSON.stringify({ fields: { perms: { arrayValue: { values: [{ stringValue: 'studio' }] } } } }), { status: 200 });
    if (url.endsWith('/admins/content1')) return new Response(JSON.stringify({ fields: { perms: { arrayValue: { values: [{ stringValue: 'site' }] } } } }), { status: 200 });
    return new Response('{}', { status: 403 });
  }
  if (url.includes('graph.facebook.com')) {
    if (url.endsWith('/PAGE/photos')) return ok(body.published === 'false' ? { id: 'ph9' } : { id: 'ph1', post_id: 'PAGE_123' });
    if (url.endsWith('/PAGE/photo_stories')) return ok({ success: true, post_id: 'PAGE_S1' });
    if (url.endsWith('/PAGE/videos')) return ok({ id: 'V1' });
    if (url.endsWith('/PAGE/video_stories')) return ok(body.upload_phase === 'start' ? { video_id: 'VS1', upload_url: 'https://rupload.facebook.com/video-upload/v23.0/VS1' } : { success: true, post_id: 'PAGE_VS1' });
    if (url.endsWith('/IGU/media')) return failInstagram ? new Response(JSON.stringify({ error: { message: 'bad image' } }), { status: 400 }) : ok({ id: 'C1' });
    if (url.includes('/C1?')) return ok({ status_code: 'FINISHED' });
    if (url.endsWith('/IGU/media_publish')) return ok({ id: 'IG1' });
    if (url.includes('/IG1?')) return ok({ permalink: 'https://instagram.com/p/x' });
  }
  if (url.startsWith('https://rupload.facebook.com/')) return ok({ success: true });
  return new Response('not found', { status: 404 });
};

const env = {
  SOCIAL: kv(), FIREBASE_PROJECT_ID: PROJECT, PUBLIC_BASE_URL: 'https://social.example',
  ALLOWED_ORIGINS: 'https://beitlahia.tech', GRAPH_VERSION: 'v23.0', META_PAGE_TOKEN: 'secret', FB_PAGE_ID: 'PAGE', IG_USER_ID: 'IGU',
};
const ctx = { waitUntil: (p) => p };
const jpeg = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3000, 7)]).toString('base64');
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(5000, 1)]);
async function call(method, path, { token, body, raw, origin = 'https://beitlahia.tech', headers: extra = {} } = {}) {
  const headers = { Origin: origin, ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://social.example${path}`, { method, headers, body: raw || (body && JSON.stringify(body)) }), env, ctx);
  return { status: res.status, data: res.headers.get('Content-Type')?.includes('json') ? await res.json() : await res.arrayBuffer(), res };
}

const admin = await idToken('admin1');
const stranger = await idToken('someone');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };

await t('health is public and reports connections', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200); assert.deepEqual([r.data.facebook, r.data.instagram], [true, true]);
  assert.equal(r.res.headers.get('Access-Control-Allow-Origin'), 'https://beitlahia.tech');
});
await t('CORS refuses other origins', async () => {
  const r = await call('GET', '/health', { origin: 'https://evil.test' });
  assert.equal(r.res.headers.get('Access-Control-Allow-Origin'), null);
});
await t('posts need a valid admin token', async () => {
  assert.equal((await call('GET', '/posts')).status, 401);
  assert.equal((await call('GET', '/posts', { token: 'x.y.z' })).status, 401);
  assert.equal((await call('GET', '/posts', { token: stranger })).status, 403);
  assert.equal((await call('GET', '/posts', { token: await idToken('admin1', { aud: 'other' }) })).status, 401);
  assert.equal((await call('GET', '/posts', { token: await idToken('admin1', { exp: -10 }) })).status, 401);
  assert.equal((await call('GET', '/posts', { token: admin })).status, 200);
});
await t('permissions: studio may publish, other sections may not', async () => {
  assert.equal((await call('GET', '/posts', { token: await idToken('social1') })).status, 200);
  const r = await call('GET', '/posts', { token: await idToken('content1') });
  assert.equal(r.status, 403); assert.match(r.data.error, /صلاحية النشر/);
});
await t('rejects bad input', async () => {
  assert.equal((await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: [] } })).status, 400);
  assert.equal((await call('POST', '/posts', { token: admin, body: { image: 'data:image/jpeg;base64,AAAA', platforms: ['facebook'] } })).status, 400);
  assert.equal((await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['facebook'], caption: 'x'.repeat(2300) } })).status, 400);
});
await t('publish now goes to Facebook and Instagram', async () => {
  calls.length = 0;
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, caption: 'مرحبا', platforms: ['facebook', 'instagram'], template: 'intro', title: 'معاً' } });
  assert.equal(r.status, 201);
  assert.equal(r.data.post.status, 'published');
  assert.equal(r.data.post.results.facebook.id, 'PAGE_123');
  assert.equal(r.data.post.results.instagram.permalink, 'https://instagram.com/p/x');
  const fb = calls.find((c) => c.url.endsWith('/PAGE/photos'));
  assert.equal(fb.body.caption, 'مرحبا'); assert.equal(fb.body.access_token, 'secret');
  assert.match(fb.body.url, /^https:\/\/social\.example\/img\/.+\.jpg$/);
  const img = await call('GET', new URL(fb.body.url).pathname);
  assert.equal(img.status, 200); assert.equal(img.res.headers.get('Content-Type'), 'image/jpeg');
});
await t('schedule, then the cron publishes it when due', async () => {
  const when = new Date(Date.now() + 3600e3).toISOString();
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, caption: 'later', platforms: ['facebook'], scheduledAt: when } });
  assert.equal(r.data.post.status, 'scheduled');
  assert.equal(await runDue(env), 0); // not yet
  const id = r.data.post.id;
  const stored = await env.SOCIAL.get(`post:${id}`, 'json');
  stored.scheduledAt = new Date(Date.now() - 1000).toISOString();
  await env.SOCIAL.put(`post:${id}`, JSON.stringify(stored), { metadata: { s: 'scheduled', at: Date.now() - 1000, c: Date.now() } });
  assert.equal(await runDue(env), 1);
  assert.equal((await env.SOCIAL.get(`post:${id}`, 'json')).status, 'published');
});
await t('a failed platform can be retried without re-posting the other', async () => {
  failInstagram = true;
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, caption: 'x', platforms: ['facebook', 'instagram'] } });
  assert.equal(r.data.post.status, 'partial');
  assert.equal(r.data.post.results.instagram.error, 'bad image');
  failInstagram = false; calls.length = 0;
  const again = await call('POST', `/posts/${r.data.post.id}/publish`, { token: admin });
  assert.equal(again.data.post.status, 'published');
  assert.equal(again.data.post.results.facebook.id, 'PAGE_123');
  assert.equal(calls.filter((c) => c.url.endsWith('/PAGE/photos')).length, 0); // Facebook not posted twice
  assert.equal(calls.filter((c) => c.url.endsWith('/IGU/media_publish')).length, 1);
});
await t('failed post: retry publishes; scheduled post: can be cancelled', async () => {
  failInstagram = true;
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, caption: 'x', platforms: ['instagram'] } });
  assert.equal(r.data.post.status, 'failed');
  failInstagram = false;
  const again = await call('POST', `/posts/${r.data.post.id}/publish`, { token: admin });
  assert.equal(again.data.post.status, 'published');
  const s = await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['facebook'], scheduledAt: new Date(Date.now() + 864e5).toISOString() } });
  assert.equal((await call('DELETE', `/posts/${s.data.post.id}`, { token: admin })).status, 200);
  assert.equal(await env.SOCIAL.get(`img:${s.data.post.id}`), null);
  assert.equal((await call('DELETE', `/posts/${again.data.post.id}`, { token: admin })).status, 409);
});
await t('listing returns newest first', async () => {
  const r = await call('GET', '/posts', { token: admin });
  assert.ok(r.data.posts.length >= 4);
  const c = r.data.posts.map((p) => Date.parse(p.createdAt));
  assert.deepEqual([...c].sort((a, b) => b - a), c);
});
await t('not connected yet: clear message', async () => {
  const saved = env.IG_USER_ID; env.IG_USER_ID = '';
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['instagram'] } });
  assert.equal(r.status, 400); assert.match(r.data.error, /إنستغرام مش مربوط/);
  env.IG_USER_ID = saved;
});
await t('a story picture: Facebook photo story + Instagram story', async () => {
  calls.length = 0;
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, caption: 'ignored', platforms: ['facebook', 'instagram'], story: true } });
  assert.equal(r.data.post.status, 'published');
  assert.equal(r.data.post.results.facebook.id, 'PAGE_S1');
  const ph = calls.find((c) => c.url.endsWith('/PAGE/photos'));
  assert.equal(ph.body.published, 'false');
  assert.equal(calls.find((c) => c.url.endsWith('/PAGE/photo_stories')).body.photo_id, 'ph9');
  const ig = calls.find((c) => c.url.endsWith('/IGU/media'));
  assert.equal(ig.body.media_type, 'STORIES'); assert.ok(ig.body.image_url); assert.equal(ig.body.caption, undefined);
});
await t('with music: the post waits for its video, then goes out as video', async () => {
  calls.length = 0;
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, video: true, duration: 15, music: 'نغمة', caption: 'صوت', platforms: ['facebook', 'instagram'] } });
  assert.equal(r.status, 201); assert.equal(r.data.post.status, 'uploading');
  assert.equal(calls.filter((c) => c.url.includes('graph.facebook.com')).length, 0); // nothing goes out before the video
  const id = r.data.post.id;
  assert.equal((await call('POST', `/posts/${id}/publish`, { token: admin })).status, 409);
  assert.equal((await call('PUT', `/posts/${id}/video`, { token: admin, raw: Buffer.alloc(3000, 2) })).status, 400); // not an MP4
  const up = await call('PUT', `/posts/${id}/video`, { token: admin, raw: mp4 });
  assert.equal(up.status, 200); assert.equal(up.data.post.status, 'published');
  const fb = calls.find((c) => c.url.endsWith('/PAGE/videos'));
  assert.equal(fb.body.description, 'صوت'); assert.match(fb.body.file_url, /\/vid\/.+\.mp4$/);
  const ig = calls.find((c) => c.url.endsWith('/IGU/media'));
  assert.equal(ig.body.media_type, 'REELS'); assert.equal(ig.body.video_url, fb.body.file_url);
  // the video is served, whole or in parts
  const path = new URL(fb.body.file_url).pathname;
  const whole = await call('GET', path);
  assert.equal(whole.status, 200); assert.equal(whole.res.headers.get('Content-Type'), 'video/mp4'); assert.equal(whole.data.byteLength, mp4.length);
  const part = await call('GET', path, { headers: { Range: 'bytes=4-11' } });
  assert.equal(part.status, 206); assert.equal(Buffer.from(part.data).toString(), 'ftypisom');
  assert.equal(part.res.headers.get('Content-Range'), `bytes 4-11/${mp4.length}`);
  assert.equal((await call('PUT', `/posts/${id}/video`, { token: admin, raw: mp4 })).status, 409);
});
await t('a story with music: Facebook video story (upload by URL) + Instagram video story', async () => {
  calls.length = 0;
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, video: true, duration: 20, platforms: ['facebook', 'instagram'], story: true } });
  const up = await call('PUT', `/posts/${r.data.post.id}/video`, { token: admin, raw: mp4 });
  assert.equal(up.data.post.status, 'published');
  assert.equal(up.data.post.results.facebook.id, 'PAGE_VS1');
  const phases = calls.filter((c) => c.url.endsWith('/PAGE/video_stories')).map((c) => c.body.upload_phase);
  assert.deepEqual(phases, ['start', 'finish']);
  const rup = calls.find((c) => c.url.startsWith('https://rupload.facebook.com/'));
  assert.match(rup.headers.file_url, /\/vid\/.+\.mp4$/); assert.equal(rup.headers.Authorization, 'OAuth secret');
  const ig = calls.find((c) => c.url.endsWith('/IGU/media'));
  assert.equal(ig.body.media_type, 'STORIES'); assert.ok(ig.body.video_url);
});
await t('a scheduled post with music is scheduled once its video is in', async () => {
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, video: true, platforms: ['instagram'], story: true, scheduledAt: new Date(Date.now() + 3600e3).toISOString() } });
  assert.equal(r.data.post.status, 'uploading');
  const up = await call('PUT', `/posts/${r.data.post.id}/video`, { token: admin, raw: mp4 });
  assert.equal(up.data.post.status, 'scheduled');
  assert.equal((await call('DELETE', `/posts/${r.data.post.id}`, { token: admin })).status, 200);
  assert.equal(await env.SOCIAL.get(`vid:${r.data.post.id}`), null);
});
await t('a scheduled post can be moved (calendar drag); others cannot', async () => {
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['facebook'], scheduledAt: new Date(Date.now() + 3600e3).toISOString() } });
  const to = new Date(Date.now() + 2 * 864e5).toISOString();
  const m = await call('PATCH', `/posts/${r.data.post.id}`, { token: admin, body: { scheduledAt: to } });
  assert.equal(m.status, 200); assert.equal(m.data.post.scheduledAt, to);
  assert.equal((await env.SOCIAL.m.get(`post:${r.data.post.id}`)).metadata.at, Date.parse(to));
  assert.equal((await call('PATCH', `/posts/${r.data.post.id}`, { token: admin, body: { scheduledAt: new Date(Date.now() - 1000).toISOString() } })).status, 400);
  const pub = await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['facebook'] } });
  assert.equal((await call('PATCH', `/posts/${pub.data.post.id}`, { token: admin, body: { scheduledAt: to } })).status, 409);
  await call('DELETE', `/posts/${r.data.post.id}`, { token: admin });
});
await t('e-mail alerts: settings are owner-only, a test mail goes out', async () => {
  env.OWNER_EMAIL = 'admin1@x.test'; env.MAIL = { sent: [], async send(m) { this.sent.push(m); } };
  assert.equal((await call('GET', '/notify', { token: await idToken('social1') })).status, 403);
  const s = await call('GET', '/notify', { token: admin });
  assert.equal(s.data.to, 'admin1@x.test'); assert.equal(s.data.mail, true); assert.equal(s.data.digest, true);
  assert.equal((await call('POST', '/notify', { token: admin, body: { to: 'nope' } })).status, 400);
  const saved = await call('POST', '/notify', { token: admin, body: { to: 'me@x.test', failed: true, conn: false, digest: true } });
  assert.equal(saved.data.to, 'me@x.test'); assert.equal(saved.data.conn, false);
  const test = await call('POST', '/notify/test', { token: admin });
  assert.equal(test.status, 200);
  const m = env.MAIL.sent.pop();
  assert.equal(m.to, 'me@x.test'); assert.equal(m.from, 'notify@beitlahia.tech');
  assert.match(m.raw, /Subject: =\?UTF-8\?B\?/); assert.match(m.raw, /Message-ID: </);
});
await t('a scheduled post that fails sends an alert', async () => {
  failInstagram = true; env.MAIL.sent.length = 0;
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['instagram'], title: 'إعلان', scheduledAt: new Date(Date.now() + 3600e3).toISOString() } });
  const st = await env.SOCIAL.get(`post:${r.data.post.id}`, 'json');
  await env.SOCIAL.put(`post:${st.id}`, JSON.stringify(st), { metadata: { s: 'scheduled', at: Date.now() - 1, c: Date.now() } });
  await runDue(env);
  failInstagram = false;
  assert.equal(env.MAIL.sent.length, 1);
  const body = Buffer.from(env.MAIL.sent[0].raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString();
  assert.match(body, /إعلان/); assert.match(body, /bad image/);
});
await t('site forms feed the daily digest, sent once in the evening', async () => {
  env.MAIL.sent.length = 0;
  const reg = (b, origin = 'https://beitlahia.tech') => worker.fetch(new Request('https://social.example/notify/reg', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'text/plain' }, body: JSON.stringify(b) }), env, ctx);
  assert.equal((await reg({ kind: 'member', name: 'سارة' })).status, 200);
  assert.equal((await reg({ kind: 'workshop', name: 'أحمد <b>', workshop: 'المبرمج المعزّز' })).status, 200);
  assert.equal((await reg({ kind: 'member', name: 'x' }, 'https://evil.test')).status, 403);
  assert.equal((await reg({ kind: 'spam' })).status, 400);
  const { dailyJobs, gazaClock } = await import('../src/index.js');
  const day = gazaClock().day;
  const at = (h) => new Date(`${day}T${String(h).padStart(2, '0')}:30:00+02:00`);
  await dailyJobs(env, at(12)); // noon: not yet (connection check is off in these settings)
  assert.equal(env.MAIL.sent.length, 0);
  await dailyJobs(env, at(21));
  assert.equal(env.MAIL.sent.length, 1);
  const body = Buffer.from(env.MAIL.sent[0].raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString();
  assert.match(body, /أعضاء جدد بالمجتمع: 1/); assert.match(body, /سارة/); assert.match(body, /المبرمج المعزّز/); assert.ok(!body.includes('<b>'));
  await dailyJobs(env, at(22)); // once a day
  assert.equal(env.MAIL.sent.length, 1);
});
await t('daily connection check alerts when Meta refuses the token', async () => {
  await call('POST', '/notify', { token: admin, body: { to: 'me@x.test', failed: true, conn: true, digest: false } });
  env.MAIL.sent.length = 0;
  const { dailyJobs } = await import('../src/index.js');
  const tomorrow = new Date(Date.now() + 864e5);
  tomorrow.setUTCHours(8, 0, 0, 0); // 10:00 in Gaza
  const saved = globalThis.fetch;
  globalThis.fetch = async (u, i) => (String(u).includes('/PAGE?') ? new Response(JSON.stringify({ error: { message: 'Session has expired' } }), { status: 400 }) : saved(u, i));
  await dailyJobs(env, tomorrow);
  globalThis.fetch = saved;
  assert.equal(env.MAIL.sent.length, 1);
  const body = Buffer.from(env.MAIL.sent[0].raw.split('\r\n\r\n')[1].replace(/\r\n/g, ''), 'base64').toString();
  assert.match(body, /Session has expired/);
  delete env.MAIL; delete env.OWNER_EMAIL;
});
await t('a scheduled story keeps its design and can be edited before it goes out', async () => {
  const when = new Date(Date.now() + 3600e3).toISOString();
  const r = await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['instagram'], story: true, title: 'قديم', scheduledAt: when } });
  const id = r.data.post.id;
  const design = JSON.stringify({ v: 1, w: 1080, h: 1920, els: [{ type: 'text', text: 'مرحبا' }] });
  const put = await worker.fetch(new Request(`https://social.example/posts/${id}/design`, { method: 'PUT', headers: { Authorization: `Bearer ${admin}`, Origin: 'https://beitlahia.tech' }, body: design }), env, ctx);
  assert.equal(put.status, 200);
  assert.equal((await env.SOCIAL.get(`post:${id}`, 'json')).hasDesign, true);
  const got = await call('GET', `/posts/${id}/design`, { token: admin });
  assert.equal(JSON.stringify(got.data), design);
  // edit: new picture and title, same time
  const jpeg2 = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3000, 9)]).toString('base64');
  const ed = await call('PUT', `/posts/${id}`, { token: admin, body: { image: jpeg2, title: 'جديد', caption: 'ignored for a story' } });
  assert.equal(ed.status, 200); assert.equal(ed.data.post.status, 'scheduled'); assert.equal(ed.data.post.title, 'جديد');
  assert.equal(ed.data.post.caption, ''); assert.equal(ed.data.post.scheduledAt, when); assert.ok(ed.data.post.editedAt);
  const img = await call('GET', `/img/${id}.jpg`);
  assert.equal(Buffer.from(img.data)[5], 9);
  // edit with music: waits for the video, then it is scheduled again
  const ed2 = await call('PUT', `/posts/${id}`, { token: admin, body: { image: jpeg2, video: true, duration: 10 } });
  assert.equal(ed2.data.post.status, 'uploading');
  const up = await call('PUT', `/posts/${id}/video`, { token: admin, raw: mp4 });
  assert.equal(up.data.post.status, 'scheduled'); assert.equal(up.data.post.video, true);
  // a published post cannot be edited; deleting a scheduled one removes its design too
  const pub = await call('POST', '/posts', { token: admin, body: { image: jpeg, platforms: ['facebook'] } });
  assert.equal((await call('PUT', `/posts/${pub.data.post.id}`, { token: admin, body: { image: jpeg2 } })).status, 409);
  await call('DELETE', `/posts/${id}`, { token: admin });
  assert.equal(await env.SOCIAL.get(`des:${id}`), null);
});
console.log(`\n${n} tests passed`);
