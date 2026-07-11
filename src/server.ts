import express from 'express';
import type { Request, Response } from 'express';
import { readdir, readFile, writeFile, unlink, mkdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import type { CacheTTLConfig, CacheClearResponse } from './types/api.js';
import type { ProjectFile, SaveResponse, DeleteResponse, ErrorResponse } from './types/project.js';
import type { CommandPayload } from './agent/protocol.js';
import {
  initAgentBridge,
  getShadowState,
  isBrowserConnected,
  sendCommand,
  sendAgentMessage,
  sendAgentAction,
  getUserMessages,
} from './agent/server-bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const app = express();
const PORT = Number(process.env['PORT']) || 3000;
const PROJECTS_DIR = join(ROOT, 'projects');
const CACHE_DIR = join(ROOT, 'cache');

const CACHE_TTL: CacheTTLConfig = {
  default: 7 * 24 * 60 * 60 * 1000,
  fema: 24 * 60 * 60 * 1000,
  overpass: 3 * 24 * 60 * 60 * 1000,
  elevation: 30 * 24 * 60 * 60 * 1000,
  soils: 90 * 24 * 60 * 60 * 1000,
};

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb', type: 'text/plain' }));
app.use(express.static(join(ROOT, 'public')));

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

const ALLOWED_HOSTS: readonly string[] = [
  'overpass-api.de',
  'hazards.fema.gov',
  'services1.arcgis.com',
  'services2.arcgis.com',
  'nominatim.openstreetmap.org',
  'epqs.nationalmap.gov',
  'sdmdataaccess.sc.egov.usda.gov',
  'gisagocss.state.mi.us',
  'gisp.mcgi.state.mi.us',
  'gis2.cityofeastlansing.com',
];

function cacheKey(url: string, body: string): string {
  return createHash('sha256').update(url + body).digest('hex').slice(0, 16);
}

function ttlForUrl(url: string): number {
  if (url.includes('overpass')) return CACHE_TTL.overpass;
  if (url.includes('fema.gov')) return CACHE_TTL.fema;
  if (url.includes('epqs.nationalmap.gov')) return CACHE_TTL.elevation;
  if (url.includes('sdmdataaccess')) return CACHE_TTL.soils;
  return CACHE_TTL.default;
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

app.get('/api/proxy', async (req: Request, res: Response) => {
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
      res.json(cached);
      return;
    }

    const resp = await fetch(targetUrl, {
      headers: { 'User-Agent': 'FootPrint-HomePlanner/1.0' },
    });
    const data: unknown = await resp.json();
    await setCache(key, data);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: 'Proxy request failed', detail: message } satisfies ErrorResponse);
  }
});

app.post('/api/proxy', async (req: Request, res: Response) => {
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
      res.json(cached);
      return;
    }

    const resp = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'FootPrint-HomePlanner/1.0',
      },
      body,
    });
    const data: unknown = await resp.json();
    await setCache(key, data);
    res.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(502).json({ error: 'Proxy request failed', detail: message } satisfies ErrorResponse);
  }
});

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
  const payload = req.body as CommandPayload;
  if (!payload || typeof payload !== 'object' || !('action' in payload)) {
    res.status(400).json({ error: 'Invalid command payload -- must include "action" field' });
    return;
  }

  const result = await sendCommand(payload);
  const eid = 'entityId' in payload ? String((payload as unknown as Record<string, unknown>)['entityId']) : undefined;
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

const server = await app.listen(PORT);
initAgentBridge(server);
console.log(`FootPrint server running at http://localhost:${PORT}`);
console.log(`  Agent WebSocket: ws://localhost:${PORT}/ws`);
console.log(`  Agent REST API:  http://localhost:${PORT}/api/agent/`);

process.on('SIGINT', () => {
  server.close(() => { process.exit(0); });
});
