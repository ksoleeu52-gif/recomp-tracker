/**
 * Header for sub-screens (editors etc.) with a back button.
 * The router handles any click on [data-back], falling back to the given route
 * when there's no in-app history (e.g. the screen was opened from a bookmark).
 */
import { html } from '../lib/html.js';
import { icons } from './icons.js';

export function backHeader(title, fallbackRoute, subtitle = '') {
  return html`
    <header class="view-header view-header--sub">
      <button class="icon-btn" type="button" aria-label="Back" data-back="${fallbackRoute}">${icons.back}</button>
      <div>
        <h1 class="view-title view-title--sub">${title}</h1>
        ${subtitle && html`<p class="view-subtitle">${subtitle}</p>`}
      </div>
    </header>`;
}
