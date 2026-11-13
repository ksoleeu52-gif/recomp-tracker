/**
 * Today screen: what's left today, then the day's log meal by meal.
 * Route: #/today  (or #/today?date=YYYY-MM-DD for another day)
 */
import { html, render } from '../lib/html.js';
import { getSettings } from '../db/settings.js';
import { getDayLog, groupByMeal, updateEntry, deleteEntry, restoreEntry } from '../db/log.js';
import { todayKey, longDate, dayLabel, isDayKey } from '../lib/dates.js';
import { sumMacros } from '../lib/nutrition.js';
import { MEALS } from '../config.js';
import { summaryCard } from '../components/summary-card.js';
import { mealSection } from '../components/meal-section.js';
import { openPortionSheet } from '../components/portion-sheet.js';
import { toast } from '../components/toast.js';

export default {
  title: 'Today',

  async render(root, { query, refresh }) {
    const today = todayKey();
    const date = isDayKey(query.date) ? query.date : today;
    const [settings, entries] = await Promise.all([getSettings(), getDayLog(date)]);
    const byMeal = groupByMeal(entries);

    render(root, html`
      <header class="view-header">
        <div>
          <h1 class="view-title">${dayLabel(date, today)}</h1>
          <p class="view-subtitle">${longDate(date)}</p>
        </div>
      </header>
      ${summaryCard({ targets: settings, totals: sumMacros(entries), isToday: date === today })}
      ${MEALS.map((meal) => mealSection({ meal, entries: byMeal[meal.id], date }))}
    `);

    // Tap a logged item to change its amount, move it to another meal, or delete it.
    root.addEventListener('click', (event) => {
      const button = event.target.closest('[data-entry]');
      if (!button) return;
      const entry = entries.find((e) => e.id === button.dataset.entry);
      if (entry) editEntry(entry, refresh);
    });
  },
};

function editEntry(entry, refresh) {
  if (!entry.foodSnapshot) return; // quick-add entries get their own editor in step 6

  openPortionSheet({
    title: entry.name,
    food: entry.foodSnapshot,
    amount: entry.amount,
    unit: entry.unit,
    meal: entry.meal,
    confirmLabel: 'Save',
    focusAmount: false,
    onConfirm: async (changes) => {
      await updateEntry(entry, changes);
      toast(`Updated ${entry.name}`);
      refresh();
    },
    onDelete: async () => {
      await deleteEntry(entry.id);
      refresh();
      toast(`Removed ${entry.name}`, {
        actionLabel: 'Undo',
        duration: 5000,
        onAction: async () => {
          await restoreEntry(entry);
          refresh();
        },
      });
    },
  });
}
