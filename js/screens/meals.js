/**
 * Saved meals, grouped by the meal they're usually eaten at.
 */
import { html, render } from '../lib/html.js';
import { listMeals, mealTotals } from '../db/meals.js';
import { listFoods } from '../db/foods.js';
import { fmtInt } from '../lib/format.js';
import { MEALS } from '../config.js';
import { icons } from '../components/icons.js';

export default {
  title: 'Meals',

  async render(root) {
    const [meals, foods] = await Promise.all([listMeals(), listFoods({ includeArchived: true })]);
    const foodsById = new Map(foods.map((food) => [food.id, food]));

    const header = html`
      <header class="view-header">
        <h1 class="view-title">Saved Meals</h1>
        <a class="btn btn--primary btn--pill" href="#/meal/new">${icons.plus} New</a>
      </header>`;

    if (meals.length === 0) {
      render(root, html`
        ${header}
        <div class="empty">
          <p class="empty__title">No saved meals yet</p>
          <p>Save the meals you eat often, like your usual breakfast, and log them in one tap.</p>
          <div class="empty__actions"><a class="btn btn--primary btn--block" href="#/meal/new">${icons.plus} Create a meal</a></div>
          <p class="small muted">Tip: already logged it today? Tap “Save as meal” under that meal on the Today screen.</p>
        </div>
      `);
      return;
    }

    render(root, html`
      ${header}
      ${MEALS.map((slot) => {
        const group = meals.filter((meal) => meal.mealType === slot.id);
        return group.length > 0 && html`
          <h2 class="list-heading">${slot.label}</h2>
          <ul class="list">${group.map((meal) => mealRow(meal, foodsById))}</ul>`;
      })}
    `);
  },
};

function mealRow(meal, foodsById) {
  const totals = mealTotals(meal, foodsById);
  const names = meal.items.map((item) => foodsById.get(item.foodId)?.name).filter(Boolean).join(', ');
  return html`
    <li>
      <a class="row" href="#/meal/${encodeURIComponent(meal.id)}">
        <span class="row__main">
          <span class="row__title">${meal.name}</span>
          <span class="row__meta">${names}</span>
        </span>
        <span class="row__side">
          <b>${fmtInt(totals.kcal)}</b>
          <small class="text-protein">${fmtInt(totals.protein)}g P</small>
        </span>
      </a>
    </li>`;
}
