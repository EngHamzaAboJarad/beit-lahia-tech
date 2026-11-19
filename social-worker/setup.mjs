// One-time setup of the social publishing service on Cloudflare (run from this folder):
//   npm run setup
// 1) signs you in to Cloudflare (opens the browser the first time)
// 2) creates the KV storage and writes its id into wrangler.toml
// 3) deploys the Worker on https://social.beitlahia.tech
// 4) waits until it answers.
// After that, Facebook / Instagram are connected from the admin panel (استوديو السوشيال › الربط).
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOML = path.join(here, 'wrangler.toml');
const WRANGLER = ['--yes', 'wrangler@4'];

function wrangler(args, { capture = false } = {}) {
  const r = spawnSync('npx', [...WRANGLER, ...args], { cwd: here, shell: true, encoding: 'utf8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' });
  return { code: r.status, out: `${r.stdout || ''}${r.stderr || ''}` };
}
const step = (n, msg) => console.log(`\n[${n}/4] ${msg}`);

step(1, 'تسجيل الدخول على Cloudflare');
let who = wrangler(['whoami'], { capture: true });
if (who.code !== 0 || /not authenticated|You are not logged in/i.test(who.out)) {
  console.log('رح يفتح المتصفح: سجّل دخول على حساب Cloudflare اللي عليه beitlahia.tech ووافق.');
  if (wrangler(['login']).code !== 0) { console.error('ما زبط تسجيل الدخول.'); process.exit(1); }
  who = wrangler(['whoami'], { capture: true });
}
console.log('✓ داخل على Cloudflare');

step(2, 'مكان تخزين المنشورات (KV)');
let toml = readFileSync(TOML, 'utf8');
if (toml.includes('PASTE_KV_NAMESPACE_ID_HERE')) {
  const r = wrangler(['kv', 'namespace', 'create', 'SOCIAL'], { capture: true });
  const id = (r.out.match(/"?id"?\s*[=:]\s*"([0-9a-f]{32})"/i) || [])[1];
  if (!id) { console.error(r.out); console.error('ما قدرت أعمل الـ KV. شوف الرسالة فوق.'); process.exit(1); }
  toml = toml.replace('PASTE_KV_NAMESPACE_ID_HERE', id);
  writeFileSync(TOML, toml);
  console.log(`✓ انعمل (${id}) وانكتب بـ wrangler.toml`);
} else {
  console.log('✓ موجود من قبل');
}

step(3, 'رفع الخدمة');
if (wrangler(['deploy']).code !== 0) { console.error('ما زبط الرفع. شوف الرسالة فوق.'); process.exit(1); }
console.log('✓ انرفعت');

step(4, 'استنى لحد ما ترد https://social.beitlahia.tech');
const base = (toml.match(/PUBLIC_BASE_URL\s*=\s*"([^"]+)"/) || [])[1] || 'https://social.beitlahia.tech';
for (let i = 0; i < 24; i++) {
  try {
    const res = await fetch(`${base}/health`);
    if (res.ok) {
      const d = await res.json();
      console.log(`✓ الخدمة شغّالة: ${JSON.stringify(d)}`);
      console.log('\nخلص. هلّق افتح لوحة الإدارة › استوديو السوشيال › «ربط فيسبوك وإنستغرام» وكمّل من هناك.');
      process.exit(0);
    }
  } catch { /* DNS / certificate still on the way */ }
  await new Promise((r) => setTimeout(r, 5000));
}
console.log('الخدمة انرفعت بس الرابط لسا ما ردّ (الشهادة أو الـ DNS بياخدوا دقايق). جرّب افتح الرابط بعد شوي:', `${base}/health`);
