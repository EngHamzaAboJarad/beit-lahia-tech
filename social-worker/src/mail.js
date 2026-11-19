// Beit Lahia Tech — e-mails to workshop registrants (check-in pass, certificate), sent from the admin panel.
//
//   GET  /mail            admin «workshops»: is sending set up? { ready, from }
//   POST /mail/workshop   admin «workshops»: { kind: 'pass' | 'cert', workshop: { title, titleAr, date, time, place },
//                         items: [{ id, to, name, url }] } (≤ 50) → { results: [{ id, ok, error? }], sent }
//
// It goes out through the same `send_email` binding (MAIL) as the owner's alerts, but as a Cloudflare Email
// Service message ({ to, from, subject, html, text }), because registrants are not verified destination
// addresses. That needs beitlahia.tech onboarded to Email Service › Email Sending (Cloudflare dashboard) and a
// plan that allows sending to any address; until then Cloudflare refuses and the panel shows why.
//
// Abuse guard: only signed-in admins with «workshops» call it, every link must point at the site itself, the
// text is a fixed template (only the name / workshop are filled in), and there is a daily cap.

const KINDS = ['pass', 'cert'];
const MAX_ITEMS = 50;
const DAILY_CAP = 600;
const isEmail = (v) => typeof v === 'string' && v.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function handleMail(req, env, parts, { requireAdmin, fail, json }) {
  try { await requireAdmin(req, env, 'workshops'); } catch (e) {
    if (e.status === 403) throw fail(403, 'ما عندك صلاحية الورشات');
    throw e;
  }
  if (req.method === 'GET' && parts.length === 1) return json({ ready: !!env.MAIL, from: mailFrom(env) });
  if (req.method === 'POST' && parts[1] === 'workshop') return json(await sendWorkshopMails(env, await req.json().catch(() => null), fail));
  throw fail(405, 'طلب مش مدعوم');
}

const mailFrom = (env) => env.MAIL_FROM || 'notify@beitlahia.tech';
const siteOrigins = (env) => ['https://beitlahia.tech', ...String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)];

async function sendWorkshopMails(env, b, fail) {
  if (!env.MAIL) throw fail(400, 'إرسال الإيميل مش مفعّل بخدمة النشر (send_email بـ wrangler.toml).');
  if (!b || !KINDS.includes(b.kind)) throw fail(400, 'نوع الإيميل مش معروف');
  if (!Array.isArray(b.items) || !b.items.length) throw fail(400, 'ما في حدا تبعتله');
  if (b.items.length > MAX_ITEMS) throw fail(400, `بحد أقصى ${MAX_ITEMS} إيميل بالمرة`);
  const w = b.workshop || {};
  const ws = { title: clean(w.title, 80), titleAr: clean(w.titleAr, 120), date: clean(w.date, 40), time: clean(w.time, 40), place: clean(w.place, 120) };
  const origins = siteOrigins(env);

  const day = new Date().toISOString().slice(0, 10);
  const capKey = `mail:count:${day}`;
  let used = Number(await env.SOCIAL.get(capKey)) || 0;
  const results = [];
  let sent = 0;
  for (const it of b.items) {
    const id = clean(it?.id, 40);
    const to = String(it?.to || '').trim().toLowerCase();
    const name = clean(it?.name, 80);
    let url = '';
    try { const u = new URL(String(it?.url || '')); if (origins.includes(u.origin)) url = u.href; } catch { url = ''; }
    if (!isEmail(to)) { results.push({ id, ok: false, error: 'الإيميل مش صحيح' }); continue; }
    if (!url) { results.push({ id, ok: false, error: 'الرابط لازم يكون من الموقع' }); continue; }
    if (used >= DAILY_CAP) { results.push({ id, ok: false, error: `وصلنا حد اليوم (${DAILY_CAP} إيميل)، كمّل بكرة` }); continue; }
    const m = b.kind === 'pass' ? passMail(ws, name, url) : certMail(ws, name, url);
    try {
      await env.MAIL.send({
        to, from: { email: mailFrom(env), name: 'بيت لاهيا تيك' }, replyTo: env.CONTACT_EMAIL || 'info@beitlahia.tech',
        subject: m.subject, text: m.text, html: m.html,
      });
      used += 1; sent += 1;
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: mailError(e, to) });
      if (['E_SENDER_NOT_VERIFIED', 'E_SENDER_DOMAIN_NOT_AVAILABLE', 'E_RECIPIENT_PLAN_RESTRICTED', 'E_DAILY_LIMIT_EXCEEDED'].includes(e?.code)) {
        // the same answer for everyone else: stop here instead of trying each one
        const msg = mailError(e, '');
        b.items.slice(b.items.indexOf(it) + 1).forEach((x) => results.push({ id: clean(x?.id, 40), ok: false, error: msg }));
        break;
      }
    }
  }
  if (sent) await env.SOCIAL.put(capKey, String(used), { expirationTtl: 3 * 86400 });
  return { results, sent };
}

function mailError(e, to) {
  const code = e?.code || '';
  const hints = {
    E_RECIPIENT_PLAN_RESTRICTED: 'Cloudflare بيبعت بس للعناوين المتحقق منها: فعّل Email Sending للدومين (Email Service) عشان يوصل لأي إيميل.',
    E_RECIPIENT_NOT_ALLOWED: 'الدومين مش مفعّل لـ Email Sending بـ Cloudflare، فما بيقدر يبعت لعناوين مش متحقق منها.',
    E_SENDER_NOT_VERIFIED: 'عنوان المرسل مش متحقق منه بـ Cloudflare Email Service.',
    E_SENDER_DOMAIN_NOT_AVAILABLE: 'الدومين beitlahia.tech مش مضاف لـ Cloudflare Email Service.',
    E_RECIPIENT_SUPPRESSED: `العنوان ${to} موقوف (ارتد قبل هيك أو اشتكى)`,
    E_RATE_LIMIT_EXCEEDED: 'إرسال كثير بوقت قصير، جرّب بعد شوي',
    E_DAILY_LIMIT_EXCEEDED: 'خلص حد الإرسال اليومي بـ Cloudflare، كمّل بكرة',
    E_DELIVERY_FAILED: 'ما وصل الإيميل (رفضه سيرفر المستلم)',
  };
  return hints[code] || `ما انبعت (${String(e?.message || e).slice(0, 120)})`;
}

/* ---------------- the two templates ---------------- */
const wsName = (ws) => ws.titleAr || ws.title || 'ورشة بيت لاهيا تيك';
const metaLine = (ws) => [ws.date, ws.time, ws.place].filter(Boolean).join(' · ');

function passMail(ws, name, url) {
  const subject = `بطاقة دخولك لورشة «${wsName(ws)}» | بيت لاهيا تيك`;
  const text = `أهلاً ${name || ''} 👋
تسجيلك بورشة «${wsName(ws)}» مؤكد.${metaLine(ws) ? `\n${metaLine(ws)}` : ''}

هاي بطاقة دخولك (فيها رمز QR):
${url}

يوم الورشة ورجّي الرمز للفريق عالباب وهو بيسجّل حضورك بثانية. احفظ البطاقة كصورة عشان تفتحها بدون نت.
الشهادة بتنصدر للي حضروا بس.

بنشوفك هناك 💚
بيت لاهيا تيك · beitlahia.tech`;
  return { subject, text, html: layout(`بطاقة دخولك جاهزة`, name, [
    `تسجيلك بورشة <b>«${esc(wsName(ws))}»</b> مؤكد.`,
    metaLine(ws) ? `<span style="color:#4A5468">${esc(metaLine(ws))}</span>` : '',
    'يوم الورشة افتح بطاقتك وورجّي رمز الـ QR للفريق عالباب، وهو بيسجّل حضورك بثانية. احفظ البطاقة كصورة عشان تفتحها بدون نت.',
    '<span style="color:#4A5468">الشهادة بتنصدر للي حضروا بس.</span>',
  ], 'افتح بطاقة الدخول', url) };
}

function certMail(ws, name, url) {
  const subject = `شهادة إنجاز ورشة «${wsName(ws)}» | بيت لاهيا تيك`;
  const text = `مبروك ${name || ''} 🎉🎓
يسعدنا في بيت لاهيا تيك إنك أنهيت ورشة «${wsName(ws)}» بنجاح، وهاي شهادتك جاهزة:
${url}
بتقدر تفتحها وتحفظها PDF أو تطبعها.
نتمنى لك مسيرة تقنية موفقة، وبنشوفك بالورشات الجاية! 💚
— بيت لاهيا تيك · beitlahia.tech`;
  return { subject, text, html: layout('مبروك! شهادتك جاهزة 🎓', name, [
    `يسعدنا إنك أنهيت ورشة <b>«${esc(wsName(ws))}»</b> بنجاح.`,
    'شهادتك جاهزة على الرابط: بتقدر تفتحها وتحفظها PDF أو تطبعها، وفيها رمز QR لأي حدا بدو يتحقق منها.',
    'نتمنى لك مسيرة تقنية موفقة، وبنشوفك بالورشات الجاية! 💚',
  ], 'افتح الشهادة', url) };
}

function layout(title, name, paras, button, url) {
  const p = paras.filter(Boolean).map((x) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.8">${x}</p>`).join('');
  return `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#F4F1ED;font-family:Tahoma,Arial,sans-serif;color:#0B1020">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1ED;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #E6E0D6">
<tr><td style="background:#0B1020;padding:20px 24px;color:#ffffff;font-size:18px;font-weight:bold" dir="rtl">بيت لاهيا <span style="color:#35E69B">تيك</span></td></tr>
<tr><td style="height:4px;background:#35E69B;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td style="padding:26px 24px 8px" dir="rtl" align="right">
<h1 style="margin:0 0 6px;font-size:22px">${esc(title)}</h1>
${name ? `<p style="margin:0 0 16px;font-size:17px">أهلاً ${esc(name)} 👋</p>` : ''}
${p}
<p style="margin:22px 0 8px" align="center"><a href="${esc(url)}" style="display:inline-block;background:#35E69B;color:#0B1020;text-decoration:none;font-weight:bold;font-size:16px;padding:13px 26px;border-radius:12px">${esc(button)}</a></p>
<p style="margin:0 0 18px;font-size:12px;color:#4A5468;word-break:break-all" align="center" dir="ltr">${esc(url)}</p>
</td></tr>
<tr><td style="padding:14px 24px 20px;border-top:1px solid #E6E0D6;font-size:13px;color:#4A5468" dir="rtl" align="right">كميونتي تقني بيت لاهيا · <a href="https://beitlahia.tech" style="color:#047857">beitlahia.tech</a><br>وصلك هالإيميل لأنك سجّلت بورشة على موقعنا.</td></tr>
</table></td></tr></table></body></html>`;
}
