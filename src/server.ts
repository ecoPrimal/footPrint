// SPDX-License-Identifier: AGPL-3.0-or-later
import express from 'express';
import type { Request, Response } from 'express';
import type { Server } from 'node:http';
import { readdir, readFile, writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import type { CacheClearResponse } from './types/api.js';
import type { ProjectFile, SaveResponse, DeleteResponse, ErrorResponse } from './types/project.js';
import { parseCommandPayload } from './agent/protocol.js';
import {
  initAgentBridge,
  getShadowState,
  isBrowserConnected,
  sendCommand,
  sendAgentMessage,
  sendAgentAction,
  getUserMessages,
} from './agent/server-bridge.js';
import {
  ALLOWED_HOSTS,
  CACHE_TTLS,
  USER_AGENT,
  JSON_BODY_LIMIT,
  SHUTDOWN_GRACE_MS,
  SERVER_PORT,
  PROJECTS_PATH,
  PROXY_PATH,
  CACHE_PATH,
  CAS_PATH,
  CAS_FAMILY,
  AGENT_PATH,
  HEALTH_PATH,
  AGENT_BRIDGE_PATH,
  APP_VERSION,
  CACHE_KEY_HASH_LENGTH,
} from './constants.js';
import { createNeuralApiClient, isNeuralApiUnavailable, NeuralApiRpcError } from './neural-api.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = join(__dirname, '..');

export interface ServerOptions {
  readonly root?: string;
  readonly projectsDir?: string;
  readonly cacheDir?: string;
  readonly enableAgentBridge?: boolean;
}

function sanitizeProjectName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function createApp(options: ServerOptions = {}): Promise<express.Application> {
  const root = options.root ?? DEFAULT_ROOT;
  const projectsDir = options.projectsDir ?? process.env['FOOTPRINT_PROJECTS_DIR'] ?? join(root, 'projects');
  const cacheDir = options.cacheDir ?? process.env['FOOTPRINT_CACHE_DIR'] ?? join(root, 'cache');

  const app = express();

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.text({ limit: JSON_BODY_LIMIT, type: 'text/plain' }));

  app.use((_req: Request, res: Response, next: () => void) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.arcgisonline.com https://*.tile.openstreetmap.org https://tiles.arcgis.com https://server.arcgisonline.com",
        "connect-src 'self' ws: wss:",
        "font-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
      ].join('; '),
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(express.static(join(root, 'public')));
  app.use(express.static(join(root, 'dist', 'client')));

  await mkdir(projectsDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  app.get(PROJECTS_PATH, async (_req: Request, res: Response) => {
    try {
      const files = await readdir(projectsDir);
      const projects = files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''));
      res.json(projects);
    } catch {
      res.status(500).json({ error: 'Failed to list projects' } satisfies ErrorResponse);
    }
  });

  app.get(`${PROJECTS_PATH}/:name`, async (req: Request<{ name: string }>, res: Response) => {
    try {
      const safeName = sanitizeProjectName(req.params.name ?? '');
      const filePath = join(projectsDir, `${safeName}.json`);
      const data = await readFile(filePath, 'utf-8');
      res.json(JSON.parse(data) as ProjectFile);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        res.status(404).json({ error: 'Project not found' } satisfies ErrorResponse);
        return;
      }
      res.status(500).json({ error: 'Failed to load project' } satisfies ErrorResponse);
    }
  });

  app.post(`${PROJECTS_PATH}/:name`, async (req: Request<{ name: string }>, res: Response) => {
    try {
      const body: unknown = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res
          .status(400)
          .json({ error: 'Invalid project — must include name, savedAt, and layers' } satisfies ErrorResponse);
        return;
      }
      const rec = body as Record<string, unknown>;
      if (typeof rec['name'] !== 'string' || typeof rec['savedAt'] !== 'string' || typeof rec['layers'] !== 'object') {
        res
          .status(400)
          .json({ error: 'Invalid project — must include name, savedAt, and layers' } satisfies ErrorResponse);
        return;
      }
      const project = body as ProjectFile;
      const safeName = sanitizeProjectName(req.params.name ?? '');
      const filePath = join(projectsDir, `${safeName}.json`);
      await writeFile(filePath, JSON.stringify(project, null, 2), 'utf-8');
      res.json({ saved: safeName } satisfies SaveResponse);
    } catch {
      res.status(500).json({ error: 'Failed to save project' } satisfies ErrorResponse);
    }
  });

  app.delete(`${PROJECTS_PATH}/:name`, async (req: Request<{ name: string }>, res: Response) => {
    try {
      const safeName = sanitizeProjectName(req.params.name ?? '');
      const filePath = join(projectsDir, `${safeName}.json`);
      await unlink(filePath);
      res.json({ deleted: safeName } satisfies DeleteResponse);
    } catch (err: unknown) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        res.status(404).json({ error: 'Project not found' } satisfies ErrorResponse);
        return;
      }
      res.status(500).json({ error: 'Failed to delete project' } satisfies ErrorResponse);
    }
  });

  function cacheKey(url: string, body: string): string {
    return createHash('sha256')
      .update(url + body)
      .digest('hex')
      .slice(0, CACHE_KEY_HASH_LENGTH);
  }

  function ttlForUrl(url: string): number {
    if (url.includes('overpass')) return CACHE_TTLS.overpass;
    if (url.includes('fema.gov')) return CACHE_TTLS.fema;
    if (url.includes('epqs.nationalmap.gov')) return CACHE_TTLS.elevation;
    if (url.includes('sdmdataaccess')) return CACHE_TTLS.soils;
    return CACHE_TTLS.default;
  }

  async function getCached(key: string, ttl: number): Promise<unknown> {
    try {
      const filePath = join(cacheDir, `${key}.json`);
      const info = await stat(filePath);
      if (Date.now() - info.mtimeMs > ttl) return null;
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as unknown;
    } catch {
      return null;
    }
  }

  async function setCache(key: string, data: unknown): Promise<void> {
    const filePath = join(cacheDir, `${key}.json`);
    await writeFile(filePath, JSON.stringify(data), 'utf-8');
  }

  function isHostAllowed(targetUrl: string): boolean {
    try {
      const parsed = new URL(targetUrl);
      return ALLOWED_HOSTS.some((h) => parsed.hostname.endsWith(h));
    } catch {
      return false;
    }
  }

  async function handleProxyGet(req: Request, res: Response): Promise<void> {
    const targetUrl = req.query['url'];
    if (typeof targetUrl !== 'string' || targetUrl === '') {
      res.status(400).json({ error: 'Missing url parameter' } satisfies ErrorResponse);
      return;
    }

    if (!isHostAllowed(targetUrl)) {
      res.status(403).json({ error: 'Host not allowed' } satisfies ErrorResponse);
      return;
    }

    try {
      const key = cacheKey(targetUrl, '');
      const ttl = ttlForUrl(targetUrl);
      const cached = await getCached(key, ttl);
      if (cached !== null) {
        res.set('X-Cache', 'HIT');
        res.json(cached);
        return;
      }

      const resp = await fetch(targetUrl, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!resp.ok) {
        res
          .status(resp.status)
          .json({ error: `Upstream ${String(resp.status)}: ${resp.statusText}` } satisfies ErrorResponse);
        return;
      }
      const ct = resp.headers.get('content-type') ?? '';
      if (!ct.includes('json') && !ct.includes('geojson')) {
        res.status(502).json({ error: `Upstream returned non-JSON content-type: ${ct}` } satisfies ErrorResponse);
        return;
      }
      const data: unknown = await resp.json();
      await setCache(key, data);
      res.set('X-Cache', 'MISS');
      res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: 'Proxy request failed', detail: message } satisfies ErrorResponse);
    }
  }

  async function handleProxyPost(req: Request, res: Response): Promise<void> {
    const targetUrl = req.query['url'];
    if (typeof targetUrl !== 'string' || targetUrl === '') {
      res.status(400).json({ error: 'Missing url parameter' } satisfies ErrorResponse);
      return;
    }

    if (!isHostAllowed(targetUrl)) {
      res.status(403).json({ error: 'Host not allowed' } satisfies ErrorResponse);
      return;
    }

    try {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const key = cacheKey(targetUrl, body);
      const ttl = ttlForUrl(targetUrl);
      const cached = await getCached(key, ttl);
      if (cached !== null) {
        res.set('X-Cache', 'HIT');
        res.json(cached);
        return;
      }

      const resp = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT,
        },
        body,
      });
      if (!resp.ok) {
        res
          .status(resp.status)
          .json({ error: `Upstream ${String(resp.status)}: ${resp.statusText}` } satisfies ErrorResponse);
        return;
      }
      const ct = resp.headers.get('content-type') ?? '';
      if (!ct.includes('json') && !ct.includes('geojson')) {
        res.status(502).json({ error: `Upstream returned non-JSON content-type: ${ct}` } satisfies ErrorResponse);
        return;
      }
      const data: unknown = await resp.json();
      await setCache(key, data);
      res.set('X-Cache', 'MISS');
      res.json(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: 'Proxy request failed', detail: message } satisfies ErrorResponse);
    }
  }

  app.get(PROXY_PATH, handleProxyGet);
  app.post(PROXY_PATH, handleProxyPost);

  app.delete(CACHE_PATH, async (_req: Request, res: Response) => {
    try {
      const files = await readdir(cacheDir);
      await Promise.all(files.map((f) => unlink(join(cacheDir, f))));
      res.json({ cleared: files.length } satisfies CacheClearResponse);
    } catch {
      res.status(500).json({ error: 'Failed to clear cache' } satisfies ErrorResponse);
    }
  });

  const NESTGATE_URL = process.env['NESTGATE_URL'] ?? '';
  const neuralApi = createNeuralApiClient();

  type CasRoute =
    | { readonly type: 'health' }
    | { readonly type: 'put'; readonly family: string; readonly data: unknown }
    | { readonly type: 'get'; readonly family: string; readonly hash: string }
    | { readonly type: 'list'; readonly family: string };

  function parseCasRoute(req: Request): CasRoute | null {
    const subPath = req.path.replace(new RegExp(`^${CAS_PATH}/?`), '');

    if (subPath === 'health' && req.method === 'GET') {
      return { type: 'health' };
    }

    if (subPath === 'store' && req.method === 'PUT') {
      const family = req.get('X-CAS-Family') ?? CAS_FAMILY;
      return { type: 'put', family, data: req.body };
    }

    const fetchMatch = /^fetch\/([a-f0-9]{64})$/.exec(subPath);
    if (fetchMatch && req.method === 'GET') {
      const family = req.get('X-CAS-Family') ?? CAS_FAMILY;
      return { type: 'get', family, hash: fetchMatch[1] ?? '' };
    }

    const indexMatch = /^index\/(.+)$/.exec(subPath);
    if (indexMatch && req.method === 'GET') {
      return { type: 'list', family: decodeURIComponent(indexMatch[1] ?? '') };
    }

    const segments = subPath.split('/').filter((segment) => segment.length > 0);
    if (segments.length === 1 && req.method === 'GET') {
      return { type: 'list', family: decodeURIComponent(segments[0] ?? '') };
    }

    if (segments.length === 2) {
      const family = decodeURIComponent(segments[0] ?? '');
      const hashOrKey = decodeURIComponent(segments[1] ?? '');
      if (req.method === 'GET') {
        return { type: 'get', family, hash: hashOrKey };
      }
      if (req.method === 'PUT') {
        return { type: 'put', family, data: req.body };
      }
    }

    return null;
  }

  async function handleCasViaNeuralApi(req: Request, res: Response): Promise<boolean> {
    const route = parseCasRoute(req);
    if (!route) {
      return false;
    }

    try {
      switch (route.type) {
        case 'health': {
          const result = await neuralApi.healthCheck();
          res.status(200).json(result ?? { status: 'ok' });
          return true;
        }
        case 'put': {
          const jsonData = JSON.stringify(route.data);
          const content_base64 = Buffer.from(jsonData, 'utf8').toString('base64');
          const result = await neuralApi.contentPut({
            family: route.family,
            content_base64,
          });
          res.status(200).json({
            hash: result.hash,
            size: result.size,
            stored: result.stored,
          });
          return true;
        }
        case 'get': {
          const result = await neuralApi.contentGet({
            family: route.family,
            hash: route.hash,
          });
          const decoded = Buffer.from(result.data, 'base64').toString('utf8');
          try {
            res.status(200).json(JSON.parse(decoded));
          } catch {
            res.status(200).send(decoded);
          }
          return true;
        }
        case 'list': {
          const result = await neuralApi.contentList({ family: route.family });
          res.status(200).json(result);
          return true;
        }
      }
    } catch (err: unknown) {
      if (isNeuralApiUnavailable(err)) {
        return false;
      }
      if (err instanceof NeuralApiRpcError) {
        res.status(502).json({ error: 'CAS Neural API error', detail: err.message } satisfies ErrorResponse);
        return true;
      }
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: 'CAS Neural API failed', detail: message } satisfies ErrorResponse);
      return true;
    }
  }

  async function handleCasViaHttp(req: Request, res: Response): Promise<void> {
    const casPath = req.path.replace(CAS_PATH, '/cas');
    const upstream = `${NESTGATE_URL}${casPath}`;

    const headers: Record<string, string> = { 'Content-Type': req.get('Content-Type') ?? 'application/json' };
    const casFamily = req.get('X-CAS-Family');
    const casName = req.get('X-CAS-Name');
    if (casFamily) headers['X-CAS-Family'] = casFamily;
    if (casName) headers['X-CAS-Name'] = casName;

    const fetchOpts: RequestInit = {
      method: req.method,
      headers,
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const resp = await fetch(upstream, fetchOpts);
    const ct = resp.headers.get('content-type') ?? '';
    if (ct.includes('json')) {
      const data: unknown = await resp.json();
      res.status(resp.status).json(data);
    } else {
      const text = await resp.text();
      res.status(resp.status).type('text/plain').send(text);
    }
  }

  app.all(`${CAS_PATH}/{*path}`, async (req: Request, res: Response) => {
    const handledByNeural = await handleCasViaNeuralApi(req, res);
    if (handledByNeural) {
      return;
    }

    if (!NESTGATE_URL) {
      res.status(503).json({
        error: 'CAS not configured (Neural API unavailable and NESTGATE_URL not set)',
      } satisfies ErrorResponse);
      return;
    }

    try {
      await handleCasViaHttp(req, res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(502).json({ error: 'CAS proxy failed', detail: message } satisfies ErrorResponse);
    }
  });

  app.get(`${AGENT_PATH}/status`, (_req: Request, res: Response) => {
    const state = getShadowState();
    res.json({
      connected: isBrowserConnected(),
      entityCount: state.length,
      timestamp: Date.now(),
    });
  });

  app.get(`${AGENT_PATH}/state`, (_req: Request, res: Response) => {
    res.json({
      entities: getShadowState(),
      connected: isBrowserConnected(),
      timestamp: Date.now(),
    });
  });

  app.post(`${AGENT_PATH}/command`, async (req: Request, res: Response) => {
    const payload = parseCommandPayload(req.body);
    if (!payload) {
      res
        .status(400)
        .json({ error: 'Invalid command payload — must include a known "action" field' } satisfies ErrorResponse);
      return;
    }

    const result = await sendCommand(payload);
    const eid =
      payload.action === 'remove-entity' || payload.action === 'update-component' || payload.action === 'move-geometry'
        ? payload.entityId
        : undefined;
    sendAgentAction(`Executed ${payload.action}`, eid);
    if (result.ok) {
      res.json(result);
    } else {
      res.status(result.error === 'No browser connected' ? 503 : 500).json(result);
    }
  });

  app.get(`${AGENT_PATH}/messages`, (req: Request, res: Response) => {
    const flush = req.query['flush'] !== 'false';
    res.json({ messages: getUserMessages(flush) });
  });

  app.post(`${AGENT_PATH}/messages`, (req: Request, res: Response) => {
    const body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Missing "text" field' });
      return;
    }
    const text = (body as Record<string, unknown>)['text'];
    if (typeof text !== 'string' || text.length === 0) {
      res.status(400).json({ error: 'Missing "text" field' });
      return;
    }

    const delivered = sendAgentMessage(text);
    res.json({ delivered, timestamp: Date.now() });
  });

  app.get(HEALTH_PATH, (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      version: APP_VERSION,
      uptime: Math.floor(process.uptime()),
      agentConnected: isBrowserConnected(),
      timestamp: Date.now(),
    });
  });

  app.get('{*path}', (_req: Request, res: Response) => {
    res.sendFile(join(root, 'dist', 'client', 'index.html'), (err) => {
      if (err) res.sendFile(join(root, 'index.html'));
    });
  });

  return app;
}

export interface StartServerOptions extends ServerOptions {
  readonly port?: number;
}

export async function startServer(options: StartServerOptions = {}): Promise<Server> {
  const app = await createApp(options);
  const port = options.port ?? (Number(process.env['PORT']) || SERVER_PORT);
  const server = app.listen(port);

  if (options.enableAgentBridge !== false) {
    initAgentBridge(server);
  }

  console.log(`FootPrint server running at http://localhost:${String(port)}`);
  console.log(`  Agent WebSocket: ws://localhost:${String(port)}${AGENT_BRIDGE_PATH}`);
  console.log(`  Agent REST API:  http://localhost:${String(port)}${AGENT_PATH}/`);
  console.log(`  Health check:    http://localhost:${String(port)}${HEALTH_PATH}`);

  return server;
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  const server = await startServer();

  function shutdown(): void {
    console.log('Shutting down…');
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => {
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
