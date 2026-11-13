/**
 * Today screen: what's left today, then the day's log meal by meal.
 * Route: #/today  (or #/today?date=YYYY-MM-DD to look back at another day)
 *
 * Moving between days: ‹ › buttons, swiping left/right, or tapping the date
 * to pick any past day. Future days are blocked so food can't be logged on the
 * wrong day by accident.
 */
import { html, render } from '../lib/html.js';
import { getSettings } from '../db/settings.js';
import {
  getDayLog, groupByMeal, updateEntry, updateQuickEntry, deleteEntry, deleteEntries, restoreEntry, copyEntries,
} from '../db/log.js';
import { todayKey, dayHeading, isDayKey, addDays, msUntilMidnight } from '../lib/dates.js';
import { sumMacros } from '../lib/nutrition.js';
import { onSwipe } from '../lib/swipe.js';
import { MEALS } from '../config.js';
import { summaryCard } from '../components/summary-card.js';
import { mealSection } from '../components/meal-section.js';
import { openPortionSheet } from '../components/portion-sheet.js';
import { openQuickAddSheet } from '../components/quick-add-sheet.js';
import { exportBackupNow } from '../components/backup-actions.js';
import { backupReminder, snoozeBackupReminder, hasUserData } from '../db/backup.js';
import { icons } from '../components/icons.js';
import { toast } from '../components/toast.js';

export default {
  title: 'Today',

  async render(root, { query, refresh, navigate }) {
    const today = todayKey();
    // Only past days (or today) can be shown; anything else falls back to today.
    const date = isDayKey(query.date) && query.date < today ? query.date : today;
    const isToday = date === today;
    const heading = dayHeading(date, today);
    const previousDay = addDays(date, -1);
    const [settings, entries, previousEntries] = await Promise.all([getSettings(), getDayLog(date), getDayLog(previousDay)]);
    const byMeal = groupByMeal(entries);
    const previousByMeal = groupByMeal(previousEntries);
    const previousLabel = isToday ? 'yesterday' : 'previous day';
    // Weekly backup nudge (only on today's view, and only once there's data to lose).
    const reminder = isToday ? backupReminder(settings, { hasData: await hasUserData() }) : { due: false };

    /** Switches day without filling the back-button history with every day visited. */
    const goToDay = (day) => {
      if (day > today) return;
      navigate(day === today ? 'today' : `today?date=${day}`, { replace: true });
    };

    render(root, html`
      <header class="day-nav">
        <button class="icon-btn" type="button" data-day="${addDays(date, -1)}" aria-label="Previous day">${icons.back}</button>
        <button class="day-nav__label" type="button" data-action="pick-date" aria-label="Choose a day">
          <span class="view-title">${heading.title}</span>
          <span class="view-subtitle">${heading.subtitle} ${icons.calendar}</span>
        </button>
        ${!isToday && html`<button class="btn btn--pill day-nav__today" type="button" data-day="${today}">Today</button>`}
        <button class="icon-btn" type="button" data-day="${addDays(date, 1)}" aria-label="Next day" ${isToday && html`disabled`}>${icons.forward}</button>
        <input class="visually-hidden" type="date" data-date-input value="${date}" max="${today}" tabindex="-1" aria-hidden="true">
      </header>

      ${reminder.due && backupBanner(reminder)}
      ${summaryCard({ targets: settings, totals: sumMacros(entries), isToday })}
      ${MEALS.map((meal) => mealSection({
        meal,
        entries: byMeal[meal.id],
        date,
        previousCount: previousByMeal[meal.id].length,
        previousLabel,
      }))}
    `);

    root.addEventListener('click', (event) => {
      // Day navigation buttons.
      const dayButton = event.target.closest('[data-day]');
      if (dayButton && !dayButton.disabled) return goToDay(dayButton.dataset.day);

      // Tap the date to jump to any past day.
      if (event.target.closest('[data-action="pick-date"]')) return openDatePicker(root);

      // Backup reminder buttons.
      const backupAction = event.target.closest('[data-backup]')?.dataset.backup;
      if (backupAction === 'now') return exportBackupNow().then((saved) => saved && refresh());
      if (backupAction === 'later') return snoozeBackupReminder().then(refresh);

      // "Copy yesterday (3)": duplicate the previous day's items for this meal.
      const copyButton = event.target.closest('[data-copy]');
      if (copyButton) return copyPreviousMeal(copyButton.dataset.copy);

      // Tap a logged item to change its amount, move it to another meal, or delete it.
      const entryButton = event.target.closest('[data-entry]');
      const entry = entryButton && entries.find((e) => e.id === entryButton.dataset.entry);
      if (entry) editEntry(entry, refresh);
    });

    const copyPreviousMeal = async (mealId) => {
      const copies = await copyEntries(previousByMeal[mealId], { date, meal: mealId });
      const label = MEALS.find((m) => m.id === mealId).label.toLowerCase();
      refresh();
      toast(`Copied ${previousLabel}'s ${label} (${copies.length} items)`, {
        actionLabel: 'Undo',
        duration: 5000,
        onAction: async () => {
          await deleteEntries(copies.map((c) => c.id));
          refresh();
        },
      });
    };

    root.querySelector('[data-date-input]').addEventListener('change', (event) => {
      if (isDayKey(event.target.value)) goToDay(event.target.value);
    });

    // Swipe right = previous day, swipe left = next day (like turning pages).
    const removeSwipe = onSwipe(root, {
      onRight: () => goToDay(addDays(date, -1)),
      onLeft: () => !isToday && goToDay(addDays(date, 1)),
    });

    // If the app is left open (or reopened) after midnight, roll over to the new day.
    // Only when following "today" — a past day you chose to look at stays put.
    let rollover = null;
    const checkNewDay = () => {
      if (document.visibilityState === 'visible' && todayKey() !== today) refresh();
    };
    if (isToday) {
      rollover = setTimeout(refresh, msUntilMidnight() + 1000);
      document.addEventListener('visibilitychange', checkNewDay);
    }

    // Cleanup, called by the router when leaving or re-rendering this screen.
    return () => {
      removeSwipe();
      clearTimeout(rollover);
      document.removeEventListener('visibilitychange', checkNewDay);
    };
  },
};

function backupBanner({ never, days }) {
  return html`
    <section class="reminder" aria-label="Backup reminder">
      <p>
        <b>${never ? 'Back up your log' : `Last backup was ${days} days ago`}</b><br>
        Your data is stored only on this phone. Save a copy so a lost phone or cleared browser can't wipe it.
      </p>
      <div class="reminder__actions">
        <button class="btn btn--primary" type="button" data-backup="now">Back up now</button>
        <button class="btn" type="button" data-backup="later">Later</button>
      </div>
    </section>`;
}

/** Opens the native date picker (wheel on iOS, calendar on Android). */
function openDatePicker(root) {
  const input = root.querySelector('[data-date-input]');
  try {
    input.showPicker();
  } catch {
    // Older browsers without showPicker(): focusing/clicking the input opens it.
    input.focus();
    input.click();
  }
}

/** Delete with Undo, shared by both kinds of entry. */
async function removeEntry(entry, refresh) {
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
}

function editEntry(entry, refresh) {
  // Quick-add entries have no food to scale, so edit their numbers directly.
  if (!entry.foodSnapshot) {
    openQuickAddSheet({
      title: 'Edit quick add',
      values: entry,
      meal: entry.meal,
      confirmLabel: 'Save',
      onConfirm: async (fields) => {
        await updateQuickEntry(entry, fields);
        toast(`Updated ${fields.name}`);
        refresh();
      },
      onDelete: () => removeEntry(entry, refresh),
    });
    return;
  }

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
    onDelete: () => removeEntry(entry, refresh),
  });
}
