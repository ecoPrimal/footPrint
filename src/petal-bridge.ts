// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * WebSocket ↔ UDS relay for petalTongue.
 *
 * Accepts browser WebSocket connections on WS_PATH (/ws) and relays
 * newline-delimited JSON-RPC frames to petalTongue's Unix Domain Socket.
 * petalTongue uses NDJSON framing (no riboCipher prefix).
 */

import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { connect as netConnect } from 'node:net';
import { WS_PATH } from './constants.js';

const PETALTONGUE_SOCKET = process.env['PETALTONGUE_SOCKET'] ?? '/run/membrane/petaltongue.sock';

let wss: WebSocketServer | null = null;

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
    const uds = netConnect(PETALTONGUE_SOCKET);
    let udsConnected = false;
    let buffer: Uint8Array = new Uint8Array(0);

    uds.on('connect', () => {
      udsConnected = true;
    });

    uds.on('data', (chunk: Buffer) => {
      const combined = new Uint8Array(buffer.length + chunk.length);
      combined.set(buffer, 0);
      combined.set(chunk, buffer.length);
      buffer = combined;
      drainResponses(ws, buffer, (remaining) => {
        buffer = remaining;
      });
    });

    uds.on('error', () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'petalTongue socket unavailable');
      }
    });

    uds.on('close', () => {
      udsConnected = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'petalTongue disconnected');
      }
    });

    ws.on('message', (raw: Buffer | string) => {
      if (!udsConnected) return;
      const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
      uds.write(text + '\n');
    });

    ws.on('close', () => {
      uds.destroy();
    });
  });
}

/**
 * petalTongue sends newline-delimited JSON responses over UDS.
 * Each response is a complete JSON object terminated by \n.
 */
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
