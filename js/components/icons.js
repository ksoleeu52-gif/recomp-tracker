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
  barcode: icon(html`<path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17M8 8v8M11 8v8M14 8v8M17 8v8"/>`),
  bolt: icon(html`<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>`),
  close: icon(html`<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`),
  check: icon(html`<path d="M5 12.5l4.5 4.5L19 7.5"/>`),
  search: icon(html`<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>`),
};
