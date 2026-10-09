// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * WebSocket ↔ UDS relay for petalTongue + squirrel.
 *
 * Accepts browser WebSocket connections on WS_PATH (/ws) and routes
 * JSON-RPC frames to the appropriate primal:
 *   - `agent.*` / `bridge.*` methods → squirrel UDS (ai.query)
 *   - everything else              → petalTongue UDS
 *
 * Both primals use NDJSON framing (no riboCipher prefix).
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { connect as netConnect, type Socket } from 'node:net';
import { WS_PATH } from './constants.js';

const PETALTONGUE_SOCKET =
  process.env['PETALTONGUE_SOCKET'] ?? '/run/membrane/petaltongue.sock';
const SQUIRREL_SOCKET =
  process.env['SQUIRREL_SOCKET'] ?? '/run/user/1000/biomeos/squirrel.sock';

let wss: WebSocketServer | null = null;

interface UdsLink {
  socket: Socket;
  connected: boolean;
  buffer: Uint8Array;
}

function createUdsLink(socketPath: string, ws: WebSocket, label: string): UdsLink {
  const link: UdsLink = {
    socket: netConnect(socketPath),
    connected: false,
    buffer: new Uint8Array(0),
  };

  link.socket.on('connect', () => {
    link.connected = true;
    console.log(`  petal-bridge: ${label} connected`);
  });

  link.socket.on('data', (chunk: Buffer) => {
    const combined = new Uint8Array(link.buffer.length + chunk.length);
    combined.set(link.buffer, 0);
    combined.set(chunk, link.buffer.length);
    link.buffer = combined;
    drainResponses(ws, link.buffer, (remaining) => {
      link.buffer = remaining;
    });
  });

  link.socket.on('error', (err: Error) => {
    console.log(`  petal-bridge: ${label} error: ${err.message}`);
  });

  link.socket.on('close', () => {
    link.connected = false;
  });

  return link;
}

const AGENT_METHODS = new Set([
  'agent.query',
  'agent.stream',
  'agent.cancel',
  'agent.status',
  'agent.capabilities',
  'bridge.health',
  'bridge.subscribe',
]);

function translateAgentMethod(parsed: Record<string, unknown>): string {
  const method = parsed['method'] as string;
  if (method === 'agent.query' || method === 'agent.stream') return 'ai.query';
  if (method === 'agent.cancel') return 'ai.cancel';
  if (method === 'agent.status') return 'health.check';
  if (method === 'agent.capabilities') return 'capabilities.list';
  if (method === 'bridge.health') return 'health.check';
  if (method === 'bridge.subscribe') return 'health.check';
  return method;
}

export function initPetalBridge(httpServer: HttpServer): void {
  wss = new WebSocketServer({ noServer: true });

  const petalWss = wss;
  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
    if (pathname !== WS_PATH) return;

    petalWss.handleUpgrade(req, socket, head, (ws) => {
      petalWss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const petalLink = createUdsLink(PETALTONGUE_SOCKET, ws, 'petalTongue');
    const squirrelLink = createUdsLink(SQUIRREL_SOCKET, ws, 'squirrel');

    ws.on('message', (raw: Buffer | string) => {
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // not JSON — forward to petalTongue as-is
      }

      const method = parsed?.['method'];
      if (parsed !== null && typeof method === 'string' && AGENT_METHODS.has(method)) {
        if (!squirrelLink.connected) {
          sendError(ws, parsed['id'], -32_000, 'squirrel not connected');
          return;
        }
        const translated = {
          ...parsed,
          method: translateAgentMethod(parsed),
        };
        squirrelLink.socket.write(JSON.stringify(translated) + '\n');
      } else {
        if (!petalLink.connected) {
          sendError(ws, parsed?.['id'], -32_000, 'petalTongue not connected');
          return;
        }
        petalLink.socket.write(text + '\n');
      }
    });

    ws.on('close', () => {
      petalLink.socket.destroy();
      squirrelLink.socket.destroy();
    });
  });
}

function sendError(ws: WebSocket, id: unknown, code: number, message: string): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  const resp = JSON.stringify({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message },
  });
  ws.send(resp);
}

function drainResponses(
  ws: WebSocket,
  buf: Uint8Array,
  setRemaining: (remaining: Uint8Array) => void,
): void {
  let offset = 0;
  while (offset < buf.length) {
    const nlIdx = buf.indexOf(0x0a, offset);
    if (nlIdx === -1) break;
    const line = buf.subarray(offset, nlIdx);
    offset = nlIdx + 1;
    if (line.length > 0 && ws.readyState === WebSocket.OPEN) {
      ws.send(Buffer.from(line).toString('utf-8'));
    }
  }
  setRemaining(buf.subarray(offset));
}
