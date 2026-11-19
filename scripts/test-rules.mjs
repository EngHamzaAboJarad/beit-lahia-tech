// Firestore rules test: admin permissions (owner / per-section / legacy / invites).
// Run: firebase emulators:exec --only firestore --project demo-bitlahia "node scripts/test-rules.mjs"
import assert from 'node:assert/strict';

const HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const BASE = `http://${HOST}/v1/projects/demo-bitlahia/databases/(default)/documents`;
const OWNER = 'habojarad305@gmail.com';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// the emulator accepts unsigned tokens; "owner" bypasses the rules (used to seed data)
const token = (uid, email, verified = true) => `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
  sub: uid, user_id: uid, email, email_verified: verified, iat: 1, exp: 9999999999, aud: 'demo-bitlahia',
  iss: 'https://securetoken.google.com/demo-bitlahia', auth_time: 1, firebase: { sign_in_provider: 'password' },
})}.`;

const val = (v) => (Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
    : v === 'NOW' ? { timestampValue: new Date().toISOString() } : { stringValue: v });
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));

async function req(method, path, auth, body, mask) {
  const q = mask ? `?${mask.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : '';
  const res = await fetch(`${BASE}/${path}${q}`, {
    method, headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify({ fields: fields(body) }) : undefined,
  });
  return res.status;
}
const get = (path, a) => req('GET', path, a);
const set = (path, a, body) => req('PATCH', path, a, body);
const merge = (path, a, body) => req('PATCH', path, a, body, Object.keys(body));
const del = (path, a) => req('DELETE', path, a);
// writes with request.time: the REST API can't send a server timestamp directly, so use a commit with a transform
async function setWithTime(path, a, body, timeField) {
  const res = await fetch(`${BASE.replace(/\/documents$/, '')}/documents:commit`, {
    method: 'POST', headers: { Authorization: `Bearer ${a}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: { name: `projects/demo-bitlahia/databases/(default)/documents/${path}`, fields: fields(body) },
      updateTransforms: [{ fieldPath: timeField, setToServerValue: 'REQUEST_TIME' }] }] }),
  });
  return res.status;
}

const owner = token('own', OWNER);
const legacy = token('leg', 'old@x.test');
const social = token('soc', 'soc@x.test');
const site = token('sit', 'site@x.test');
const stranger = token('str', 'str@x.test');

// seed
await fetch(`http://${HOST}/emulator/v1/projects/demo-bitlahia/databases/(default)/documents`, { method: 'DELETE' });
const seed = async (path, body) => assert.equal(await set(path, 'owner', body), 200, `seed ${path}`);
await seed('admins/own', { email: OWNER });
await seed('admins/leg', { email: 'old@x.test' });
await seed('admins/soc', { email: 'soc@x.test', perms: ['studio'] });
await seed('admins/sit', { email: 'site@x.test', perms: ['site'] });
await seed('members/m1', { name: 'x' });
await seed('site/settings', { registrationOpen: true });

let n = 0;
const t = async (name, fn) => { await fn(); n++; console.log('ok -', name); };
const OK = 200; const NO = 403;

await t('per-section reads', async () => {
  assert.equal(await get('members/m1', social), NO);
  assert.equal(await get('members/m1', site), NO);
  assert.equal(await get('members/m1', legacy), OK); // no perms field = everything
  assert.equal(await get('members/m1', owner), OK);
  assert.equal(await get('members/m1', stranger), NO);
});
await t('studio permission: saved templates', async () => {
  assert.equal(await setWithTime('socialTemplates/t1', social, { name: 'a', design: '{}' }, 'updatedAt'), OK);
  assert.equal(await setWithTime('socialTemplates/t2', site, { name: 'a', design: '{}' }, 'updatedAt'), NO);
  assert.equal(await get('socialTemplates/t1', social), OK);
  assert.equal(await get('socialTemplates/t1', site), NO);
});
await t('site docs: each permission only its own fields', async () => {
  assert.equal(await set('site/content', site, { x: 'y' }), OK);
  assert.equal(await set('site/content', social, { x: 'y' }), NO);
  assert.equal(await merge('site/settings', site, { socialLinks: ['https://x.test'] }), OK);
  assert.equal(await merge('site/settings', site, { registrationOpen: false }), NO);
  assert.equal(await merge('site/settings', social, { socialLinks: ['https://y.test'] }), NO);
  assert.equal(await merge('site/settings', legacy, { registrationOpen: false }), OK);
  assert.equal(await set('site/forms', site, { surveyOpen: true }), NO);
  assert.equal(await set('site/forms', owner, { surveyOpen: true }), OK);
});
await t('only the owner manages admins', async () => {
  assert.equal(await req('GET', 'admins', owner), OK);
  assert.equal(await req('GET', 'admins', legacy), NO);
  assert.equal(await set('admins/new1', owner, { email: 'n@x.test', perms: ['studio', 'stats'] }), OK);
  assert.equal(await set('admins/new1', owner, { email: 'n@x.test', perms: ['hack'] }), NO);
  assert.equal(await set('admins/new2', legacy, { email: 'n2@x.test', perms: ['studio'] }), NO);
  assert.equal(await set('admins/soc', social, { email: 'soc@x.test', perms: ['studio', 'members'] }), NO); // can't grant yourself more
  assert.equal(await del('admins/own', owner), NO); // can't lock yourself out
  assert.equal(await del('admins/new1', owner), OK);
  assert.equal(await get('admins/soc', social), OK); // everyone reads their own permissions
});
await t('invite for an existing account: claimed after email verification', async () => {
  assert.equal(await set('adminInvites/inv@x.test', owner, { email: 'inv@x.test', perms: ['stats'] }), OK);
  assert.equal(await set('adminInvites/x@x.test', social, { email: 'x@x.test', perms: ['stats'] }), NO);
  const unverified = token('inv', 'inv@x.test', false);
  const verified = token('inv', 'inv@x.test', true);
  assert.equal(await get('adminInvites/inv@x.test', verified), OK);
  assert.equal(await get('adminInvites/inv@x.test', social), NO);
  assert.equal(await set('admins/inv', unverified, { email: 'inv@x.test', perms: ['stats'] }), NO);
  assert.equal(await set('admins/inv', verified, { email: 'inv@x.test', perms: ['stats', 'members'] }), NO); // more than invited
  assert.equal(await set('admins/inv', verified, { email: 'inv@x.test', perms: ['stats'] }), OK);
  assert.equal(await del('adminInvites/inv@x.test', verified), OK);
  assert.equal(await get('members/m1', verified), NO);
});
await t('activity log: admins add their own lines, only the owner reads', async () => {
  const line = (uid, email, extra = {}) => ({ uid, email, type: 'action', text: 'عدّل فعالية', ...extra });
  assert.equal(await setWithTime('adminLog/a1', social, line('soc', 'soc@x.test'), 'at'), OK);
  assert.equal(await setWithTime('adminLog/a2', social, line('sit', 'site@x.test'), 'at'), NO); // someone else's name
  assert.equal(await setWithTime('adminLog/a3', social, line('soc', 'soc@x.test', { type: 'hack' }), 'at'), NO);
  assert.equal(await setWithTime('adminLog/a4', stranger, line('str', 'str@x.test'), 'at'), NO); // not an admin
  assert.equal(await set('adminLog/a5', social, { ...line('soc', 'soc@x.test'), at: 'NOW' }), NO); // the time is the server's
  assert.equal(await get('adminLog/a1', social), NO);
  assert.equal(await get('adminLog/a1', owner), OK);
  assert.equal(await set('adminLog/a1', social, line('soc', 'soc@x.test', { text: 'ما عملت شي' })), NO); // no rewriting history
  assert.equal(await del('adminLog/a1', social), NO);
  assert.equal(await setWithTime('adminSeen/soc', social, { email: 'soc@x.test', tab: 'studio' }, 'seenAt'), OK);
  assert.equal(await setWithTime('adminSeen/sit', social, { email: 'soc@x.test' }, 'seenAt'), NO);
  assert.equal(await get('adminSeen/soc', social), NO);
  assert.equal(await get('adminSeen/soc', owner), OK);
});
// a partial update (only `mask` fields change; a masked field missing from body is deleted), with server-time fields
async function patch(path, a, body, mask, times = []) {
  const res = await fetch(`${BASE.replace(/\/documents$/, '')}/documents:commit`, {
    method: 'POST', headers: { Authorization: `Bearer ${a}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes: [{ update: { name: `projects/demo-bitlahia/databases/(default)/documents/${path}`, fields: fields(body) },
      updateMask: { fieldPaths: mask.filter((m) => !times.includes(m)) }, currentDocument: { exists: true },
      updateTransforms: times.map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) }] }),
  });
  return res.status;
}
const wsAdmin = token('wsk', 'wsk@x.test');
const memAdmin = token('mem', 'mem@x.test');
const memAdmin2 = token('mem2', 'mem2@x.test');
await seed('admins/wsk', { email: 'wsk@x.test', perms: ['workshops'] });
await seed('admins/mem', { email: 'mem@x.test', perms: ['members'] });
await seed('admins/mem2', { email: 'mem2@x.test', perms: ['members'] });
await seed('workshopRegs/r1', { workshopId: 'w1', name: 'سارة أحمد', whatsapp: '+970599123456', consent: true });

await t('check-in: attendance with server time and the scanner\'s own e-mail', async () => {
  assert.equal(await patch('workshopRegs/r1', wsAdmin, { attended: true, attendedBy: 'wsk@x.test' }, ['attended', 'attendedBy', 'attendedAt'], ['attendedAt']), OK);
  assert.equal(await patch('workshopRegs/r1', wsAdmin, { attendedBy: 'someone@x.test' }, ['attendedBy']), NO); // can't sign as another admin
  assert.equal(await patch('workshopRegs/r1', wsAdmin, { attendedAt: 'NOW' }, ['attendedAt']), NO); // a client clock is not accepted
  assert.equal(await patch('workshopRegs/r1', memAdmin, { attended: true }, ['attended']), NO); // needs «workshops»
  assert.equal(await patch('workshopRegs/r1', wsAdmin, { name: 'x' }, ['name']), NO); // the registrant's own data stays as sent
  // un-mark: attended false, time and scanner removed
  assert.equal(await patch('workshopRegs/r1', wsAdmin, { attended: false }, ['attended', 'attendedAt', 'attendedBy']), OK);
});
await t('check-in: e-mail sent flags take the server time only', async () => {
  assert.equal(await patch('workshopRegs/r1', wsAdmin, {}, ['passMailedAt'], ['passMailedAt']), OK);
  assert.equal(await patch('workshopRegs/r1', wsAdmin, { certMailedAt: 'NOW' }, ['certMailedAt']), NO);
  assert.equal(await patch('workshopRegs/r1', wsAdmin, {}, ['certMailedAt'], ['certMailedAt']), OK);
  assert.equal(await get('workshopRegs/r1', memAdmin), NO);
});
await t('member notes: «members» permission only, signed by the writer', async () => {
  assert.equal(await setWithTime('memberNotes/n1', memAdmin, { person: 'p970599123456', text: 'مهتم بالباك إند', by: 'mem@x.test' }, 'at'), OK);
  assert.equal(await setWithTime('memberNotes/n2', memAdmin, { person: 'p970599123456', text: 'x', by: 'other@x.test' }, 'at'), NO);
  assert.equal(await setWithTime('memberNotes/n3', wsAdmin, { person: 'p970599123456', text: 'x', by: 'wsk@x.test' }, 'at'), NO);
  assert.equal(await setWithTime('memberNotes/n4', memAdmin, { person: 'p970599123456', text: 'x', by: 'mem@x.test', extra: 'y' }, 'at'), NO);
  assert.equal(await set('memberNotes/n5', memAdmin, { person: 'p970599123456', text: 'x', by: 'mem@x.test', at: 'NOW' }), NO);
  assert.equal(await get('memberNotes/n1', memAdmin2), OK);
  assert.equal(await get('memberNotes/n1', wsAdmin), NO);
  assert.equal(await get('memberNotes/n1', stranger), NO);
  assert.equal(await set('memberNotes/n1', memAdmin, { person: 'p1', text: 'edited', by: 'mem@x.test', at: 'NOW' }), NO); // notes don't change
  assert.equal(await del('memberNotes/n1', memAdmin2), NO); // only its writer…
  assert.equal(await del('memberNotes/n1', legacy), OK);    // …or a full admin
  assert.equal(await setWithTime('memberNotes/n6', memAdmin, { person: 'e:a@x.test', text: 'y', by: 'mem@x.test' }, 'at'), OK);
  assert.equal(await del('memberNotes/n6', memAdmin), OK);
});
await t('public pages still work', async () => {
  assert.equal(await get('site/settings', token('anon', 'a@x.test')), OK);
});
console.log(`\n${n} rule tests passed`);
