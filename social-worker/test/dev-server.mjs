// Local run of the Worker with a fake Meta + Google (for trying the admin studio without accounts).
// node test/dev-server.mjs  → http://localhost:8787   (GET /__token gives a test admin token; PORT=… for another port)
// In the admin panel (local): localStorage.setItem('blt-social-worker', 'http://localhost:8787')
// Fake Meta for «ربط فيسبوك وإنستغرام»: any App ID (digits), App Secret = 32 × "a", token = anything 30+ chars.
import http from 'node:http';
import worker, { runDue } from '../src/index.js';

const PROJECT = 'dev-project';
const PORT = Number(process.env.PORT) || 8787;
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid: 'dev', alg: 'RS256' };
const b64url = (b) => Buffer.from(b).toString('base64url');
async function token(sub = 'dev-admin', email = 'dev@local') {
  const now = Math.floor(Date.now() / 1000);
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'dev' }));
  const p = b64url(JSON.stringify({ sub, aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, iat: now, exp: now + 3600, email }));
  return `${h}.${p}.${b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`)))}`;
}
// the Firebase Auth emulator hands out unsigned tokens: re-sign them here (dev server only)
async function resign(auth) {
  const t = (auth || '').replace(/^Bearer\s+/i, '');
  const [h, p] = t.split('.');
  try {
    if (JSON.parse(Buffer.from(h, 'base64url')).alg !== 'none') return auth;
    const c = JSON.parse(Buffer.from(p, 'base64url'));
    return `Bearer ${await token(c.sub || c.user_id, c.email || '')}`;
  } catch { return auth; }
}

const store = new Map();
const KV = {
  async get(k, type) { const v = store.get(k); if (!v) return null; return type === 'json' ? JSON.parse(v.value) : v.value; },
  async put(k, value, o = {}) { store.set(k, { value, metadata: o.metadata }); },
  async delete(k) { store.delete(k); },
  async list({ prefix }) { return { keys: [...store].filter(([k]) => k.startsWith(prefix)).map(([name, v]) => ({ name, metadata: v.metadata })), list_complete: true }; },
};

const realFetch = globalThis.fetch;
let n = 0;
globalThis.fetch = async (url, init) => {
  url = String(url);
  const ok = (d) => new Response(JSON.stringify(d), { headers: { 'Content-Type': 'application/json' } });
  const bad = (m) => new Response(JSON.stringify({ error: { message: m } }), { status: 400 });
  if (url.includes('securetoken@system')) return ok({ keys: [jwk] });
  if (url.includes('firestore.googleapis.com')) return new Response('{}', { status: 200 });
  if (url.includes('graph.facebook.com')) {
    console.log('[meta]', init?.method || 'GET', url.replace(/(access_token|client_secret|fb_exchange_token|input_token)=[^&]+/g, '$1=…'));
    const q = Object.fromEntries(new URL(url).searchParams);
    if (url.includes('/oauth/access_token')) return q.client_secret === 'a'.repeat(32) ? ok({ access_token: 'LONG_USER' }) : bad('Error validating client secret.');
    if (url.includes('/me/accounts')) return ok({ data: [
      { id: '1001', name: 'كميونتي تقني بيت لاهيا', access_token: 'PAGE_TOKEN', instagram_business_account: { id: '2002', username: 'beitlahia.tech' } },
      { id: '1002', name: 'صفحة تجربة', access_token: 'PAGE2' },
    ] });
    if (url.includes('/debug_token')) return ok({ data: { is_valid: true, expires_at: 0, scopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish'] } });
    if (/\/100[12]\?/.test(url)) return ok({ name: q.access_token === 'PAGE_TOKEN' ? 'كميونتي تقني بيت لاهيا' : 'صفحة تجربة' });
    if (url.endsWith('/photos')) return ok({ id: `ph${++n}`, post_id: `1001_${n}` });
    if (url.endsWith('/photo_stories')) return ok({ success: true, post_id: `1001_s${++n}` });
    if (url.endsWith('/videos')) return ok({ id: `v${++n}` });
    if (url.endsWith('/video_stories')) return ok(/upload_phase=start/.test(String(init?.body)) ? { video_id: `vs${++n}`, upload_url: `https://rupload.facebook.com/video-upload/v23.0/vs${n}` } : { success: true, post_id: `1001_vs${n}` });
    if (url.endsWith('/media')) return ok({ id: `C${++n}` });
    if (/\/C\d+\?/.test(url)) return ok({ status_code: 'FINISHED' });
    if (url.endsWith('/media_publish')) return ok({ id: `IG${++n}` });
    if (/fields=permalink/.test(url)) return ok({ permalink: 'https://www.instagram.com/' });
  }
  if (url.startsWith('https://rupload.facebook.com/')) { console.log('[meta] video upload from', init?.headers?.file_url); return ok({ success: true }); }
  return realFetch(url, init);
};

const env = {
  SOCIAL: KV, FIREBASE_PROJECT_ID: PROJECT, PUBLIC_BASE_URL: `http://localhost:${PORT}`,
  ALLOWED_ORIGINS: 'http://localhost:5055,http://localhost:5056,http://localhost:5000,http://127.0.0.1:5055', GRAPH_VERSION: 'v23.0',
  OWNER_EMAIL: 'habojarad305@gmail.com',
};

http.createServer(async (req, res) => {
  if (req.url === '/__token') { res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); res.end(await token('dev-admin', env.OWNER_EMAIL)); return; }
  const chunks = []; for await (const c of req) chunks.push(c);
  const headers = { ...req.headers };
  if (headers.authorization) headers.authorization = await resign(headers.authorization);
  const r = await worker.fetch(new Request(`http://localhost:${PORT}${req.url}`, {
    method: req.method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : Buffer.concat(chunks),
  }), env, { waitUntil() {} });
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, () => console.log(`social worker (dev) on http://localhost:${PORT} — not connected yet; connect it from the admin panel`));

setInterval(() => runDue(env).then((k) => k && console.log(`[cron] published ${k}`)), 10e3);
