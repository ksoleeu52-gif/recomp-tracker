/**
 * Create / edit a saved meal.
 * Routes: #/meal/new[?type=lunch]   #/meal/<id>
 *         #/meal/new?fromDate=YYYY-MM-DD&fromMeal=breakfast   ("Save as meal" from Today)
 *
 * Items are held in memory while editing; amounts and units are edited inline
 * and the totals update live. Nothing is written until "Save meal".
 */
import { html, render } from '../lib/html.js';
import { getMeal, saveMeal, deleteMeal, restoreMeal, validateMeal, resolveItems } from '../db/meals.js';
import { listFoods } from '../db/foods.js';
import { getDayLog, MEAL_IDS } from '../db/log.js';
import { isDayKey } from '../lib/dates.js';
import { parseNumber, fmtInt, fmtDecimal } from '../lib/format.js';
import { macrosFor, unitsFor, defaultPortion, convertAmount, sumMacros } from '../lib/nutrition.js';
import { MEALS } from '../config.js';
import { field, showFieldErrors } from '../components/fields.js';
import { backHeader } from '../components/header.js';
import { unitLabel, macroLine } from '../components/food-row.js';
import { openFoodPicker } from '../components/food-picker-sheet.js';
import { icons } from '../components/icons.js';
import { toast } from '../components/toast.js';
import { goBack, navigate } from '../router.js';

export default {
  title: 'Meal',
  tab: 'meals',

  async render(root, { params, query }) {
    const id = params[0] && params[0] !== 'new' ? params[0] : null;
    const [existing, allFoods] = await Promise.all([id ? getMeal(id) : null, listFoods({ includeArchived: true })]);

    if (id && !existing) {
      render(root, html`${backHeader('Meal not found', 'meals')}<div class="empty"><p>This meal no longer exists.</p></div>`);
      return;
    }

    const foodsById = new Map(allFoods.map((food) => [food.id, food]));
    const activeFoods = allFoods.filter((food) => !food.archived);
    const draft = await initialDraft(existing, query);
    // Drop items whose food no longer exists at all (e.g. after an import), and if a
    // food was edited so the saved unit no longer works, switch to one that does.
    const items = draft.items
      .filter((item) => foodsById.has(item.foodId))
      .map((item) => {
        const units = unitsFor(foodsById.get(item.foodId));
        return units.includes(item.unit) ? item : { ...item, unit: units[0] };
      });

    render(root, html`
      ${backHeader(existing ? 'Edit meal' : 'New meal', 'meals')}
      <form id="meal-form" novalidate>
        <section class="card">
          ${field({ name: 'name', label: 'Name', value: draft.name, inputmode: 'text', placeholder: 'e.g. My usual breakfast' })}
          <fieldset class="fieldset">
            <legend class="field__label">Show it first when adding to</legend>
            <div class="segmented segmented--small">
              ${MEALS.map((m) => html`
                <label><input type="radio" name="mealType" value="${m.id}" ${m.id === draft.mealType && html`checked`}><span>${m.label}</span></label>`)}
            </div>
          </fieldset>
        </section>

        <section class="card">
          <h2 class="card__title">Foods</h2>
          <ul class="items" data-items></ul>
          <p class="field__error" data-items-error></p>
          <button class="btn btn--block" type="button" data-action="add-item">${icons.plus} Add food</button>
        </section>

        <p class="meal-total" data-total aria-live="polite"></p>
        <button class="btn btn--primary btn--block" type="submit">Save meal</button>
        ${existing && html`<button class="btn btn--danger btn--block mt" type="button" data-action="delete">Delete meal</button>`}
      </form>
    `);

    const form = root.querySelector('#meal-form');
    const list = form.querySelector('[data-items]');

    const updateTotal = () => {
      const totals = sumMacros(resolveItems({ items }, foodsById).filter((r) => r.macros).map((r) => r.macros));
      render(form.querySelector('[data-total]'), items.length ? html`<span class="muted">Total</span> ${macroLine(totals)}` : '');
    };

    const drawItems = () => {
      render(list, items.length
        ? items.map((item, index) => itemRow(item, index, foodsById.get(item.foodId)))
        : html`<li class="items__empty">No foods yet. Tap “Add food” to build the meal.</li>`);
      updateTotal();
    };
    drawItems();

    // Inline amount edits: update that row's macros and the total without re-rendering (keeps focus).
    list.addEventListener('input', (event) => {
      const row = event.target.closest('[data-index]');
      if (!row || event.target.dataset.field !== 'amount') return;
      const item = items[row.dataset.index];
      item.amount = event.target.value;
      updateRow(row, item, foodsById.get(item.foodId));
      updateTotal();
    });

    // Unit change keeps the same quantity (1 × scoop -> 30 g).
    list.addEventListener('change', (event) => {
      const row = event.target.closest('[data-index]');
      if (!row || event.target.dataset.field !== 'unit') return;
      const item = items[row.dataset.index];
      const food = foodsById.get(item.foodId);
      const converted = convertAmount(food, parseNumber(item.amount), item.unit, event.target.value);
      item.unit = event.target.value;
      if (Number.isFinite(converted)) {
        item.amount = converted;
        row.querySelector('[data-field="amount"]').value = converted;
      }
      updateRow(row, item, food);
      updateTotal();
    });

    form.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action === 'remove') {
        items.splice(Number(event.target.closest('[data-index]').dataset.index), 1);
        drawItems();
      } else if (action === 'add-item') {
        openFoodPicker({
          foods: activeFoods,
          onPick: (food) => {
            items.push({ foodId: food.id, ...defaultPortion(food) });
            drawItems();
            form.querySelector('[data-items-error]').textContent = '';
          },
        });
      } else if (action === 'delete') {
        removeMeal(existing);
      }
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { valid, errors, meal } = validateMeal({
        name: form.elements.namedItem('name').value,
        mealType: form.elements.namedItem('mealType').value,
        items,
      });
      showFieldErrors(form, errors);
      form.querySelector('[data-items-error]').textContent = errors.items ?? errors.mealType ?? '';
      if (!valid) return;
      const saved = await saveMeal(meal, existing?.id);
      toast(`Saved ${saved.name}`);
      goBack('meals');
    });
  },
};

/** Starting values: the existing meal, today's logged items ("Save as meal"), or blank. */
async function initialDraft(existing, query) {
  if (existing) {
    return { name: existing.name, mealType: existing.mealType, items: existing.items.map((item) => ({ ...item })) };
  }
  const mealType = MEAL_IDS.includes(query.type) ? query.type : MEAL_IDS.includes(query.fromMeal) ? query.fromMeal : 'breakfast';
  if (isDayKey(query.fromDate) && MEAL_IDS.includes(query.fromMeal)) {
    const entries = (await getDayLog(query.fromDate)).filter((e) => e.meal === query.fromMeal && e.foodId);
    const label = MEALS.find((m) => m.id === query.fromMeal).label.toLowerCase();
    return {
      name: `My usual ${label}`,
      mealType,
      items: entries.map((e) => ({ foodId: e.foodId, amount: e.amount, unit: e.unit })),
    };
  }
  return { name: '', mealType, items: [] };
}

function itemRow(item, index, food) {
  return html`
    <li class="item" data-index="${index}">
      <div class="item__head">
        <span class="row__title">${food.name}</span>
        ${food.archived && html`<span class="tag">deleted food</span>`}
        <button class="icon-btn item__remove" type="button" data-action="remove" aria-label="Remove ${food.name}">${icons.close}</button>
      </div>
      <div class="item__controls">
        <div class="input-wrap input-wrap--compact">
          <input data-field="amount" inputmode="decimal" autocomplete="off" value="${item.amount}" aria-label="Amount of ${food.name}">
        </div>
        <div class="input-wrap input-wrap--compact">
          <select data-field="unit" aria-label="Unit for ${food.name}">
            ${unitsFor(food).map((u) => html`<option value="${u}" ${u === item.unit && html`selected`}>${unitLabel(food, u)}</option>`)}
          </select>
        </div>
        <span class="item__macros" data-macros>${itemMacros(item, food)}</span>
      </div>
    </li>`;
}

function itemMacros(item, food) {
  const amount = parseNumber(item.amount);
  if (!(amount > 0)) return html`<span class="text-danger">Check amount</span>`;
  try {
    const m = macrosFor(food, amount, item.unit);
    return html`${fmtInt(m.kcal)} kcal<br><span class="text-protein">${fmtDecimal(m.protein)}g P</span>`;
  } catch {
    // The food was edited so this unit no longer works (e.g. its serving weight was removed).
    return html`<span class="text-danger">Pick a unit</span>`;
  }
}

function updateRow(row, item, food) {
  const amount = parseNumber(item.amount);
  row.querySelector('.input-wrap').classList.toggle('is-invalid', !(amount > 0));
  render(row.querySelector('[data-macros]'), itemMacros(item, food));
}

async function removeMeal(meal) {
  await deleteMeal(meal.id);
  toast(`Deleted ${meal.name}`, {
    actionLabel: 'Undo',
    duration: 5000,
    onAction: async () => {
      await restoreMeal(meal);
      navigate(`meal/${encodeURIComponent(meal.id)}`);
    },
  });
  goBack('meals');
}
