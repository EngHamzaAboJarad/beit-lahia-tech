// Minimal Firestore REST client + JSON <-> Firestore value conversion.
import { PROJECT_ID, getIdToken, forceRefresh } from './auth.mjs';

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (typeof v === 'object') {
    if ('$timestamp' in v) return { timestampValue: new Date(v.$timestamp).toISOString() };
    return { mapValue: { fields: toFields(v) } };
  }
  throw new Error('Unsupported value');
}
export const toFields = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));

export function fromValue(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromValue);
  if ('mapValue' in v) return fromFields(v.mapValue.fields || {});
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}
export const fromFields = f => Object.fromEntries(Object.entries(f).map(([k, v]) => [k, fromValue(v)]));

export const fromDoc = d => ({ id: d.name.split('/').pop(), ...fromFields(d.fields || {}), _updateTime: d.updateTime });

async function call(method, url, body, retry = true) {
  const token = await getIdToken();
  const r = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && retry) { await forceRefresh(); return call(method, url, body, false); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.error?.message || j[0]?.error?.message || `HTTP ${r.status}`;
    throw new Error(r.status === 403 ? `Denied by Firestore rules: ${msg}` : msg);
  }
  return j;
}

export async function getDoc(col, id) {
  return fromDoc(await call('GET', `${BASE}/${col}/${encodeURIComponent(id)}`));
}

export async function listDocs(col, { limit = 50, pageToken } = {}) {
  const q = new URLSearchParams({ pageSize: String(limit) });
  if (pageToken) q.set('pageToken', pageToken);
  const j = await call('GET', `${BASE}/${col}?${q}`);
  return { docs: (j.documents || []).map(fromDoc), nextPageToken: j.nextPageToken };
}

const OPS = { '==': 'EQUAL', '!=': 'NOT_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL', 'array-contains': 'ARRAY_CONTAINS', in: 'IN' };

export async function query(col, { where = [], orderBy, direction = 'ASCENDING', limit = 50 }) {
  const filters = where.map(w => ({
    fieldFilter: { field: { fieldPath: w.field }, op: OPS[w.op], value: toValue(w.value) },
  }));
  const sq = { from: [{ collectionId: col }], limit };
  if (filters.length === 1) sq.where = filters[0];
  else if (filters.length > 1) sq.where = { compositeFilter: { op: 'AND', filters } };
  if (orderBy) sq.orderBy = [{ field: { fieldPath: orderBy }, direction }];
  const j = await call('POST', `${BASE}:runQuery`, { structuredQuery: sq });
  return j.filter(x => x.document).map(x => fromDoc(x.document));
}

// create: fails if the doc exists. patch: only the given fields are changed (updateMask).
export async function createDoc(col, id, data) {
  const url = id ? `${BASE}/${col}?documentId=${encodeURIComponent(id)}` : `${BASE}/${col}`;
  return fromDoc(await call('POST', url, { fields: toFields(data) }));
}
export async function patchDoc(col, id, data) {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${encodeURIComponent('`' + k + '`')}`).join('&');
  return fromDoc(await call('PATCH', `${BASE}/${col}/${encodeURIComponent(id)}?${mask}&currentDocument.exists=true`, { fields: toFields(data) }));
}
