/**
 * Add food to a meal.  Route: #/add?meal=breakfast&date=YYYY-MM-DD
 *
 * Built for speed:
 *  - Saved meals for this slot come first ("Add to Breakfast" shows breakfast meals);
 *    their + logs the whole meal in one tap.
 *  - Then your foods, most recently used first. Each row shows the portion its +
 *    will log (your last-used amount). "+ Breakfast" then "+" = 2 taps.
 *  - Tapping a name opens a sheet for a different portion (foods) or a preview (meals).
 *  - You stay on this screen, so several things can be added in a row; the bar at
 *    the bottom shows what you've added, and Done goes back.
 */
import { html, render } from '../lib/html.js';
import { listFoods, matchFoods } from '../db/foods.js';
import { logFood, deleteEntries, MEAL_IDS } from '../db/log.js';
import { listMeals, logSavedMeal, resolveItems, mealTotals } from '../db/meals.js';
import { todayKey, dayLabel, isDayKey } from '../lib/dates.js';
import { fmtInt, fmtDecimal } from '../lib/format.js';
import { defaultPortion, macrosFor, sumMacros } from '../lib/nutrition.js';
import { MEALS } from '../config.js';
import { backHeader } from '../components/header.js';
import { portionLabel, macroLine } from '../components/food-row.js';
import { openPortionSheet } from '../components/portion-sheet.js';
import { openSheet } from '../components/sheet.js';
import { icons } from '../components/icons.js';
import { toast } from '../components/toast.js';

export default {
  title: 'Add food',
  tab: 'today',

  async render(root, { query, refresh }) {
    const slot = MEAL_IDS.includes(query.meal) ? query.meal : 'breakfast';
    const slotLabel = MEALS.find((m) => m.id === slot).label;
    const today = todayKey();
    const date = isDayKey(query.date) ? query.date : today;

    const [allFoods, meals] = await Promise.all([listFoods({ includeArchived: true }), listMeals()]);
    const foodsById = new Map(allFoods.map((food) => [food.id, food]));
    // Most recently used first; never-used foods keep their A–Z order (sort is stable).
    const foods = allFoods.filter((f) => !f.archived).sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
    const added = []; // entries logged during this visit, for the bottom bar

    const isEmpty = foods.length === 0 && meals.length === 0;
    render(root, html`
      ${backHeader(`Add to ${slotLabel}`, 'today', date === today ? '' : dayLabel(date, today))}
      ${isEmpty
        ? html`
          <div class="empty">
            <p class="empty__title">Your food library is empty</p>
            <p>Add a food first, then you can log it here.</p>
            <div class="empty__actions"><a class="btn btn--primary btn--block" href="#/food/new">${icons.plus} New food</a></div>
          </div>`
        : html`
          <label class="search">
            ${icons.search}
            <input type="search" id="pick-search" placeholder="Search foods and meals" autocomplete="off" enterkeyhint="search" aria-label="Search foods and meals">
          </label>
          <div id="pick-lists"></div>`}
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

    const lists = root.querySelector('#pick-lists');
    if (!lists) return;

    let currentQuery = '';
    const drawLists = () => {
      const searching = currentQuery.trim() !== '';
      const matchingMeals = matchFoods(meals, currentQuery);
      // While searching, show every matching meal; otherwise this slot's meals first, others tucked away.
      const firstMeals = searching ? matchingMeals : matchingMeals.filter((m) => m.mealType === slot);
      const otherMeals = searching ? [] : matchingMeals.filter((m) => m.mealType !== slot);
      const matchingFoods = matchFoods(foods, currentQuery);

      render(lists, html`
        ${firstMeals.length > 0 && html`
          <h2 class="list-heading">${searching ? 'Saved meals' : `Your ${slotLabel.toLowerCase()} meals`}</h2>
          <ul class="list pick-list">${firstMeals.map((meal) => mealRow(meal, foodsById))}</ul>`}

        <h2 class="list-heading">${searching ? 'Foods' : 'Foods · recent first'}</h2>
        <ul class="list pick-list">
          ${matchingFoods.map((food) => foodRow(food))}
          <li class="list__empty">
            ${matchingFoods.length === 0 && html`No foods match “${currentQuery}”. `}
            <a href="#/food/new${currentQuery && `?name=${encodeURIComponent(currentQuery)}`}">+ Create a new food</a>
          </li>
        </ul>

        ${otherMeals.length > 0 && html`
          <details class="more">
            <summary class="list-heading">Other saved meals (${otherMeals.length})</summary>
            <ul class="list pick-list">${otherMeals.map((meal) => mealRow(meal, foodsById))}</ul>
          </details>`}
      `);
    };
    drawLists();
    root.querySelector('#pick-search').addEventListener('input', (event) => {
      currentQuery = event.target.value;
      drawLists();
    });

    /** Shared "added" feedback: bottom bar, a tick on the row, and an Undo toast. */
    const confirmAdded = (entries, row, message) => {
      added.push(...entries);
      updateSummary();
      flash(row);
      toast(message, {
        actionLabel: 'Undo',
        duration: 4000,
        onAction: async () => {
          await deleteEntries(entries.map((e) => e.id));
          for (const entry of entries) added.splice(added.indexOf(entry), 1);
          // The toast can outlive this screen (e.g. Undo tapped after Done): refresh whatever is showing.
          if (root.isConnected) updateSummary();
          else refresh();
        },
      });
    };

    const logOneFood = async (food, amount, unit) => {
      const entry = await logFood(food, { date, meal: slot, amount, unit });
      Object.assign(food, { lastUsedAt: entry.createdAt, defaultAmount: amount, defaultUnit: unit });
      // Re-draw the row: its default portion may have changed.
      const row = lists.querySelector(`[data-food-id="${CSS.escape(food.id)}"]`);
      if (row) row.outerHTML = String(foodRow(food));
      confirmAdded([entry], lists.querySelector(`[data-food-id="${CSS.escape(food.id)}"]`), `Added ${food.name} (${portionLabel(food, amount, unit)})`);
    };

    const logMeal = async (meal) => {
      const entries = await logSavedMeal(meal, foodsById, { date, slot });
      const row = lists.querySelector(`[data-meal-id="${CSS.escape(meal.id)}"]`);
      confirmAdded(entries, row, `Added ${meal.name} (${entries.length} items)`);
    };

    lists.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const row = button.closest('li');

      if (row.dataset.foodId) {
        const food = foods.find((f) => f.id === row.dataset.foodId);
        const portion = defaultPortion(food);
        if (button.dataset.action === 'quick') return logOneFood(food, portion.amount, portion.unit);
        return openPortionSheet({
          title: food.name,
          food,
          ...portion,
          confirmLabel: `Add to ${slotLabel}`,
          onConfirm: ({ amount, unit }) => logOneFood(food, amount, unit),
        });
      }

      if (row.dataset.mealId) {
        const meal = meals.find((m) => m.id === row.dataset.mealId);
        if (button.dataset.action === 'quick') return logMeal(meal);
        return previewMeal(meal, foodsById, slotLabel, () => logMeal(meal));
      }
    });
  },
};

/** A food in the picker: name + the portion that "+" will log. */
function foodRow(food) {
  const { amount, unit } = defaultPortion(food);
  const m = macrosFor(food, amount, unit);
  const portion = portionLabel(food, amount, unit);
  return html`
    <li class="pick" data-food-id="${food.id}">
      <button class="pick__main" type="button" data-action="choose">
        <span class="row__title">${food.name}</span>
        <span class="row__meta">${portion} · ${fmtInt(m.kcal)} kcal · <b class="text-protein">${fmtDecimal(m.protein)}g P</b></span>
      </button>
      <button class="pick__add" type="button" data-action="quick" aria-label="Add ${portion} of ${food.name}">${icons.plus}</button>
    </li>`;
}

/** A saved meal in the picker: its + logs every item. */
function mealRow(meal, foodsById) {
  const totals = mealTotals(meal, foodsById);
  return html`
    <li class="pick pick--meal" data-meal-id="${meal.id}">
      <button class="pick__main" type="button" data-action="preview">
        <span class="row__title">${meal.name}</span>
        <span class="row__meta">${meal.items.length} items · ${fmtInt(totals.kcal)} kcal · <b class="text-protein">${fmtDecimal(totals.protein)}g P</b></span>
      </button>
      <button class="pick__add" type="button" data-action="quick" aria-label="Add all of ${meal.name}">${icons.plus}</button>
    </li>`;
}

/** Briefly marks a row as added (green tick). */
function flash(row) {
  if (!row) return;
  row.classList.add('is-added');
  const button = row.querySelector('.pick__add');
  const original = button.innerHTML;
  button.innerHTML = String(icons.check);
  setTimeout(() => {
    row.classList.remove('is-added');
    button.innerHTML = original;
  }, 1200);
}

/** Sheet listing what's in a saved meal, with "Add all" and "Edit meal". */
function previewMeal(meal, foodsById, slotLabel, onAdd) {
  const resolved = resolveItems(meal, foodsById);
  const dialog = openSheet(html`
    <h2 class="sheet__title">${meal.name}</h2>
    <p class="sheet__subtitle">${meal.items.length} items</p>
    <ul class="preview-items">
      ${resolved.map((r) => html`
        <li>
          <span>${r.food?.name ?? 'Missing food'} <span class="muted">${r.food && portionLabel(r.food, r.amount, r.unit)}</span></span>
          <span>${r.macros ? html`${fmtInt(r.macros.kcal)} kcal` : html`<span class="text-danger">skipped</span>`}</span>
        </li>`)}
    </ul>
    <p class="calc__result">${macroLine(mealTotals(meal, foodsById))}</p>
    <button class="btn btn--primary btn--block" type="button" data-action="add-all">Add all to ${slotLabel}</button>
    <a class="btn btn--block mt" href="#/meal/${encodeURIComponent(meal.id)}">Edit meal</a>
  `, { label: meal.name });

  dialog.querySelector('[data-action="add-all"]').addEventListener('click', () => {
    dialog.close();
    onAdd();
  });
}
