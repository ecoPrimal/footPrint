/**
 * Agent panel UI -- shows AI actions, messages, and provides
 * a text input for the user to message the AI agent.
 */

import { sendUserMessage } from './agent-bridge.js';
import type { AgentTextMessage, AgentActionMessage } from '../agent/protocol.js';
import { escHtml } from './html.js';
import { AGENT_LOG_LIMIT } from '../constants.js';

let logEl: HTMLUListElement | null = null;
let badgeEl: HTMLElement | null = null;
let dotEl: HTMLElement | null = null;
let panelEl: HTMLElement | null = null;
let collapsed = true;
let unreadCount = 0;

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
    sendUserMessage(text);
    appendEntry('user', text);
    input.value = '';
  };

  sendBtn?.addEventListener('click', doSend);
  input?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') doSend();
  });
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
    logEl.removeChild(logEl.firstChild!);
  }

  if (!collapsed) {
    li.scrollIntoView({ behavior: 'smooth' });
  } else {
    unreadCount++;
    updateBadge();
  }
}


// Called by agent-bridge when a message arrives from the server
export function onAgentMessage(msg: AgentTextMessage | AgentActionMessage): void {
  if (msg.type === 'agent-message') {
    appendEntry('agent', msg.text);
  } else {
    appendEntry('action', msg.description, msg.entityId);
  }
}

export function setAgentConnectionStatus(connected: boolean): void {
  if (dotEl) {
    dotEl.className = connected ? 'agent-dot-connected' : 'agent-dot-disconnected';
  }
  if (connected) {
    appendEntry('action', 'Connected to FootPrint server');
  }
}
