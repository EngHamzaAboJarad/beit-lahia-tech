// Anonymous visit counter: one number per page per day (stats/{YYYY-MM-DD}), no personal data,
// no cookies. Each browser counts once per page per day; admins are never counted.
import { getDbLite } from './firebase-init.js';

const EVENTS = ['home', 'join', 'start'];

/** Today's date in Gaza (the counters' day boundary), as YYYY-MM-DD. */
export function gazaDay(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Gaza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Count this page view: 'home' (landing), 'join' (form page), 'start' (began filling the form). */
export async function track(event) {
  if (!EVENTS.includes(event) || read('blt-admin') === '1' || navigator.webdriver) return;
  const day = gazaDay();
  const key = `blt-seen-${event}`;
  if (read(key) === day) return;
  write(key, day); // mark first, so two quick calls can't both count
  try {
    const { db, fs } = await getDbLite();
    await fs.setDoc(fs.doc(db, 'stats', day), { [event]: fs.increment(1) }, { merge: true });
  } catch (e) {
    write(key, ''); // try again on the next visit
    console.warn('[stats]', e);
  }
}
