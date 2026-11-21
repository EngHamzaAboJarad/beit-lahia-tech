// The site's public data from the Worker's edge cache (social-worker/src/site.js): one quick request from
// Cloudflare near the visitor instead of several to Firestore in the US. Up to a minute old; the admin panel
// clears it after a change. If it fails, each page falls back to reading Firestore itself.
//   siteData('home' | 'gallery' | 'blog') → the parsed answer (timestamps as Timestamp-like objects)
import { IS_LOCAL } from './firebase-init.js';

export const SITE_API = 'https://social.beitlahia.tech/site/';
// on localhost the pages read the emulator; localStorage «blt-site-data» = 'live' tries the real Worker instead
const useWorker = !IS_LOCAL || (() => { try { return localStorage.getItem('blt-site-data') === 'live'; } catch { return false; } })();

const stamp = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6, toMillis: () => ms, toDate: () => new Date(ms) });
const revive = (_k, v) => (v && typeof v === 'object' && typeof v.$ts === 'number' && Object.keys(v).length === 1 ? stamp(v.$ts) : v);

const pending = {};
export function siteData(kind) {
  if (!useWorker) return Promise.reject(new Error('site-data: local'));
  if (!pending[kind]) {
    // same request as the page's <link rel="preload" as="fetch" crossorigin>, so it reuses that download
    pending[kind] = fetch(SITE_API + kind, { signal: AbortSignal.timeout?.(6000) })
      .then((r) => { if (!r.ok) throw new Error(`site-data ${r.status}`); return r.text(); })
      .then((s) => JSON.parse(s, revive));
    pending[kind].catch(() => { delete pending[kind]; });
  }
  return pending[kind];
}
