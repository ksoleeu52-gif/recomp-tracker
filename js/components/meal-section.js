/**
 * One meal card on the Today screen: heading with subtotal, the logged entries,
 * an "Add" button and, once something is logged, "Save as meal".
 */
import { html } from '../lib/html.js';
import { fmtInt, fmtDecimal } from '../lib/format.js';
import { sumMacros } from '../lib/nutrition.js';
import { portionLabel } from './food-row.js';
import { icons } from './icons.js';

/**
 * @param {{ meal: {id:string,label:string}, entries: object[], date: string }} o
 */
export function mealSection({ meal, entries, date }) {
  const subtotal = sumMacros(entries);
  const canSave = entries.some((entry) => entry.foodId);

  return html`
    <section class="card meal" aria-labelledby="meal-${meal.id}">
      <header class="meal__header">
        <h2 class="meal__title" id="meal-${meal.id}">${meal.label}</h2>
        ${entries.length > 0 && html`
          <p class="meal__totals">${fmtInt(subtotal.kcal)} kcal · <span class="text-protein">${fmtInt(subtotal.protein)}g protein</span></p>`}
      </header>
      ${entries.length > 0 && html`<ul class="meal__entries">${entries.map(entryRow)}</ul>`}
      <div class="meal__footer">
        <a class="meal__add" href="#/add?meal=${meal.id}&date=${date}">${icons.plus} Add to ${meal.label}</a>
        ${canSave && html`<a class="meal__save" href="#/meal/new?fromDate=${date}&fromMeal=${meal.id}">Save as meal</a>`}
      </div>
    </section>`;
}

function entryRow(entry) {
  const portion = entry.foodSnapshot ? portionLabel(entry.foodSnapshot, entry.amount, entry.unit) : 'Quick add';
  return html`
    <li>
      <button class="row row--button" type="button" data-entry="${entry.id}" aria-label="Edit ${entry.name}">
        <span class="row__main">
          <span class="row__title">${entry.name}</span>
          <span class="row__meta">${portion}</span>
        </span>
        <span class="row__side">
          <b>${fmtInt(entry.kcal)}</b>
          <small class="text-protein">${fmtDecimal(entry.protein)}g P</small>
        </span>
      </button>
    </li>`;
}
