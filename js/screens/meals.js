/**
 * Saved meals. Placeholder until step 5.
 */
import { html, render } from '../lib/html.js';

export default {
  title: 'Meals',
  render(root) {
    render(root, html`
      <header class="view-header"><h1 class="view-title">Saved Meals</h1></header>
      <div class="empty"><p>Saved meals arrive in step 5.</p></div>
    `);
  },
};
