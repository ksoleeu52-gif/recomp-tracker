/**
 * Sheet with a searchable list of foods; tapping one calls onPick(food) and closes.
 * Used by the meal editor (and later the recipe builder).
 */
import { html, render } from '../lib/html.js';
import { fmtInt } from '../lib/format.js';
import { matchFoods } from '../db/foods.js';
import { openSheet } from './sheet.js';
import { basisLabel } from './food-row.js';
import { icons } from './icons.js';

/**
 * @param {{ foods: object[], title?: string, onPick: (food: object) => void }} o
 */
export function openFoodPicker({ foods, title = 'Add a food', onPick }) {
  const dialog = openSheet(html`
    <h2 class="sheet__title">${title}</h2>
    <label class="search search--sheet">
      ${icons.search}
      <input type="search" placeholder="Search your foods" autocomplete="off" enterkeyhint="search" aria-label="Search foods">
    </label>
    <ul class="list" data-list></ul>
  `, { label: title });

  const list = dialog.querySelector('[data-list]');
  const draw = (query = '') => {
    const matches = matchFoods(foods, query);
    render(list, matches.length
      ? matches.map((food) => html`
          <li>
            <button class="row row--button" type="button" data-id="${food.id}">
              <span class="row__main">
                <span class="row__title">${food.name}</span>
                <span class="row__meta">${basisLabel(food)}</span>
              </span>
              <span class="row__side"><b>${fmtInt(food.kcal)}</b><small>kcal</small></span>
            </button>
          </li>`)
      : html`<li class="list__empty">No foods match “${query}”.</li>`);
  };
  draw();

  dialog.querySelector('input').addEventListener('input', (event) => draw(event.target.value));
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-id]');
    const food = button && foods.find((f) => f.id === button.dataset.id);
    if (!food) return;
    dialog.close();
    onPick(food);
  });
  return dialog;
}
