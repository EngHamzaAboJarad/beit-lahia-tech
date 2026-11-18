// Firebase Auth via REST: sign in once (login.mjs), then keep the idToken fresh with the refreshToken.
// The password is never stored: only the refresh token, in ~/.beitlahia-mcp/tokens.json (outside the repo).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const PROJECT_ID = 'flutter-app-distribution-a4166';
// Public web API key (it is visible in every browser that opens the site, not a secret).
export const API_KEY = 'AIzaSyBvmOjQzWXzfTBHa5WTfzHfqYciIvH9eW0';

const DIR = path.join(os.homedir(), '.beitlahia-mcp');
const FILE = path.join(DIR, 'tokens.json');

export function saveTokens(t) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(t, null, 2), { mode: 0o600 });
}
export function loadTokens() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; }
}
export const tokensPath = FILE;

export async function signIn(email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `sign-in failed (${r.status})`);
  const t = {
    email: j.email,
    uid: j.localId,
    idToken: j.idToken,
    refreshToken: j.refreshToken,
    expiresAt: Date.now() + Number(j.expiresIn) * 1000,
  };
  saveTokens(t);
  return t;
}

async function refresh(t) {
  const r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refreshToken }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`Token refresh failed (${j.error?.message || r.status}). Run: npm run login`);
  const n = {
    ...t,
    idToken: j.id_token,
    refreshToken: j.refresh_token || t.refreshToken,
    expiresAt: Date.now() + Number(j.expires_in) * 1000,
  };
  saveTokens(n);
  return n;
}

let cached = null;
// Returns a valid idToken, refreshing it if it expires within 2 minutes.
export async function getIdToken() {
  cached ??= loadTokens();
  if (!cached) throw new Error('Not signed in. Run: npm run login (inside the mcp folder)');
  if (Date.now() > cached.expiresAt - 120_000) cached = await refresh(cached);
  return cached.idToken;
}
export function forceRefresh() {
  cached = null;
  const t = loadTokens();
  if (!t) throw new Error('Not signed in. Run: npm run login');
  return refresh(t).then(n => (cached = n).idToken);
}
