// Shared Firebase bootstrap for every page (lazy: nothing loads until a page asks for it)
// namespace import: a stale cached firebase-config.js missing a newer export must never break the page
import * as siteConfig from './firebase-config.js';

const localConfig = siteConfig.firebaseConfig;
const appCheckSiteKey = siteConfig.appCheckSiteKey || '';

export const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
export const IS_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

let appPromise = null;
export function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const [{ initializeApp }, config] = await Promise.all([
        import(`${SDK}/firebase-app.js`),
        (async () => {
          if (localConfig && localConfig.projectId) return localConfig;
          // Firebase Hosting (and its emulator) serve the project config here
          const res = await fetch('/__/firebase/init.json', { cache: 'no-store' });
          if (!res.ok) throw new Error('firebase-config-missing');
          return res.json();
        })(),
      ]);
      const app = initializeApp(config);
      // App Check must start before Firestore/Auth make their first request
      if (appCheckSiteKey && !IS_LOCAL) {
        try {
          const ac = await import(`${SDK}/firebase-app-check.js`);
          ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
        } catch (e) { console.warn('[app-check]', e); }
      }
      return app;
    })();
    appPromise.catch(() => { appPromise = null; });
  }
  return appPromise;
}

const cache = {};
function once(key, factory) {
  if (!cache[key]) {
    cache[key] = factory();
    cache[key].catch(() => { delete cache[key]; });
  }
  return cache[key];
}

/** Full Firestore SDK (forms, admin). Resolves to { db, fs }. */
export const getDb = () => once('db', async () => {
  const [app, fs] = await Promise.all([getApp(), import(`${SDK}/firebase-firestore.js`)]);
  const db = fs.getFirestore(app);
  if (IS_LOCAL) fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { db, fs };
});

/** Lightweight read-only Firestore (landing page). Resolves to { db, fs }. */
export const getDbLite = () => once('lite', async () => {
  const [app, fs] = await Promise.all([getApp(), import(`${SDK}/firebase-firestore-lite.js`)]);
  const db = fs.getFirestore(app);
  if (IS_LOCAL) fs.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  return { db, fs };
});

/** Firebase Auth. Resolves to { auth, au }. */
export const getAuth = () => once('auth', async () => {
  const [app, au] = await Promise.all([getApp(), import(`${SDK}/firebase-auth.js`)]);
  const auth = au.getAuth(app);
  if (IS_LOCAL) au.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  return { auth, au };
});
