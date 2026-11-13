/**
 * Add food to a meal.  Route: #/add?meal=breakfast&date=YYYY-MM-DD
 *
 * Built for speed. Sections, in order:
 *   1. Saved meals for this slot — their + logs the whole meal in one tap
 *   2. ★ Favourites
 *   3. Recent — what you've logged lately
 *   4. All other foods, A–Z
 *   5. Saved meals for other slots (collapsed)
 * Every food row shows the portion its + will log (your last-used amount), so
 * "+ Breakfast" then "+" = 2 taps. Tapping a name opens a sheet for a different
 * portion (foods) or a preview (meals). "Quick add" logs raw calories.
 * You stay on this screen to add several things; Done goes back.
 */
import { html, render } from '../lib/html.js';
import { listFoods, matchFoods } from '../db/foods.js';
import { logFood, logQuickAdd, undoLogging, usageOf, MEAL_IDS } from '../db/log.js';
import { listMeals, logSavedMeal, resolveItems, mealTotals } from '../db/meals.js';
import { todayKey, dayLabel, isDayKey } from '../lib/dates.js';
import { fmtInt, fmtDecimal } from '../lib/format.js';
import { defaultPortion, macrosFor, sumMacros } from '../lib/nutrition.js';
import { MEALS } from '../config.js';
import { backHeader } from '../components/header.js';
import { portionLabel, macroLine } from '../components/food-row.js';
import { openPortionSheet } from '../components/portion-sheet.js';
import { openQuickAddSheet } from '../components/quick-add-sheet.js';
import { openSheet } from '../components/sheet.js';
import { icons } from '../components/icons.js';
import { toast } from '../components/toast.js';

const RECENT_LIMIT = 10;

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
    const foods = allFoods.filter((f) => !f.archived); // A–Z
    const added = []; // entries logged during this visit, for the bottom bar

    render(root, html`
      ${backHeader(`Add to ${slotLabel}`, 'today', date === today ? '' : dayLabel(date, today))}
      <div class="add-tools">
        <label class="search">
          ${icons.search}
          <input type="search" id="pick-search" placeholder="Search" autocomplete="off" enterkeyhint="search" aria-label="Search foods and meals">
        </label>
        <button class="btn add-tools__quick" type="button" data-action="quick-add">${icons.bolt} Quick add</button>
      </div>
      <div id="pick-lists"></div>
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
    let currentQuery = '';

    const drawLists = () => {
      const q = currentQuery.trim();
      if (foods.length === 0 && meals.length === 0) {
        render(lists, html`
          <div class="empty">
            <p class="empty__title">Your food library is empty</p>
            <p>Add a food to log it here, or use Quick add for a one-off.</p>
            <div class="empty__actions"><a class="btn btn--primary btn--block" href="#/food/new">${icons.plus} New food</a></div>
          </div>`);
        return;
      }

      const createLink = html`
        <li class="list__empty">
          <a href="#/food/new${q && `?name=${encodeURIComponent(q)}`}">+ Create a new food</a>
        </li>`;

      if (q) {
        // Searching: one list of meals, one of foods (best matches first).
        const matchingMeals = matchFoods(meals, q);
        const matchingFoods = matchFoods(foods, q);
        render(lists, html`
          ${section('Saved meals', matchingMeals.map((m) => mealRow(m, foodsById)))}
          ${section('Foods', html`
            ${matchingFoods.map(foodRow)}
            ${matchingFoods.length === 0 && html`<li class="list__empty">No foods match “${q}”.</li>`}
            ${createLink}`)}
        `);
        return;
      }

      const favourites = foods.filter((f) => f.isFavourite);
      const recent = foods
        .filter((f) => !f.isFavourite && f.lastUsedAt > 0)
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
        .slice(0, RECENT_LIMIT);
      const shown = new Set([...favourites, ...recent]);
      const others = foods.filter((f) => !shown.has(f));
      const slotMeals = meals.filter((m) => m.mealType === slot);
      const otherMeals = meals.filter((m) => m.mealType !== slot);

      render(lists, html`
        ${section(`Your ${slotLabel.toLowerCase()} meals`, slotMeals.map((m) => mealRow(m, foodsById)))}
        ${section('★ Favourites', favourites.map(foodRow))}
        ${section('Recent', recent.map(foodRow))}
        ${section(shown.size ? 'All other foods' : 'Your foods', html`${others.map(foodRow)}${createLink}`, { always: true })}
        ${otherMeals.length > 0 && html`
          <details class="more">
            <summary class="list-heading">Other saved meals (${otherMeals.length})</summary>
            <ul class="list pick-list">${otherMeals.map((m) => mealRow(m, foodsById))}</ul>
          </details>`}
      `);
    };
    drawLists();
    root.querySelector('#pick-search').addEventListener('input', (event) => {
      currentQuery = event.target.value;
      drawLists();
    });

    /**
     * Shared "added" feedback: bottom bar, a tick on the row, and an Undo toast.
     * `previous` is the usage captured before logging, so Undo also restores
     * Recent order and remembered portions.
     */
    const confirmAdded = (entries, rows, message, previous = {}) => {
      added.push(...entries);
      updateSummary();
      rows.forEach(flash);
      toast(message, {
        actionLabel: 'Undo',
        duration: 4000,
        onAction: async () => {
          await undoLogging(entries, previous);
          for (const { id, usage } of previous.foods ?? []) Object.assign(foodsById.get(id), usage);
          for (const { id, usage } of previous.meals ?? []) Object.assign(meals.find((m) => m.id === id) ?? {}, usage);
          for (const entry of entries) added.splice(added.indexOf(entry), 1);
          // The toast can outlive this screen (e.g. Undo tapped after Done): refresh whatever is showing.
          if (root.isConnected) {
            updateSummary();
            drawLists();
          } else {
            refresh();
          }
        },
      });
    };

    const rowsFor = (attr, id) => [...lists.querySelectorAll(`[${attr}="${CSS.escape(id)}"]`)];

    const logOneFood = async (food, amount, unit) => {
      const previous = { foods: [{ id: food.id, usage: usageOf(food) }] };
      const entry = await logFood(food, { date, meal: slot, amount, unit });
      Object.assign(food, { lastUsedAt: entry.createdAt, useCount: (food.useCount || 0) + 1, defaultAmount: amount, defaultUnit: unit });
      // Re-draw the food's rows in place (its default portion may have changed) without reordering.
      for (const row of rowsFor('data-food-id', food.id)) row.outerHTML = String(foodRow(food));
      confirmAdded([entry], rowsFor('data-food-id', food.id), `Added ${food.name} (${portionLabel(food, amount, unit)})`, previous);
    };

    const logMeal = async (meal) => {
      const mealFoods = resolveItems(meal, foodsById).filter((r) => r.food).map((r) => r.food);
      const previous = {
        foods: [...new Set(mealFoods)].map((f) => ({ id: f.id, usage: usageOf(f) })),
        meals: [{ id: meal.id, usage: usageOf(meal) }],
      };
      const entries = await logSavedMeal(meal, foodsById, { date, slot });
      const now = entries[0]?.createdAt ?? Date.now();
      for (const f of mealFoods) f.lastUsedAt = now;
      meal.lastUsedAt = now;
      confirmAdded(entries, rowsFor('data-meal-id', meal.id), `Added ${meal.name} (${entries.length} items)`, previous);
    };

    const quickAdd = () =>
      openQuickAddSheet({
        title: `Quick add to ${slotLabel}`,
        confirmLabel: `Add to ${slotLabel}`,
        onConfirm: async (fields) => {
          const entry = await logQuickAdd({ date, meal: slot, ...fields });
          confirmAdded([entry], [], `Added ${entry.name} (${fmtInt(entry.kcal)} kcal)`);
        },
      });

    root.querySelector('[data-action="quick-add"]').addEventListener('click', quickAdd);

    lists.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const row = button.closest('li');

      if (row?.dataset.foodId) {
        const food = foodsById.get(row.dataset.foodId);
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

      if (row?.dataset.mealId) {
        const meal = meals.find((m) => m.id === row.dataset.mealId);
        if (button.dataset.action === 'quick') return logMeal(meal);
        return previewMeal(meal, foodsById, slotLabel, () => logMeal(meal));
      }
    });
  },
};

/** A titled list; empty sections are hidden unless `always`. */
function section(title, rows, { always = false } = {}) {
  const isEmpty = Array.isArray(rows) && rows.length === 0;
  if (isEmpty && !always) return '';
  return html`
    <h2 class="list-heading">${title}</h2>
    <ul class="list pick-list">${rows}</ul>`;
}

/** A food in the picker: name + the portion that "+" will log. */
function foodRow(food) {
  const { amount, unit } = defaultPortion(food);
  const m = macrosFor(food, amount, unit);
  const portion = portionLabel(food, amount, unit);
  return html`
    <li class="pick" data-food-id="${food.id}">
      <button class="pick__main" type="button" data-action="choose">
        <span class="row__title">${food.isFavourite && html`<span class="star" aria-label="Favourite">★</span> `}${food.name}</span>
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
