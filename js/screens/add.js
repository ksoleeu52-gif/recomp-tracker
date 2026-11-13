/**
 * Add food to a meal.  Route: #/add?meal=breakfast&date=YYYY-MM-DD
 *
 * Built for speed:
 *  - Each row shows the portion it will log (your last-used amount).
 *  - The round + button logs that portion instantly. "+ Breakfast" then "+" = 2 taps.
 *  - Tapping the food name opens the amount sheet for a different portion.
 *  - You stay on this screen, so a whole meal can be added in a row; the bar at
 *    the bottom shows what you've added, and Done goes back.
 */
import { html, render } from '../lib/html.js';
import { listFoods, matchFoods } from '../db/foods.js';
import { logFood, deleteEntry, MEAL_IDS } from '../db/log.js';
import { todayKey, dayLabel, isDayKey } from '../lib/dates.js';
import { fmtInt, fmtDecimal } from '../lib/format.js';
import { defaultPortion, macrosFor, sumMacros } from '../lib/nutrition.js';
import { MEALS } from '../config.js';
import { backHeader } from '../components/header.js';
import { portionLabel } from '../components/food-row.js';
import { openPortionSheet } from '../components/portion-sheet.js';
import { icons } from '../components/icons.js';
import { toast } from '../components/toast.js';

export default {
  title: 'Add food',
  tab: 'today',

  async render(root, { query, refresh }) {
    const meal = MEAL_IDS.includes(query.meal) ? query.meal : 'breakfast';
    const mealLabel = MEALS.find((m) => m.id === meal).label;
    const today = todayKey();
    const date = isDayKey(query.date) ? query.date : today;

    // Most recently used first; never-used foods keep their A–Z order (sort is stable).
    const foods = (await listFoods()).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    const added = []; // entries logged during this visit, for the bottom bar

    render(root, html`
      ${backHeader(`Add to ${mealLabel}`, 'today', date === today ? '' : dayLabel(date, today))}
      ${foods.length === 0
        ? html`
          <div class="empty">
            <p class="empty__title">Your food library is empty</p>
            <p>Add a food first, then you can log it here.</p>
            <div class="empty__actions"><a class="btn btn--primary btn--block" href="#/food/new">${icons.plus} New food</a></div>
          </div>`
        : html`
          <label class="search">
            ${icons.search}
            <input type="search" id="pick-search" placeholder="Search your foods" autocomplete="off" enterkeyhint="search" aria-label="Search foods">
          </label>
          <ul class="list pick-list" id="pick-list"></ul>`}
      <div class="action-bar">
        <p class="action-bar__text" data-summary></p>
        <button class="btn btn--primary" type="button" data-back="today">Done</button>
      </div>
    `);

    const summary = root.querySelector('[data-summary]');
    const updateSummary = () => {
      const t = sumMacros(added);
      render(summary, added.length
        ? html`<b>${added.length} added</b> · ${fmtInt(t.kcal)} kcal · <span class="text-protein">${fmtInt(t.protein)}g protein</span>`
        : html`Tap <b>+</b> to add your usual amount`);
    };
    updateSummary();

    const list = root.querySelector('#pick-list');
    if (!list) return;

    let currentQuery = '';
    const drawList = () => {
      const matches = matchFoods(foods, currentQuery);
      render(list, html`
        ${matches.map(pickRow)}
        <li class="list__empty">
          ${matches.length === 0 && html`No foods match “${currentQuery}”. `}
          <a href="#/food/new${currentQuery && `?name=${encodeURIComponent(currentQuery)}`}">+ Create a new food</a>
        </li>`);
    };
    drawList();
    root.querySelector('#pick-search').addEventListener('input', (event) => {
      currentQuery = event.target.value;
      drawList();
    });

    /** Logs a portion, updates the UI and offers Undo. */
    const log = async (food, amount, unit) => {
      const entry = await logFood(food, { date, meal, amount, unit });
      Object.assign(food, { lastUsedAt: entry.createdAt, defaultAmount: amount, defaultUnit: unit });
      added.push(entry);
      updateSummary();

      // Re-draw this row (its default portion may have changed) and flash a tick.
      const row = list.querySelector(`[data-id="${CSS.escape(food.id)}"]`);
      if (row) {
        row.outerHTML = String(pickRow(food, { justAdded: true }));
        setTimeout(() => list.querySelector(`[data-id="${CSS.escape(food.id)}"]`)?.classList.remove('is-added'), 1200);
      }

      toast(`Added ${food.name} (${portionLabel(food, amount, unit)})`, {
        actionLabel: 'Undo',
        duration: 4000,
        onAction: async () => {
          await deleteEntry(entry.id);
          added.splice(added.indexOf(entry), 1);
          // The toast can outlive this screen (e.g. Undo tapped after Done): refresh whatever is showing.
          if (root.isConnected) updateSummary();
          else refresh();
        },
      });
    };

    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const food = foods.find((f) => f.id === button.closest('[data-id]').dataset.id);
      if (!food) return;
      const portion = defaultPortion(food);

      if (button.dataset.action === 'quick') {
        log(food, portion.amount, portion.unit);
      } else {
        openPortionSheet({
          title: food.name,
          food,
          ...portion,
          confirmLabel: `Add to ${mealLabel}`,
          onConfirm: ({ amount, unit }) => log(food, amount, unit),
        });
      }
    });
  },
};

/** A food in the picker: name + the portion that "+" will log. */
function pickRow(food, { justAdded = false } = {}) {
  const { amount, unit } = defaultPortion(food);
  const m = macrosFor(food, amount, unit);
  const portion = portionLabel(food, amount, unit);
  return html`
    <li class="pick ${justAdded && 'is-added'}" data-id="${food.id}">
      <button class="pick__main" type="button" data-action="choose">
        <span class="row__title">${food.name}</span>
        <span class="row__meta">${portion} · ${fmtInt(m.kcal)} kcal · <b class="text-protein">${fmtDecimal(m.protein)}g P</b></span>
      </button>
      <button class="pick__add" type="button" data-action="quick" aria-label="Add ${portion} of ${food.name}">
        ${justAdded ? icons.check : icons.plus}
      </button>
    </li>`;
}
