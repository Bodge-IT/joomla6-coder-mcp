import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as crypto from 'crypto';

import { GitHubSync } from './sync/github-sync.js';
import { IndexBuilder, JoomlaIndex } from './parser/index-builder.js';
import { getToolDefinitions, getToolHandler, ToolContext } from './tools/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3100', 10);
const HOST = process.env.HOST || '0.0.0.0';

let joomlaIndex: JoomlaIndex | null = null;
const sync = new GitHubSync();
const indexBuilder = new IndexBuilder();
const indexPath = path.join(__dirname, '..', 'src', 'data', 'index.json');

const toolContext: ToolContext = {
  getIndex: () => joomlaIndex,
  setIndex: (idx) => { joomlaIndex = idx; },
  sync,
  indexBuilder,
  indexPath,
};

const registeredClients = new Map<string, any>();
const authCodes = new Map<string, { clientId: string; redirectUri: string; codeChallenge?: string }>();

async function loadOrBuildIndex(): Promise<JoomlaIndex | null> {
  const existing = await indexBuilder.loadIndex(indexPath);
  if (existing) {
    console.log('Loaded index: ' + existing.classes.length + ' classes');
    return existing;
  }
  try {
    const si = await sync.getLastSyncInfo();
    if (si) {
      const idx = await indexBuilder.buildIndex(sync.getLibrariesPath(), si.commit);
      await indexBuilder.saveIndex(idx, indexPath);
      return idx;
    }
  } catch { /* no cached index */ }
  return null;
}

function createServer(): Server {
  const server = new Server(
    { name: 'joomla6-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getToolDefinitions()
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const handler = getToolHandler(name);
    if (!handler) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    return handler(args as Record<string, unknown>, toolContext);
  });

  return server;
}

async function main() {
  joomlaIndex = await loadOrBuildIndex();

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use((req, _res, next) => { console.log(req.method + ' ' + req.url); next(); });

  // OAuth endpoints (auto-approve for trusted network)
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    const b = 'http://' + req.headers.host;
    res.json({
      issuer: b,
      authorization_endpoint: b + '/authorize',
      token_endpoint: b + '/token',
      registration_endpoint: b + '/register',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none']
    });
  });

  app.post('/register', (req, res) => {
    const id = crypto.randomUUID();
    registeredClients.set(id, {});
    res.status(201).json({ client_id: id, redirect_uris: req.body.redirect_uris || [] });
  });

  app.get('/authorize', (req, res) => {
    const { client_id, redirect_uri, state, code_challenge } = req.query;
    const code = crypto.randomBytes(32).toString('hex');
    authCodes.set(code, {
      clientId: client_id as string,
      redirectUri: redirect_uri as string,
      codeChallenge: code_challenge as string
    });
    const u = new URL(redirect_uri as string);
    u.searchParams.set('code', code);
    if (state) u.searchParams.set('state', state as string);
    res.redirect(u.toString());
  });

  app.post('/token', (req, res) => {
    const { code } = req.body;
    const ac = authCodes.get(code);
    if (!ac) return res.status(400).json({ error: 'invalid_grant' });
    authCodes.delete(code);
    const at = crypto.randomBytes(32).toString('hex');
    res.json({ access_token: at, token_type: 'Bearer', expires_in: 3600 });
  });

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  const server = createServer();
  const transports = new Map<string, SSEServerTransport>();

  app.get('/sse', async (req, res) => {
    console.log('SSE connection from: ' + req.ip);
    const transport = new SSEServerTransport('/message', res);
    const sid = (transport as any)._sessionId;
    console.log('Session: ' + sid);
    transports.set(sid, transport);
    res.on('close', () => { transports.delete(sid); });
    try { await server.connect(transport); } catch (e) { console.error(e); }
  });

  app.post('/message', async (req, res) => {
    const sid = req.query.sessionId as string;
    if (!sid) return res.status(400).json({ error: 'missing sessionId' });
    const t = transports.get(sid);
    if (!t) return res.status(400).json({ error: 'unknown session' });
    try {
      await t.handlePostMessage(req, res, req.body);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'internal error' });
    }
  });

  app.listen(PORT, HOST, () => console.log(`joomla6-mcp up on ${HOST}:${PORT}`));
}

main().catch(console.error);
