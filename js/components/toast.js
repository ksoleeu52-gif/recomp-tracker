/**
 * Small transient message at the bottom of the screen, with an optional action
 * button (used for "Undo" and "Update"). Only one toast is shown at a time.
 */
import { html, render } from '../lib/html.js';

let current = null;

/**
 * @param {string} message
 * @param {{ actionLabel?: string, onAction?: () => void, duration?: number }} options
 *        duration in ms; 0 keeps the toast until the action is tapped.
 */
export function toast(message, { actionLabel, onAction, duration = 2500 } = {}) {
  const root = document.getElementById('toast-root');
  current?.remove();

  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  render(el, html`
    <span class="toast__message">${message}</span>
    ${actionLabel && html`<button class="toast__action" type="button">${actionLabel}</button>`}
  `);

  if (actionLabel) {
    el.querySelector('.toast__action').addEventListener('click', () => {
      el.remove();
      onAction?.();
    });
  }

  root.append(el);
  current = el;
  if (duration > 0) setTimeout(() => el.remove(), duration);
}
