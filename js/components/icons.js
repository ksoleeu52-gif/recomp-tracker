/**
 * Inline SVG icons (stroke style, 24×24). Inline so they inherit colour and work offline.
 */
import { html } from '../lib/html.js';

const icon = (paths) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export const icons = {
  back: icon(html`<path d="M15 5l-7 7 7 7"/>`),
  forward: icon(html`<path d="M9 5l7 7-7 7"/>`),
  calendar: icon(html`<rect x="4" y="5.5" width="16" height="14" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>`),
  plus: icon(html`<path d="M12 5v14M5 12h14"/>`),
  close: icon(html`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
  check: icon(html`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  search: icon(html`<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>`),
};
