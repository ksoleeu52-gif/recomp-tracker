/**
 * Today screen: daily summary card (and, from step 3, the meal-by-meal log).
 */
import { html, render } from '../lib/html.js';
import { getSettings } from '../db/settings.js';
import { todayKey, longDate } from '../lib/dates.js';
import { emptyTotals } from '../lib/nutrition.js';
import { summaryCard } from '../components/summary-card.js';

export default {
  title: 'Today',

  async render(root) {
    const date = todayKey();
    const settings = await getSettings();
    const totals = emptyTotals(); // replaced by real log totals in step 3

    render(root, html`
      <header class="view-header">
        <div>
          <h1 class="view-title">Today</h1>
          <p class="view-subtitle">${longDate(date)}</p>
        </div>
      </header>
      ${summaryCard({ targets: settings, totals })}
    `);
  },
};
