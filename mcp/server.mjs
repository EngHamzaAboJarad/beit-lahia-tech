// MCP server (stdio) for the Beit Lahia Tech site. Full read/write through the admin's Firebase sign-in.
// By design there is NO delete tool, and soft-delete (deletedAt) is refused too.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadTokens } from './auth.mjs';
import { getDoc, listDocs, query, createDoc, patchDoc } from './firestore.mjs';

const COLLECTIONS = ['members', 'stats', 'site', 'workshops', 'workshopRegs', 'trainers', 'topicSurveys',
  'certificates', 'events', 'team', 'gallery', 'galleryFull'];
const col = z.enum(COLLECTIONS).describe('Firestore collection');
const out = o => ({ content: [{ type: 'text', text: JSON.stringify(o, null, 2) }] });
const fail = e => ({ isError: true, content: [{ type: 'text', text: String(e.message || e) }] });
const wrap = fn => async a => { try { return out(await fn(a)); } catch (e) { return fail(e); } };

const server = new McpServer({ name: 'beit-lahia', version: '1.0.0' });

server.tool('whoami', 'Which admin account the server is signed in as.', {}, wrap(async () => {
  const t = loadTokens();
  return t ? { email: t.email, uid: t.uid } : { error: 'Not signed in. Run `npm run login` in the mcp folder.' };
}));

server.tool('list_documents', 'List documents in a collection (paged).',
  { collection: col, limit: z.number().int().min(1).max(300).default(50), pageToken: z.string().optional() },
  wrap(({ collection, limit, pageToken }) => listDocs(collection, { limit, pageToken })));

server.tool('get_document', 'Get one document by id.', { collection: col, id: z.string() },
  wrap(({ collection, id }) => getDoc(collection, id)));

server.tool('query_documents',
  'Query a collection with simple filters. Example where: [{"field":"status","op":"==","value":"student"}].',
  {
    collection: col,
    where: z.array(z.object({
      field: z.string(),
      op: z.enum(['==', '!=', '<', '<=', '>', '>=', 'array-contains', 'in']),
      value: z.any(),
    })).default([]),
    orderBy: z.string().optional(),
    direction: z.enum(['ASCENDING', 'DESCENDING']).default('ASCENDING'),
    limit: z.number().int().min(1).max(300).default(50),
  },
  wrap(({ collection, ...q }) => query(collection, q)));

const DATA = z.record(z.any()).describe('Fields as JSON. Timestamps: {"$timestamp":"2026-11-20T18:00:00Z"}.');
const noSoftDelete = d => {
  if ('deletedAt' in d) throw new Error('Deleting (including soft delete via deletedAt) is disabled in this MCP.');
};

server.tool('create_document', 'Create a new document (fails if the id already exists). Firestore rules still apply.',
  { collection: col, id: z.string().optional().describe('Omit for an auto id'), data: DATA },
  wrap(({ collection, id, data }) => { noSoftDelete(data); return createDoc(collection, id, data); }));

server.tool('update_document',
  'Update only the given fields of an existing document (other fields are untouched). Firestore rules still apply.',
  { collection: col, id: z.string(), data: DATA },
  wrap(({ collection, id, data }) => { noSoftDelete(data); return patchDoc(collection, id, data); }));

await server.connect(new StdioServerTransport());
