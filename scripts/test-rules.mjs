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

const val = (v) => (v && typeof v === 'object' && 'ts' in v ? { timestampValue: new Date(v.ts).toISOString() } : Array.isArray(v) ? { arrayValue: { values: v.map(val) } }
  : typeof v === 'boolean' ? { booleanValue: v } : typeof v === 'number' ? { integerValue: String(v) }
    : v === 'NOW' ? { timestampValue: new Date().toISOString() } : { stringValue: v });
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, val(v)]));

async function req(method, path, auth, body, mask) {
  const q = mask ? `?${mask.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : '';
  const res = await fetch(`${BASE}/${path}${q}`, {
    method, headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': 'application/json' },
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
    method: 'POST', headers: { ...(a ? { Authorization: `Bearer ${a}` } : {}), 'Content-Type': 'application/json' },
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
const galAdmin = token('gal', 'gal@x.test');
const contactAdmin = token('con', 'con@x.test');
const blogAdmin = token('blg', 'blg@x.test');

// seed
await fetch(`http://${HOST}/emulator/v1/projects/demo-bitlahia/databases/(default)/documents`, { method: 'DELETE' });
const seed = async (path, body) => assert.equal(await set(path, 'owner', body), 200, `seed ${path}`);
await seed('admins/own', { email: OWNER });
await seed('admins/leg', { email: 'old@x.test' });
await seed('admins/soc', { email: 'soc@x.test', perms: ['studio'] });
await seed('admins/sit', { email: 'site@x.test', perms: ['site'] });
await seed('admins/gal', { email: 'gal@x.test', perms: ['gallery'] });
await seed('admins/con', { email: 'con@x.test', perms: ['contact'] });
await seed('admins/blg', { email: 'blg@x.test', perms: ['blog'] });
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
await t('site permissions split: content / events / gallery / contact', async () => {
  const thumb = 'data:image/jpeg;base64,' + 'A'.repeat(40);
  const photo = { thumb, caption: 'x', album: 'ورشة المبرمج المعزّز', published: false };
  assert.equal(await set('gallery/g1', galAdmin, photo), OK);
  assert.equal(await set('gallery/g2', galAdmin, { ...photo, album: 'x'.repeat(81) }), NO); // album too long
  assert.equal(await set('gallery/g5', galAdmin, { ...photo, caption: 'ك'.repeat(280), albumDesc: 'و'.repeat(600) }), OK); // caption + post description
  assert.equal(await set('gallery/g6', galAdmin, { ...photo, albumDesc: 'و'.repeat(601) }), NO); // description too long
  assert.equal(await set('gallery/g7', galAdmin, { ...photo, caption: 'ك'.repeat(281) }), NO); // caption too long
  assert.equal(await set('gallery/g3', site, photo), OK); // the old 'site' still opens the gallery
  assert.equal(await set('gallery/g4', contactAdmin, photo), NO);
  assert.equal(await set('galleryFull/g1', galAdmin, { src: thumb }), OK);
  assert.equal(await set('site/content', galAdmin, { x: 'y' }), NO);
  assert.equal(await set('events/e1', galAdmin, { type: 'event', title: 'x', published: false }), NO);
  assert.equal(await set('events/e1', site, { type: 'event', title: 'x', published: false }), OK);
  assert.equal(await merge('site/settings', galAdmin, { socialLinks: ['https://gal.test'] }), NO);
  assert.equal(await merge('site/settings', contactAdmin, { socialLinks: ['https://con.test'] }), OK);
  assert.equal(await set('site/content', contactAdmin, { x: 'y' }), NO);
  assert.equal(await set('admins/new3', owner, { email: 'n3@x.test', perms: ['content', 'events', 'gallery', 'contact', 'studio'] }), OK);
});
await t('blog: «blog» admins write; visitors read published posts only, after their time', async () => {
  const post = (o = {}) => ({ title: 'مقال', slug: 'مقال-تجربة', excerpt: 'x', tags: ['ai'], date: '2026-11-21', status: 'published', pinned: false, readMin: 2, ...o });
  const img = 'data:image/jpeg;base64,' + 'A'.repeat(40);
  assert.equal(await set('blog/p1', blogAdmin, post()), OK);
  assert.equal(await set('blog/p2', blogAdmin, post({ status: 'draft' })), OK);
  assert.equal(await set('blog/p3', blogAdmin, post({ publishAt: { ts: Date.now() + 86400e3 } })), OK); // scheduled
  assert.equal(await set('blog/bad1', blogAdmin, post({ slug: 'has space' })), NO);
  assert.equal(await set('blog/bad2', blogAdmin, post({ status: 'live' })), NO);
  assert.equal(await set('blog/bad3', blogAdmin, post({ hack: 1 })), NO);
  assert.equal(await set('blog/p4', galAdmin, post()), NO);
  assert.equal(await set('blog/p4', site, post()), NO); // the old 'site' doesn't open the blog
  for (const id of ['p1', 'p2', 'p3']) assert.equal(await set(`blogBody/${id}`, blogAdmin, { md: '## نص', cover: '' }), OK);
  assert.equal(await set('blogBody/p1', galAdmin, { md: 'x' }), NO);
  assert.equal(await set('blogMedia/m1', blogAdmin, { src: img, post: 'p1', w: 10, h: 10 }), OK);
  assert.equal(await set('blogMedia/m2', blogAdmin, { src: img, post: 'p2', w: 10, h: 10 }), OK);
  assert.equal(await set('blogMedia/m3', blogAdmin, { src: 'https://x.test/a.png', post: 'p1' }), NO);
  // a visitor (no sign-in)
  assert.equal(await get('blog/p1', null), OK);
  assert.equal(await get('blog/p2', null), NO); // draft
  assert.equal(await get('blog/p3', null), NO); // its time hasn't come
  assert.equal(await get('blogBody/p1', null), OK);
  assert.equal(await get('blogBody/p2', null), NO);
  assert.equal(await get('blogBody/p3', null), NO);
  assert.equal(await get('blogMedia/m1', null), OK);
  assert.equal(await get('blogMedia/m2', null), NO);
  assert.equal(await req('GET', 'blogMedia', null), NO); // no listing the images
  assert.equal(await get('blog/p2', blogAdmin), OK);
  assert.equal(await req('DELETE', 'blog/p2', null), NO);
  assert.equal(await del('blog/p2', blogAdmin), OK);
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
    method: 'POST', headers: { ...(a ? { Authorization: `Bearer ${a}` } : {}), 'Content-Type': 'application/json' },
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
// online workshops (/live): self check-in on the workshop's day, then the meeting link (from the Worker)
const DOCS = 'projects/demo-bitlahia/databases/(default)/documents';
async function commit(a, writes) {
  const res = await fetch(`${BASE.replace(/\/documents$/, '')}/documents:commit`, {
    method: 'POST', headers: { ...(a ? { Authorization: `Bearer ${a}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify({ writes }),
  });
  return res.status;
}
const joinW = (regId, wid) => ({ update: { name: `${DOCS}/liveJoins/${regId}`, fields: fields({ workshopId: wid }) },
  currentDocument: { exists: false }, updateTransforms: [{ fieldPath: 'at', setToServerValue: 'REQUEST_TIME' }] });
const attendW = (regId, by = 'live') => ({ update: { name: `${DOCS}/workshopRegs/${regId}`, fields: fields({ attended: true, attendedBy: by }) },
  updateMask: { fieldPaths: ['attended', 'attendedBy'] }, currentDocument: { exists: true },
  updateTransforms: [{ fieldPath: 'attendedAt', setToServerValue: 'REQUEST_TIME' }] });
const visitor = null; // no sign-in at all
const today = new Date().toISOString().slice(0, 10);
await seed('workshops/wOn', { status: 'live', open: false, title: 'Online', mode: 'online', date: today });
await seed('workshops/wOld', { status: 'done', open: false, title: 'Old', mode: 'online', date: '2024-01-10' });
await seed('workshops/wSite', { status: 'live', open: false, title: 'Onsite', mode: 'onsite', date: today });
await seed('workshopRegs/liveReg000001', { workshopId: 'wOn', name: 'علي', whatsapp: '+970599000001', consent: true });
await seed('workshopRegs/liveReg000002', { workshopId: 'wOn', name: 'منى', whatsapp: '+970599000002', consent: true });
await seed('workshopRegs/liveReg000003', { workshopId: 'wOld', name: 'رامي', whatsapp: '+970599000003', consent: true });
await seed('workshopRegs/liveReg000004', { workshopId: 'wSite', name: 'هبة', whatsapp: '+970599000004', consent: true });

await t('online check-in: a registrant marks their own attendance on the day, nothing else', async () => {
  assert.equal(await commit(visitor, [joinW('liveReg000001', 'wOn'), attendW('liveReg000001')]), OK);
  assert.equal(await get('liveJoins/liveReg000001', visitor), OK); // the Worker reads it without a key
  assert.equal(await req('GET', 'liveJoins', visitor), NO);        // but nobody lists them
  assert.equal(await get('workshopRegs/liveReg000001', visitor), NO); // the registration stays private
  assert.equal(await commit(visitor, [joinW('liveReg000001', 'wOn')]), 409); // once (exists: false)
  assert.equal(await commit(visitor, [attendW('liveReg000001')]), NO);       // no second write to the registration
  assert.equal(await commit(visitor, [joinW('liveReg000002', 'wOn'), attendW('liveReg000002', 'wsk@x.test')]), NO); // signed as 'live' only
  assert.equal(await commit(visitor, [attendW('liveReg000002')]), NO); // the attendance needs its liveJoins in the same write
  assert.equal(await commit(visitor, [joinW('liveReg000002', 'wOld'), attendW('liveReg000002')]), NO); // another workshop
  assert.equal(await commit(visitor, [joinW('liveReg000003', 'wOld'), attendW('liveReg000003')]), NO); // not its day
  assert.equal(await commit(visitor, [joinW('liveReg000004', 'wSite'), attendW('liveReg000004')]), NO); // on-site: the door QR
  assert.equal(await commit(visitor, [joinW('noSuchReg0001', 'wOn')]), NO);
  // already marked by an admin: the liveJoins alone still goes in (to get the link)
  assert.equal(await patch('workshopRegs/liveReg000002', wsAdmin, { attended: true, attendedBy: 'wsk@x.test' }, ['attended', 'attendedBy', 'attendedAt'], ['attendedAt']), OK);
  assert.equal(await commit(visitor, [joinW('liveReg000002', 'wOn'), attendW('liveReg000002')]), NO);
  assert.equal(await commit(visitor, [joinW('liveReg000002', 'wOn')]), OK);
});
const H = 3600e3;
await seed('workshops/wTimed', { status: 'live', open: false, title: 'Timed', mode: 'online', date: '2024-01-10', liveFrom: { ts: Date.now() - H }, liveTo: { ts: Date.now() + H } });
await seed('workshops/wLater', { status: 'live', open: false, title: 'Later', mode: 'online', date: today, liveFrom: { ts: Date.now() + H }, liveTo: { ts: Date.now() + 5 * H } });
await seed('workshopRegs/liveReg000005', { workshopId: 'wTimed', name: 'نور', whatsapp: '+970599000005', consent: true });
await seed('workshopRegs/liveReg000006', { workshopId: 'wLater', name: 'يزن', whatsapp: '+970599000006', consent: true });
await t('online check-in: admin open/close times win over the day window', async () => {
  assert.equal(await commit(visitor, [joinW('liveReg000006', 'wLater'), attendW('liveReg000006')]), NO); // today, but before its time
  assert.equal(await commit(visitor, [joinW('liveReg000005', 'wTimed'), attendW('liveReg000005')]), OK); // inside its times (date ignored)
  assert.equal(await set('workshops/wBadTime', wsAdmin, { status: 'draft', open: false, title: 'x', liveFrom: 'tomorrow' }), NO);
  assert.equal(await set('workshops/wNoTime', wsAdmin, { status: 'draft', open: false, title: 'x' }), OK);
});
await t('online check-in: WhatsApp keys are written by «workshops» admins, read one at a time', async () => {
  assert.equal(await set('liveKeys/wOn_970599000001', wsAdmin, { id: 'liveReg000001' }), OK);
  assert.equal(await set('liveKeys/wOn_970599000009', visitor, { id: 'liveReg000001' }), NO);
  assert.equal(await set('liveKeys/wOn_970599000009', memAdmin, { id: 'liveReg000001' }), NO);
  assert.equal(await set('liveKeys/bad key', wsAdmin, { id: 'liveReg000001' }), NO);
  assert.equal(await set('liveKeys/wOn_970599000005', wsAdmin, { id: 'liveReg000001', name: 'x' }), NO);
  assert.equal(await get('liveKeys/wOn_970599000001', visitor), OK);
  assert.equal(await req('GET', 'liveKeys', visitor), NO);
  assert.equal(await del('liveJoins/liveReg000001', visitor), NO);
  assert.equal(await del('liveJoins/liveReg000001', wsAdmin), OK);
});
await t('workshop registration closes by itself once the workshop day is over', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const ws = (date) => ({ status: 'live', open: true, title: 'W', no: '1', date });
  await seed('workshops/wToday', ws(today));
  await seed('workshops/wPast', ws('2020-01-01'));
  await seed('workshops/wDone', { ...ws(today), status: 'done' });
  const reg = (wid) => ({ workshopId: wid, name: 'سارة أحمد', whatsapp: '+970599123456', consent: true });
  assert.equal(await setWithTime('workshopRegs/dayOk', null, reg('wToday'), 'createdAt'), OK);
  assert.equal(await setWithTime('workshopRegs/dayOver', null, reg('wPast'), 'createdAt'), NO);
  assert.equal(await setWithTime('workshopRegs/isDone', null, reg('wDone'), 'createdAt'), NO);
});
await t('public pages still work', async () => {
  assert.equal(await get('site/settings', token('anon', 'a@x.test')), OK);
});
console.log(`\n${n} rule tests passed`);
