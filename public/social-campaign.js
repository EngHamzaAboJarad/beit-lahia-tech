// Workshop → social campaign: three designs filled from the workshop's data, each with its own time.
//   1. the announcement post  (template «ورشة / دورة»)        → now, or a time you pick
//   2. a countdown story      (template «ستوري: ورشة»)        → the evening before (18:00)
//   3. a «we've started» story (template «ستوري: بلّشنا»)      → when the workshop starts
// The designs are ordinary studio designs: they can be opened in the editor and changed before publishing.
import { BUILTIN } from './social-templates.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const tpl = (id) => clone(BUILTIN.find((d) => d.id === id));
const bySlot = (d, slot) => d.els.find((e) => e.slot === slot);
const set = (d, slot, patch) => { const e = bySlot(d, slot); if (e) Object.assign(e, patch); return e; };
const isLatin = (t) => /^[\x00-\x7F\s]+$/.test(t || '');
const weekday = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long' });
const longDay = new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long' });

export function hoursText(n) {
  n = Number(n) || 0;
  if (n === 1) return 'ساعة واحدة';
  if (n === 2) return 'ساعتين';
  if (n >= 3 && n <= 10) return `${n} ساعات`;
  return `${n} ساعة`;
}
const dayOf = (ymd) => (/^\d{4}-\d{2}-\d{2}$/.test(ymd || '') ? new Date(`${ymd}T12:00:00`) : null);
export const shortDate = (ymd) => { const d = dayOf(ymd); return d ? `${weekday.format(d)} ${d.getDate()}/${d.getMonth() + 1}` : 'قريباً'; };
export const fullDate = (ymd) => { const d = dayOf(ymd); return d ? longDay.format(d) : ''; };

// "5 م", "5:30 مساءً", "10 ص – 1 م", "17:00", "5pm" → [17, 0] (the start time), or null
export function startTime(text) {
  const m = /(\d{1,2})(?::(\d{2}))?\s*(م|مساء|مساءً|pm|ص|صباح|صباحاً|am)?/i.exec(String(text || ''));
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] || 0);
  const pm = /^(م|مساء|مساءً|pm)$/i.test(m[3] || ''); const am = /^(ص|صباح|صباحاً|am)$/i.test(m[3] || '');
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  if (!pm && !am && h >= 1 && h <= 7) h += 12; // «5» for a workshop means 5 in the evening
  return h <= 23 && min <= 59 ? [h, min] : null;
}
// local "YYYY-MM-DDTHH:MM" for <input type="datetime-local">
const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

// "المبرمج المعزَّز: من الفكرة إلى الكود" → ["المبرمج المعزَّز", "من الفكرة إلى الكود"]
export function splitTitle(t) {
  t = String(t || '').trim();
  const m = /\s*[:：–—|-]\s+|\s*[:：]\s*/.exec(t);
  if (m && m.index > 0) return [t.slice(0, m.index).trim(), t.slice(m.index + m[0].length).trim()];
  const w = t.split(/\s+/);
  if (w.length <= 3) return [t, ''];
  const k = Math.ceil(w.length / 2);
  return [w.slice(0, k).join(' '), w.slice(k).join(' ')];
}
// a short description in at most two balanced lines
export function twoLines(text, max = 100) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length > max) {
    const cut = t.slice(0, max);
    const end = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('،'), cut.lastIndexOf('؛'));
    t = end > max * 0.5 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
    t = t.replace(/[،؛,]$/, '…');
  }
  if (t.length < 46) return t;
  const mid = t.length / 2; let best = -1;
  for (let i = 0; i < t.length; i++) if (t[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best > 0 ? `${t.slice(0, best)}\n${t.slice(best + 1)}` : t;
}

/**
 * w: a merged workshop (mergeWorkshop) · opts: { id, url (full registration link), shortUrl, photo }
 * → { title, items: [{ key, label, fmt, design, at (datetime-local or ''), caption, past }] }
 */
export function workshopCampaign(w, opts = {}) {
  const titleAr = w.titleAr || w.title || 'ورشة';
  const [p1, p2] = splitTitle(titleAr);
  const place = w.mode === 'online' ? (w.place || 'أونلاين') : (w.place || 'بيت لاهيا');
  const shortUrl = opts.shortUrl || 'beitlahia.tech/workshop';
  const url = opts.url || `https://${shortUrl}`;
  const when = [shortDate(w.date), w.time].filter(Boolean).join(' · ');
  const st = startTime(w.time);
  const start = w.date ? new Date(`${w.date}T${pad(st ? st[0] : 10)}:${pad(st ? st[1] : 0)}:00`) : null;

  // 1) the announcement post
  const post = tpl('workshop'); post.name = `إعلان: ${titleAr}`;
  const words = p1.split(/\s+/).filter(Boolean);
  if (words.length > 1) { set(post, 't1a', { text: words.slice(0, -1).join(' ') }); set(post, 't1b', { text: words[words.length - 1] }); }
  else { set(post, 't1a', { hidden: true, text: '' }); set(post, 't1b', { text: p1, align: 'middle', x: 540, maxW: 960 }); }
  if (p2) set(post, 't2', { text: p2 }); else set(post, 't2', { hidden: true, text: '' });
  const en = String(w.title || '').trim().split(/\s+/).filter(Boolean);
  if (en.length > 1) { set(post, 'en1', { text: en.slice(0, -1).join(' ') }); set(post, 'en2', { text: en[en.length - 1] }); }
  else if (en.length === 1) { set(post, 'en1', { hidden: true, text: '' }); set(post, 'en2', { text: en[0], align: 'middle', x: 540 }); }
  else { set(post, 'en1', { hidden: true }); set(post, 'en2', { hidden: true }); }
  set(post, 'desc', { text: twoLines(w.description) || `${hoursText(w.hours)} تطبيق عملي` });
  set(post, 'date', { text: shortDate(w.date), font: 'ar' });
  set(post, 'place', { text: place, font: isLatin(place) ? 'en' : 'ar' });
  set(post, 'placeIcon', { icon: w.mode === 'online' ? 'video' : 'pin' });
  set(post, 'hours', { text: hoursText(w.hours) });
  set(post, 'url', { text: shortUrl });
  set(post, 'badge', { text: Number(w.hours) > 8 ? 'دورة' : 'ورشة عمل' });
  if (opts.photo) set(post, 'photo', { src: opts.photo });

  // 2) the countdown story, the evening before
  const remind = tpl('story-event'); remind.name = `تذكير: ${titleAr}`;
  set(remind, 'kicker', { text: 'بكرا!' });
  set(remind, 'title', { text: [p1, p2].filter(Boolean).join('\n') });
  set(remind, 'countdown', { text: 'الورشة بتبلّش', sub: when || 'قريباً' });
  set(remind, 'location', { text: place });
  set(remind, 'link', { text: shortUrl });
  const remindAt = start ? new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 18, 0) : null;

  // 3) «we've started», when it starts
  const live = tpl('story-live'); live.name = `بلّشنا: ${titleAr}`;
  set(live, 'title', { text: [p1, p2].filter(Boolean).join('\n') });
  set(live, 'time', { text: w.time || (st ? `${st[0] > 12 ? st[0] - 12 : st[0]}${st[1] ? `:${pad(st[1])}` : ''} ${st[0] >= 12 ? 'م' : 'ص'}` : 'هلّق') });
  set(live, 'location', { text: place });
  set(live, 'link', { text: shortUrl });

  const caption = [
    `🚀 ${titleAr}${w.title && w.title !== titleAr ? ` (${w.title})` : ''}`,
    '',
    String(w.description || '').trim(),
    '',
    w.date ? `📅 ${fullDate(w.date)}${w.time ? ` · ${w.time}` : ''}` : '',
    `📍 ${w.mode === 'online' ? `أونلاين${w.place ? ` (${w.place})` : ''}` : place}`,
    `⏱️ ${hoursText(w.hours)}`,
    '',
    'سجّل مكانك 👇',
    url,
    '',
    '#بيت_لاهيا_التقني #ورشة #برمجة',
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n').replace(/\n{3,}/g, '\n\n');

  const now = Date.now();
  const item = (key, label, fmt, design, at, cap = '') => ({
    key, label, fmt, design, caption: cap, at: at ? localInput(at) : '', past: !!at && +at < now + 5 * 60e3,
  });
  return {
    title: titleAr,
    items: [
      item('post', 'بوست الإعلان', 'post', post, null, caption),
      item('remind', 'ستوري تذكير (عدّ تنازلي) قبلها بيوم', 'story', remind, remindAt),
      item('live', 'ستوري «بلّشنا» وقت ما تبلّش', 'story', live, start),
    ],
    hasDate: !!start,
  };
}
