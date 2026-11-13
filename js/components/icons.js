/**
 * Inline SVG icons (stroke style, 24×24). Inline so they inherit colour and work offline.
 */
import { html } from '../lib/html.js';

const icon = (paths) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export const icons = {
  back: icon(html`<path d="M15 5l-7 7 7 7"/>`),
  plus: icon(html`<path d="M12 5v14M5 12h14"/>`),
  check: icon(html`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  search: icon(html`<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>`),
};
