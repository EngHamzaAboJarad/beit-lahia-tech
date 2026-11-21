// Local emulator only (never the real Firebase): accounts for trying the admin permissions.
//   firebase emulators:start --project demo-bitlahia
//   node scripts/seed-emulator-roles.mjs
// then sign in at http://localhost:5000/admin with any account below.
const PROJECT = 'demo-bitlahia';
const PASSWORD = 'emulator-only-123';
const USERS = [
  { email: 'habojarad305@gmail.com', perms: null, name: 'صاحب المنصة' },   // owner: everything + «المشرفين»
  { email: 'social@test.local', perms: ['studio'], name: 'مسؤول السوشيال' },
  { email: 'site@test.local', perms: ['site', 'stats'], name: 'محرر الموقع' },
  { email: 'studio-site@test.local', perms: ['studio', 'site'], name: 'سوشيال + محتوى الموقع' },   // the old 'site' = content + events + gallery + contact
  { email: 'gallery@test.local', perms: ['gallery'], name: 'مسؤول المعرض' },
];

for (const u of USERS) {
  let res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u.email, password: PASSWORD, returnSecureToken: true }),
  });
  let data = await res.json();
  if (!res.ok) { // already there: sign in to get the uid
    res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: PASSWORD, returnSecureToken: true }),
    });
    data = await res.json();
  }
  const fields = { email: { stringValue: u.email }, name: { stringValue: u.name } };
  if (u.perms) fields.perms = { arrayValue: { values: u.perms.map((p) => ({ stringValue: p })) } };
  const put = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents/admins/${data.localId}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }),
  });
  console.log(put.ok ? 'ok' : 'FAILED', u.email, u.perms ? u.perms.join(',') : 'all');
}
console.log(`password for all: ${PASSWORD} (emulator only)`);
