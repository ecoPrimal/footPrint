/**
 * Non-blocking modal dialogs replacing native alert/prompt/confirm.
 *
 * Uses the existing #modal-overlay + #modal structure from index.html.
 * Each function returns a Promise that resolves when the user acts.
 */

const overlay = () => document.getElementById('modal-overlay');
const titleEl = () => document.getElementById('modal-title');
const bodyEl = () => document.getElementById('modal-body');
const closeBtn = () => document.getElementById('modal-close');

function showModal(): void {
  overlay()?.classList.remove('hidden');
}

function hideModal(): void {
  overlay()?.classList.add('hidden');
}

export function modalAlert(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    const t = titleEl();
    const b = bodyEl();
    const c = closeBtn();
    if (!t || !b) { resolve(); return; }

    t.textContent = title;
    b.innerHTML = `
      <p style="margin-bottom:12px;font-size:13px;color:var(--text)">${escapeHtml(message)}</p>
      <button class="modal-action-btn" data-action="ok">OK</button>
    `;

    const cleanup = () => { hideModal(); resolve(); };
    b.querySelector('[data-action="ok"]')?.addEventListener('click', cleanup, { once: true });
    c?.addEventListener('click', cleanup, { once: true });
    showModal();
  });
}

export function modalConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const t = titleEl();
    const b = bodyEl();
    const c = closeBtn();
    if (!t || !b) { resolve(false); return; }

    t.textContent = title;
    b.innerHTML = `
      <p style="margin-bottom:12px;font-size:13px;color:var(--text)">${escapeHtml(message)}</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="modal-action-btn modal-cancel" data-action="cancel">Cancel</button>
        <button class="modal-action-btn modal-confirm" data-action="confirm">Confirm</button>
      </div>
    `;

    const done = (val: boolean) => { hideModal(); resolve(val); };
    b.querySelector('[data-action="confirm"]')?.addEventListener('click', () => { done(true); }, { once: true });
    b.querySelector('[data-action="cancel"]')?.addEventListener('click', () => { done(false); }, { once: true });
    c?.addEventListener('click', () => { done(false); }, { once: true });
    showModal();
  });
}

export function modalPrompt(title: string, message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const t = titleEl();
    const b = bodyEl();
    const c = closeBtn();
    if (!t || !b) { resolve(null); return; }

    t.textContent = title;
    b.innerHTML = `
      <p style="margin-bottom:8px;font-size:13px;color:var(--text)">${escapeHtml(message)}</p>
      <input type="text" class="modal-prompt-input" value="${escapeHtml(defaultValue)}" style="width:100%;margin-bottom:12px" />
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="modal-action-btn modal-cancel" data-action="cancel">Cancel</button>
        <button class="modal-action-btn modal-confirm" data-action="ok">OK</button>
      </div>
    `;

    const input: HTMLInputElement | null = b.querySelector('.modal-prompt-input');
    const done = (val: string | null) => { hideModal(); resolve(val); };

    b.querySelector('[data-action="ok"]')?.addEventListener('click', () => {
      done(input?.value ?? null);
    }, { once: true });
    b.querySelector('[data-action="cancel"]')?.addEventListener('click', () => { done(null); }, { once: true });
    c?.addEventListener('click', () => { done(null); }, { once: true });

    showModal();
    input?.focus();
    input?.select();

    input?.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') done(input.value);
      if (e.key === 'Escape') done(null);
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
