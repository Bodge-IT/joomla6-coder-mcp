import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';
import * as crypto from 'crypto';

import { GitHubSync } from './sync/github-sync.js';
import { IndexBuilder, JoomlaIndex } from './parser/index-builder.js';
import { IntelephenseBridge } from './lsp/index.js';
import { SqlSchemaParser, SchemaIndex } from './parser/sql-schema-parser.js';
import { getToolDefinitions, getToolHandler, ToolContext } from './tools/registry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '3500', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const MCP_INSTRUCTIONS = process.env.MCP_INSTRUCTIONS ||
  'Joomla 6 API intelligence. The bundled index is pre-loaded — tools work immediately without running joomla_sync. ' +
  'Two entry paths: ' +
  '(1) Exploring a concept? → Start with joomla_coding_patterns (categories: mvc, events, forms, database, authentication, routing, assets, language, api, cli), then use joomla_search for specific classes mentioned in the patterns. ' +
  '(2) Know the class name? → Start with joomla_search, then joomla_lookup_class for full API details. ' +
  'Also: joomla_schema for database tables, joomla_list_events for plugin events, joomla_get_services for DI providers. ' +
  'Run joomla_sync only if you need the very latest dev branch changes.';

let joomlaIndex: JoomlaIndex | null = null;
let lspBridge: IntelephenseBridge | null = null;
let schemaIndex: SchemaIndex | null = null;
const sync = new GitHubSync();
const indexBuilder = new IndexBuilder();
const schemaParser = new SqlSchemaParser();
const indexPath = path.join(DATA_DIR, 'index.json');
const schemaPath = path.join(DATA_DIR, 'schema.json');

const toolContext: ToolContext = {
  getIndex: () => joomlaIndex,
  setIndex: (idx) => { joomlaIndex = idx; },
  sync,
  indexBuilder,
  indexPath,
  getBridge: () => lspBridge,
  getSchema: () => schemaIndex,
  setSchema: (s) => { schemaIndex = s; },
  schemaParser,
  schemaPath,
};

const registeredClients = new Map<string, any>();
const authCodes = new Map<string, { clientId: string; redirectUri: string }>();

async function loadOrBuildIndex(): Promise<JoomlaIndex | null> {
  const existing = await indexBuilder.loadIndex(indexPath);
  if (existing) {
    console.log('Loaded index: ' + existing.classes.length + ' classes');
    return existing;
  }
  try {
    const si = await sync.getLastSyncInfo();
    if (si) {
      const idx = await indexBuilder.buildIndex(sync.getLibrariesPath(), si.commit, sync.getBranch());
      await indexBuilder.saveIndex(idx, indexPath);
      return idx;
    }
  } catch { /* no cached index */ }
  return null;
}

async function loadSchema(): Promise<SchemaIndex | null> {
  // Try cached JSON first
  try {
    const cached = await fs.readFile(schemaPath, 'utf-8');
    const schema: SchemaIndex = JSON.parse(cached);
    if (schema.tables.length > 0) {
      console.log(`Loaded schema from cache: ${schema.tables.length} tables`);
      return schema;
    }
  } catch { /* no cache, parse SQL */ }

  // Fall back to SQL parsing
  try {
    const sqlPath = sync.getSqlPath();
    const schema = await schemaParser.parseDirectory(sqlPath);
    if (schema.tables.length > 0) {
      console.log(`Parsed schema: ${schema.tables.length} tables`);
      // Save to cache
      await fs.mkdir(path.dirname(schemaPath), { recursive: true });
      await fs.writeFile(schemaPath, JSON.stringify(schema, null, 2));
      console.log(`Schema cached to ${schemaPath}`);
      return schema;
    }
  } catch { /* no SQL files yet */ }
  return null;
}

function createServer(): Server {
  const server = new Server(
    { name: 'joomla6-mcp', version: '1.0.0' },
    { capabilities: { tools: {} }, instructions: MCP_INSTRUCTIONS }
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

async function startLspBridge(): Promise<void> {
  const workspaceRoot = sync.getLibrariesPath();
  try {
    lspBridge = new IntelephenseBridge(workspaceRoot);
    await lspBridge.start();
    console.log('Intelephense LSP bridge started');
  } catch (e) {
    console.error('Failed to start Intelephense (LSP tools will be unavailable until restart):', e);
    // Keep bridge instance alive — restart logic will attempt recovery
  }
}

async function main() {
  joomlaIndex = await loadOrBuildIndex();
  schemaIndex = await loadSchema();

  // Start LSP bridge in background (non-blocking)
  startLspBridge().catch(console.error);

  const app = express();
  app.use(cors());
  app.use((req, res, next) => {
    if (req.path === '/mcp') return next();
    express.json()(req, res, next);
  });
  app.use((req, _res, next) => { console.log(req.method + ' ' + req.url); next(); });

  // OAuth endpoints (auto-approve for trusted network)
  app.get('/.well-known/oauth-authorization-server', (req, res) => {
    const baseUrl = 'http://' + req.headers.host;
    res.json({
      issuer: baseUrl,
      authorization_endpoint: baseUrl + '/authorize',
      token_endpoint: baseUrl + '/token',
      registration_endpoint: baseUrl + '/register',
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
    const { client_id, redirect_uri, state } = req.query;
    const code = crypto.randomBytes(32).toString('hex');
    authCodes.set(code, {
      clientId: client_id as string,
      redirectUri: redirect_uri as string,
    });
    const u = new URL(redirect_uri as string);
    u.searchParams.set('code', code);
    if (state) u.searchParams.set('state', state as string);
    res.redirect(u.toString());
  });

  app.post('/token', (req, res) => {
    const { code } = req.body;
    const authCode = authCodes.get(code);
    if (!authCode) return res.status(400).json({ error: 'invalid_grant' });
    authCodes.delete(code);
    const accessToken = crypto.randomBytes(32).toString('hex');
    res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: 3600 });
  });

  app.get('/health', (_req, res) => {
    const indexCount = joomlaIndex?.classes.length ?? 0;
    const schemaCount = schemaIndex?.tables.length ?? 0;
    const lspStatus = lspBridge?.getStatus() ?? { ready: false, pid: null, restarts: 0 };
    res.json({
      status: 'ok',
      index: { classes: indexCount },
      schema: { tables: schemaCount },
      lsp: lspStatus,
    });
  });

  const server = createServer();
  const transports = new Map<string, SSEServerTransport | StreamableHTTPServerTransport>();

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
      if (t instanceof SSEServerTransport) {
        await t.handlePostMessage(req, res, req.body);
      } else {
        res.status(400).json({ error: 'Use /mcp endpoint for streamable HTTP sessions' });
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'internal error' });
    }
  });

  // Streamable HTTP transport (more efficient than SSE for large responses)
  app.all('/mcp', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (req.method === 'GET') {
        // SSE stream for server-initiated messages
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => crypto.randomUUID(),
          onsessioninitialized: (sid) => {
            transports.set(sid, transport);
          },
        });
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) transports.delete(sid);
        };
        await server.connect(transport);
        await transport.handleRequest(req, res);
        return;
      }

      if (req.method === 'POST') {
        if (sessionId && transports.has(sessionId)) {
          // Existing session
          const transport = transports.get(sessionId)!;
          if (transport instanceof StreamableHTTPServerTransport) {
            await transport.handleRequest(req, res);
          } else {
            res.status(400).json({ error: 'Session is SSE, not streamable HTTP' });
          }
        } else {
          // New session
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (sid) => {
              transports.set(sid, transport);
            },
          });
          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) transports.delete(sid);
          };
          await server.connect(transport);
          await transport.handleRequest(req, res);
        }
        return;
      }

      if (req.method === 'DELETE') {
        if (sessionId && transports.has(sessionId)) {
          const transport = transports.get(sessionId)!;
          if (transport instanceof StreamableHTTPServerTransport) {
            await transport.handleRequest(req, res);
            transports.delete(sessionId);
          } else {
            res.status(400).json({ error: 'Session is SSE, not streamable HTTP' });
          }
        } else {
          res.status(404).json({ error: 'Session not found' });
        }
        return;
      }

      res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
      console.error('Streamable HTTP error:', e);
      if (!res.headersSent) {
        res.status(500).json({ error: 'internal error' });
      }
    }
  });

  app.listen(PORT, HOST, () => console.log(`joomla6-mcp up on ${HOST}:${PORT}`));

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    if (lspBridge) await lspBridge.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch(console.error);
