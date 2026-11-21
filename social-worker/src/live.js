// Beit Lahia Tech — online workshops: the Zoom / Meet link behind the site's own «/live» link.
//
//   GET    /live/:wid          admin «workshops»: { link } the saved meeting link ('' = none)
//   PUT    /live/:wid          admin «workshops»: { link } save it ('' removes it)
//   POST   /live/:wid/enter    public (site origins): { code } → { link } once that pass has checked in
//
// The meeting link never sits in Firestore (workshops/{wid} is public), only here in KV › live:<wid>.
// A registrant gets it after their check-in is in Firestore: the /live page creates liveJoins/{code}
// (the rules accept it only for a real registration of that online workshop, on its day) and marks the
// registration attended. This Worker reads liveJoins/{code} back (public `get`, no key needed) and only then
// answers with the link, so the link reaches registrants who checked in, not whoever has the group link.

const WID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const CODE_RE = /^[A-Za-z0-9]{12,40}$/;

/** https only, a sane length, no spaces */
export function cleanMeetingLink(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (s.length > 400 || /\s/.test(s)) return null;
  try { const u = new URL(s); return u.protocol === 'https:' && u.hostname.includes('.') ? u.href : null; } catch { return null; }
}

export async function handleLive(req, env, parts, { requireAdmin, fail, json }) {
  const wid = parts[1] || '';
  if (!WID_RE.test(wid)) throw fail(404, 'الورشة مش موجودة');
  const key = `live:${wid}`;

  if (req.method === 'POST' && parts[2] === 'enter' && parts.length === 3) {
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(req.headers.get('Origin') || '')) throw fail(403, 'مش مسموح');
    const b = await req.json().catch(() => ({}));
    const code = String(b?.code || '');
    if (!CODE_RE.test(code)) throw fail(400, 'رمز الدخول مش صحيح');
    const saved = await env.SOCIAL.get(key, 'json');
    if (!saved?.link) throw fail(404, 'رابط اللقاء لسا ما انضاف. جرّب كمان شوي أو اسأل بالجروب.');
    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/liveJoins/${code}`);
    if (res.status !== 200) throw fail(403, 'ما لقينا تسجيل حضورك. افتح الرابط من جديد.');
    const doc = await res.json().catch(() => ({}));
    if (doc.fields?.workshopId?.stringValue !== wid) throw fail(403, 'رمزك لورشة تانية');
    return json({ link: saved.link });
  }

  try { await requireAdmin(req, env, 'workshops'); } catch (e) {
    if (e.status === 403) throw fail(403, 'ما عندك صلاحية الورشات');
    throw e;
  }
  if (parts.length !== 2) throw fail(404, 'مش موجود');
  if (req.method === 'GET') return json({ link: ((await env.SOCIAL.get(key, 'json')) || {}).link || '' });
  if (req.method === 'PUT') {
    const b = await req.json().catch(() => ({}));
    const link = cleanMeetingLink(b?.link);
    if (link === null) throw fail(400, 'رابط اللقاء لازم يكون رابط كامل بيبدأ بـ https://');
    if (!link) await env.SOCIAL.delete(key);
    else await env.SOCIAL.put(key, JSON.stringify({ link, at: Date.now() }));
    return json({ link });
  }
  throw fail(405, 'طلب مش مدعوم');
}
