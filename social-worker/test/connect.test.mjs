// Connecting Facebook / Instagram from the admin panel (owner only), against a fake Meta.
// Run: node test/connect.test.mjs
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const PROJECT = 'demo-project';
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'k1', alg: 'RS256' };
const b64url = (b) => Buffer.from(b).toString('base64url');
async function idToken(uid, email) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1' }));
  const p = b64url(JSON.stringify({ sub: uid, aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: now, exp: now + 3600, email }));
  return `${h}.${p}.${b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
}

const store = new Map();
const KV = {
  async get(k, type) { const v = store.get(k); if (!v) return null; return type === 'json' ? JSON.parse(v.value) : v.value; },
  async put(k, value, o = {}) { store.set(k, { value, metadata: o.metadata }); },
  async delete(k) { store.delete(k); },
  async list({ prefix }) { return { keys: [...store].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }; },
};

const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, body: init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null });
  const ok = (d) => new Response(JSON.stringify(d), { status: 200 });
  const bad = (m) => new Response(JSON.stringify({ error: { message: m } }), { status: 400 });
  if (url.includes('securetoken@system')) return ok({ keys: [jwk] });
  if (url.includes('firestore.googleapis.com')) {
    if (url.endsWith('/admins/own')) return new Response('{}', { status: 200 });
    if (url.endsWith('/admins/soc')) return new Response(JSON.stringify({ fields: { perms: { arrayValue: { values: [{ stringValue: 'studio' }] } } } }), { status: 200 });
    return new Response('{}', { status: 403 });
  }
  const q = Object.fromEntries(new URL(url).searchParams);
  if (url.includes('/oauth/access_token')) {
    if (q.fb_exchange_token === 'GRANULAR_TOKEN_xxxxxxxxxxxxxxxxxxxxxxxxx') return ok({ access_token: 'LONG_GRANULAR' });
    return q.fb_exchange_token === 'SHORT_TOKEN_FROM_EXPLORER_xxxxxxxxxxxxx' && q.client_secret === 'a'.repeat(32) ? ok({ access_token: 'LONG_USER' }) : bad('Invalid OAuth access token');
  }
  // Facebook Login for Business with «only the current pages»: me/accounts is empty, the token names the page
  if (url.includes('/me/accounts') && q.access_token === 'LONG_GRANULAR') return ok({ data: [] });
  if (url.includes('/debug_token') && q.input_token === 'LONG_GRANULAR') return ok({ data: { is_valid: true, scopes: ['pages_show_list', 'pages_manage_posts', 'business_management'], granular_scopes: [{ scope: 'pages_show_list', target_ids: ['333'] }, { scope: 'business_management', target_ids: ['B1'] }] } });
  if (/\/333\?/.test(url) && q.access_token === 'LONG_GRANULAR') return ok({ id: '333', name: 'كوميونتي', access_token: 'PAGE3', instagram_business_account: { id: '777', username: 'beitlahia.tech' } });
  if (url.includes('/B1/owned_pages')) return ok({ data: [{ id: '333', name: 'كوميونتي', access_token: 'PAGE3' }, { id: '444', name: 'صفحة الشركة', access_token: 'PAGE4' }] });
  if (url.includes('/B1/client_pages')) return ok({ data: [] });
  if (url.includes('/me/accounts')) return q.access_token === 'LONG_USER' ? ok({ data: [
    { id: '111', name: 'بيت لاهيا تيك', access_token: 'PAGE_TOKEN', instagram_business_account: { id: '999', username: 'beitlahiatech' } },
    { id: '222', name: 'صفحة ثانية', access_token: 'PAGE2' },
  ] }) : bad('no');
  if (url.includes('/debug_token')) return ok({ data: { is_valid: true, expires_at: 0, scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'] } });
  if (/\/111\?/.test(url)) return q.access_token === 'PAGE_TOKEN' ? ok({ name: 'بيت لاهيا تيك' }) : bad('bad token');
  if (url.endsWith('/111/photos')) return ok({ id: 'ph', post_id: '111_5' });
  if (url.endsWith('/999/media')) return ok({ id: 'C1' });
  if (url.includes('/C1?')) return ok({ status_code: 'FINISHED' });
  if (url.endsWith('/999/media_publish')) return ok({ id: 'IG1' });
  if (url.includes('/IG1?')) return ok({ permalink: 'https://instagram.com/p/1' });
  return new Response('nf', { status: 404 });
};

const env = { SOCIAL: KV, FIREBASE_PROJECT_ID: PROJECT, PUBLIC_BASE_URL: 'https://social.x', ALLOWED_ORIGINS: '', GRAPH_VERSION: 'v23.0', OWNER_EMAIL: 'boss@x.test' };
const owner = await idToken('own', 'boss@x.test');
const soc = await idToken('soc', 'soc@x.test');
async function call(method, path, token, body) {
  const res = await worker.fetch(new Request(`https://social.x${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body && JSON.stringify(body),
  }), env, { waitUntil() {} });
  return { status: res.status, data: await res.json() };
}
const health = async () => (await worker.fetch(new Request('https://social.x/health'), env, { waitUntil() {} })).json();
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const creds = { appId: '123456789012345', appSecret: 'a'.repeat(32), userToken: 'SHORT_TOKEN_FROM_EXPLORER_xxxxxxxxxxxxx' };

await t('nothing connected at first', async () => {
  const h = await health(); assert.deepEqual([h.facebook, h.instagram], [false, false]);
  assert.equal((await call('GET', '/connect', owner)).data.connected, false);
});
await t('only the owner may connect', async () => {
  const r = await call('POST', '/connect/pages', soc, creds);
  assert.equal(r.status, 403); assert.match(r.data.error, /صاحب المنصة/);
});
await t('clear errors for bad input', async () => {
  assert.match((await call('POST', '/connect/pages', owner, { ...creds, appId: 'abc' })).data.error, /App ID/);
  assert.match((await call('POST', '/connect/pages', owner, { ...creds, appSecret: 'x' })).data.error, /App Secret/);
  const bad = await call('POST', '/connect/pages', owner, { ...creds, userToken: 'WRONG_TOKEN_xxxxxxxxxxxxxxxxxxxxxxxxx' });
  assert.equal(bad.status, 400); assert.match(bad.data.error, /ميتا: Invalid OAuth/);
});
await t('pages are listed without their tokens', async () => {
  const r = await call('POST', '/connect/pages', owner, creds);
  assert.equal(r.status, 200);
  assert.deepEqual(r.data.pages.map((p) => p.name), ['بيت لاهيا تيك', 'صفحة ثانية']);
  assert.equal(r.data.pages[0].ig.username, 'beitlahiatech');
  assert.ok(!JSON.stringify(r.data).includes('PAGE_TOKEN'));
});
await t('choosing a page saves the connection', async () => {
  const r = await call('POST', '/connect/select', owner, { pageId: '111' });
  assert.equal(r.data.connected, true);
  assert.equal(r.data.page.name, 'بيت لاهيا تيك'); assert.equal(r.data.instagram.username, 'beitlahiatech');
  assert.deepEqual(r.data.missingScopes, []);
  assert.ok(!JSON.stringify(r.data).includes('PAGE_TOKEN'));
  const h = await health(); assert.deepEqual([h.facebook, h.instagram, h.page], [true, true, 'بيت لاهيا تيك']);
});
await t('test button checks against Meta', async () => {
  const r = await call('POST', '/connect/test', owner);
  assert.equal(r.data.check.ok, true); assert.equal(r.data.check.name, 'بيت لاهيا تيك');
});
await t('publishing uses the saved page token', async () => {
  calls.length = 0;
  const jpeg = `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3000)]).toString('base64')}`;
  const r = await call('POST', '/posts', soc, { image: jpeg, caption: 'hi', platforms: ['facebook', 'instagram'] });
  assert.equal(r.data.post.status, 'published');
  assert.equal(calls.find((c) => c.url.endsWith('/111/photos')).body.access_token, 'PAGE_TOKEN');
  assert.equal(calls.find((c) => c.url.endsWith('/999/media_publish')).body.access_token, 'PAGE_TOKEN');
});
await t('pages granted one by one (empty me/accounts) are still found', async () => {
  const r = await call('POST', '/connect/pages', owner, { ...creds, userToken: 'GRANULAR_TOKEN_xxxxxxxxxxxxxxxxxxxxxxxxx' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.deepEqual(r.data.pages.map((p) => p.id), ['333', '444']);
  assert.equal(r.data.pages[0].ig.username, 'beitlahia.tech');
  assert.ok(!JSON.stringify(r.data).includes('PAGE3'));
});
await t('disconnect forgets it', async () => {
  const r = await call('DELETE', '/connect', owner);
  assert.equal(r.data.connected, false);
  const h = await health(); assert.deepEqual([h.facebook, h.instagram], [false, false]);
});
console.log(`\n${n} connect tests passed`);
