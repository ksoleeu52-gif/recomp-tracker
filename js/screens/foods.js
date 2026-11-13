/**
 * My Foods library. Placeholder until step 2.
 */
import { html, render } from '../lib/html.js';

export default {
  title: 'Foods',
  render(root) {
    render(root, html`
      <header class="view-header"><h1 class="view-title">My Foods</h1></header>
      <div class="empty"><p>Your food library arrives in the next step.</p></div>
    `);
  },
};
