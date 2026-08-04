// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Agent panel UI -- shows AI actions, messages, and provides
 * a text input for the user to message the AI agent.
 */

import type { AgentTextMessage, AgentActionMessage } from '../agent/protocol.js';
import {
  agentQuery,
  agentStream,
  agentCancel,
  agentStatus,
  agentCapabilities,
  bridgeHealth,
  bridgeSubscribe,
} from './petal-tongue.js';
import { escHtml } from './html.js';
import { AGENT_LOG_LIMIT } from '../constants.js';

let logEl: HTMLUListElement | null = null;
let badgeEl: HTMLElement | null = null;
let dotEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;
let collapsed = true;
let unreadCount = 0;
let activeRequestId: number | undefined;
let streamingText = '';

export function initAgentPanel(): void {
  panelEl = document.getElementById('agent-panel');
  logEl = document.getElementById('agent-log') as HTMLUListElement | null;
  badgeEl = document.getElementById('agent-badge');
  dotEl = document.getElementById('agent-status-dot');

  const toggleBtn = document.getElementById('btn-toggle-agent');
  const input = document.getElementById('agent-input') as HTMLInputElement | null;
  const sendBtn = document.getElementById('agent-send');

  toggleBtn?.addEventListener('click', togglePanel);

  const doSend = () => {
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    void sendAgentMessage(text);
  };

  sendBtn?.addEventListener('click', doSend);
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') doSend();
    if (e.key === 'Escape' && activeRequestId !== undefined) {
      void agentCancel(activeRequestId).catch(() => undefined);
      activeRequestId = undefined;
      streamingText = '';
      appendEntry('action', 'Request cancelled');
    }
  });
}

async function sendAgentMessage(text: string): Promise<void> {
  appendEntry('user', text);

  if (activeRequestId !== undefined) {
    void agentCancel(activeRequestId).catch(() => undefined);
    activeRequestId = undefined;
    streamingText = '';
  }

  try {
    const result = await agentStream(text);
    activeRequestId = extractRequestId(result);

    if (activeRequestId === undefined) {
      appendAgentResponse(result);
    }
  } catch {
    try {
      const result = await agentQuery(text);
      appendAgentResponse(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Agent query failed';
      appendEntry('action', message);
    }
  }
}

function appendAgentResponse(result: unknown): void {
  const text = extractResponseText(result);
  if (text) appendEntry('agent', text);
}

function extractRequestId(result: unknown): number | undefined {
  if (typeof result === 'number') return result;
  if (typeof result === 'object' && result !== null) {
    const rec = result as Record<string, unknown>;
    if (typeof rec['requestId'] === 'number') return rec['requestId'];
    if (typeof rec['id'] === 'number') return rec['id'];
  }
  return undefined;
}

function extractResponseText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (typeof result === 'object' && result !== null) {
    const rec = result as Record<string, unknown>;
    if (typeof rec['text'] === 'string') return rec['text'];
    if (typeof rec['response'] === 'string') return rec['response'];
    if (typeof rec['content'] === 'string') return rec['content'];
  }
  return typeof result === 'undefined' ? '' : JSON.stringify(result);
}

async function setupPetalTongueBridge(): Promise<void> {
  try {
    const [health, status, capabilities] = await Promise.all([bridgeHealth(), agentStatus(), agentCapabilities()]);
    await bridgeSubscribe('agent');
    appendEntry('action', `Bridge healthy: ${formatBrief(health)}`);
    appendEntry('action', `Agent status: ${formatBrief(status)}`);
    appendEntry('action', `Capabilities: ${formatBrief(capabilities)}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'petalTongue bridge unavailable';
    appendEntry('action', message);
  }
}

function formatBrief(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }
  return String(value);
}

export function onPetalTongueStatusChange(connected: boolean): void {
  if (dotEl) {
    dotEl.className = connected ? 'agent-dot-connected' : 'agent-dot-disconnected';
  }
  if (connected) {
    appendEntry('action', 'Connected to petalTongue');
    void setupPetalTongueBridge();
  } else {
    activeRequestId = undefined;
    streamingText = '';
  }
}

export function onPetalTongueNotification(method: string, params: unknown): void {
  if (method === 'agent.stream.chunk' || method === 'agent.stream.delta') {
    const chunk = extractStreamChunk(params);
    if (chunk) {
      streamingText += chunk;
      appendEntry('agent', streamingText);
    }
    return;
  }

  if (method === 'agent.stream.end' || method === 'agent.stream.done') {
    activeRequestId = undefined;
    if (streamingText) {
      appendEntry('agent', streamingText);
      streamingText = '';
    } else {
      const text = extractResponseText(params);
      if (text) appendEntry('agent', text);
    }
    return;
  }

  if (method === 'agent.message' || method === 'agent.response') {
    appendAgentResponse(params);
    activeRequestId = undefined;
    streamingText = '';
  }
}

function extractStreamChunk(params: unknown): string {
  if (typeof params === 'string') return params;
  if (typeof params === 'object' && params !== null) {
    const rec = params as Record<string, unknown>;
    if (typeof rec['chunk'] === 'string') return rec['chunk'];
    if (typeof rec['text'] === 'string') return rec['text'];
    if (typeof rec['delta'] === 'string') return rec['delta'];
  }
  return '';
}

function togglePanel(): void {
  collapsed = !collapsed;
  if (panelEl) {
    panelEl.classList.toggle('agent-collapsed', collapsed);
  }
  const btn = document.getElementById('btn-toggle-agent');
  if (btn) {
    btn.innerHTML = collapsed ? '&#9650;' : '&#9660;';
  }
  if (!collapsed) {
    unreadCount = 0;
    updateBadge();
    logEl?.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
  }
}

function updateBadge(): void {
  if (!badgeEl) return;
  if (unreadCount > 0 && collapsed) {
    badgeEl.textContent = String(unreadCount);
    badgeEl.classList.remove('hidden');
  } else {
    badgeEl.classList.add('hidden');
  }
}

function appendEntry(kind: 'agent' | 'action' | 'user', text: string, entityId?: string): void {
  if (!logEl) return;

  const li = document.createElement('li');
  li.className = `agent-entry agent-entry-${kind}`;

  const time = new Date();
  const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  const prefix = kind === 'user' ? 'You' : kind === 'action' ? 'AI' : 'AI';
  let content = `<span class="agent-time">${timeStr}</span><span class="agent-prefix">${prefix}</span> ${escHtml(text)}`;

  if (entityId) {
    content += ` <span class="agent-entity-ref">[${entityId.slice(0, 8)}]</span>`;
  }

  li.innerHTML = content;
  logEl.appendChild(li);

  while (logEl.children.length > AGENT_LOG_LIMIT) {
    const first = logEl.firstChild;
    if (!first) break;
    logEl.removeChild(first);
  }

  if (!collapsed) {
    li.scrollIntoView({ behavior: 'smooth' });
  } else {
    unreadCount++;
    updateBadge();
  }
}

// Called by agent-bridge when a message arrives from the FootPrint server
export function onAgentMessage(msg: AgentTextMessage | AgentActionMessage): void {
  if (msg.type === 'agent-message') {
    appendEntry('agent', msg.text);
  } else {
    appendEntry('action', msg.description, msg.entityId);
  }
}

export function setAgentConnectionStatus(connected: boolean): void {
  if (connected) {
    appendEntry('action', 'Connected to FootPrint server');
  }
}
