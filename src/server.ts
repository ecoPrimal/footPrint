import express from 'express';
import type { Request, Response } from 'express';
import { readdir, readFile, writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { ALLOWED_HOSTS, CACHE_TTLS, USER_AGENT, JSON_BODY_LIMIT, SHUTDOWN_GRACE_MS, SERVER_PORT } from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const app = express();
const PORT = Number(process.env['PORT']) || SERVER_PORT;
const PROJECTS_DIR = join(ROOT, 'projects');
const CACHE_DIR = join(ROOT, 'cache');

app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use(express.text({ limit: JSON_BODY_LIMIT, type: 'text/plain' }));
app.use(express.static(join(ROOT, 'public')));
app.use(express.static(join(ROOT, 'dist', 'client')));

await mkdir(PROJECTS_DIR, { recursive: true });
await mkdir(CACHE_DIR, { recursive: true });

app.get('/api/projects', async (_req: Request, res: Response) => {
  try {
    const files = await readdir(PROJECTS_DIR);
    const projects = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''));
    res.json(projects);
  } catch {
    res.status(500).json({ error: 'Failed to list projects' } satisfies ErrorResponse);
  }
});

app.get('/api/projects/:name', async (req: Request<{ name: string }>, res: Response) => {
  try {
    const filePath = join(PROJECTS_DIR, `${req.params['name']}.json`);
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

app.post('/api/projects/:name', async (req: Request<{ name: string }>, res: Response) => {
  try {
    const safeName = (req.params['name'] ?? '').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = join(PROJECTS_DIR, `${safeName}.json`);
    await writeFile(filePath, JSON.stringify(req.body as ProjectFile, null, 2), 'utf-8');
    res.json({ saved: safeName } satisfies SaveResponse);
  } catch {
    res.status(500).json({ error: 'Failed to save project' } satisfies ErrorResponse);
  }
});

app.delete('/api/projects/:name', async (req: Request<{ name: string }>, res: Response) => {
  try {
    const filePath = join(PROJECTS_DIR, `${req.params['name']}.json`);
    await unlink(filePath);
    res.json({ deleted: req.params['name'] } satisfies DeleteResponse);
  } catch (err: unknown) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      res.status(404).json({ error: 'Project not found' } satisfies ErrorResponse);
      return;
    }
    res.status(500).json({ error: 'Failed to delete project' } satisfies ErrorResponse);
  }
});

// ── Proxy with disk cache ────────────────────────


function cacheKey(url: string, body: string): string {
  return createHash('sha256').update(url + body).digest('hex').slice(0, 16);
}

function ttlForUrl(url: string): number {
  if (url.includes('overpass')) return CACHE_TTLS.overpass;
  if (url.includes('fema.gov')) return CACHE_TTLS.fema;
  if (url.includes('epqs.nationalmap.gov')) return CACHE_TTLS.elevation;
  if (url.includes('sdmdataaccess')) return CACHE_TTLS.soils;
  return CACHE_TTLS.default;
}

async function getCached(key: string, ttl: number): Promise<unknown | null> {
  try {
    const filePath = join(CACHE_DIR, `${key}.json`);
    const info = await stat(filePath);
    if (Date.now() - info.mtimeMs > ttl) return null;
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data) as unknown;
  } catch {
    return null;
  }
}

async function setCache(key: string, data: unknown): Promise<void> {
  const filePath = join(CACHE_DIR, `${key}.json`);
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
      res.status(resp.status).json({ error: `Upstream ${String(resp.status)}: ${resp.statusText}` } satisfies ErrorResponse);
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
      res.status(resp.status).json({ error: `Upstream ${String(resp.status)}: ${resp.statusText}` } satisfies ErrorResponse);
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

app.get('/ext', handleProxyGet);
app.post('/ext', handleProxyPost);

app.delete('/api/cache', async (_req: Request, res: Response) => {
  try {
    const files = await readdir(CACHE_DIR);
    await Promise.all(files.map((f) => unlink(join(CACHE_DIR, f))));
    res.json({ cleared: files.length } satisfies CacheClearResponse);
  } catch {
    res.status(500).json({ error: 'Failed to clear cache' } satisfies ErrorResponse);
  }
});

// ── Agent API ─────────────────────────────────────

app.get('/api/agent/status', (_req: Request, res: Response) => {
  const state = getShadowState();
  res.json({
    connected: isBrowserConnected(),
    entityCount: state.length,
    timestamp: Date.now(),
  });
});

app.get('/api/agent/state', (_req: Request, res: Response) => {
  res.json({
    entities: getShadowState(),
    connected: isBrowserConnected(),
    timestamp: Date.now(),
  });
});

app.post('/api/agent/command', async (req: Request, res: Response) => {
  const payload = parseCommandPayload(req.body);
  if (!payload) {
    res.status(400).json({ error: 'Invalid command payload — must include a known "action" field' } satisfies ErrorResponse);
    return;
  }

  const result = await sendCommand(payload);
  const eid = 'entityId' in payload ? String((payload as { entityId: string }).entityId) : undefined;
  sendAgentAction(`Executed ${payload.action}`, eid);
  if (result.ok) {
    res.json(result);
  } else {
    res.status(result.error === 'No browser connected' ? 503 : 500).json(result);
  }
});

app.get('/api/agent/messages', (req: Request, res: Response) => {
  const flush = req.query['flush'] !== 'false';
  res.json({ messages: getUserMessages(flush) });
});

app.post('/api/agent/messages', (req: Request, res: Response) => {
  const body = req.body as { text?: string };
  if (!body.text || typeof body.text !== 'string') {
    res.status(400).json({ error: 'Missing "text" field' });
    return;
  }

  const delivered = sendAgentMessage(body.text);
  res.json({ delivered, timestamp: Date.now() });
});

// ── Start server + WebSocket bridge ───────────────

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    agentConnected: isBrowserConnected(),
    timestamp: Date.now(),
  });
});

const server = await app.listen(PORT);
initAgentBridge(server);
console.log(`FootPrint server running at http://localhost:${String(PORT)}`);
console.log(`  Agent WebSocket: ws://localhost:${String(PORT)}/ws`);
console.log(`  Agent REST API:  http://localhost:${String(PORT)}/api/agent/`);
console.log(`  Health check:    http://localhost:${String(PORT)}/api/health`);

function shutdown(): void {
  console.log('Shutting down…');
  server.close(() => { process.exit(0); });
  setTimeout(() => { process.exit(1); }, SHUTDOWN_GRACE_MS);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
