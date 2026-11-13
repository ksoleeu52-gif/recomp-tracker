/**
 * Display helpers for foods, shared by the Foods list and (later) the add-food sheet.
 */
import { html } from '../lib/html.js';
import { fmtInt, fmtDecimal } from '../lib/format.js';

/** "per 100g" / "per egg (50g)" */
export function basisLabel(food) {
  if (food.basis === 'per100g') return 'per 100g';
  const weight = food.servingGrams ? ` (${fmtDecimal(food.servingGrams)}g)` : '';
  return `per ${food.servingLabel || 'serving'}${weight}`;
}

/** "80 g" / "1 × scoop" / "2 × large egg" */
export function portionLabel(food, amount, unit) {
  if (unit === 'g') return `${fmtDecimal(amount)} g`;
  return `${fmtDecimal(amount)} × ${food.servingLabel || 'serving'}`;
}

/** Human name for a unit in a <select>: "grams" / "× scoop". */
export function unitLabel(food, unit) {
  return unit === 'g' ? 'grams' : `× ${food.servingLabel || 'serving'}`;
}

/** "296 kcal · 8.8g protein · 48.8g carbs · 6g fat" with emphasis on kcal and protein. */
export function macroLine(m) {
  return html`<b>${fmtInt(m.kcal)} kcal</b> · <b class="text-protein">${fmtDecimal(m.protein)}g protein</b>
    · ${fmtDecimal(m.carbs)}g carbs · ${fmtDecimal(m.fat)}g fat`;
}

/** One line in the Foods list: tap to open the editor, ☆ to toggle favourite. */
export function foodRow(food) {
  return html`
    <li class="food-row" data-food-id="${food.id}">
      <a class="row" href="#/food/${encodeURIComponent(food.id)}">
        <span class="row__main">
          <span class="row__title">${food.name}</span>
          <span class="row__meta">${food.brand && `${food.brand} · `}${basisLabel(food)} · <b class="text-protein">${fmtDecimal(food.protein)}g protein</b></span>
        </span>
        <span class="row__side"><b>${fmtInt(food.kcal)}</b><small>kcal</small></span>
      </a>
      ${favouriteButton(food)}
    </li>`;
}

/** Star toggle. aria-pressed tells screen readers whether it's on. */
export function favouriteButton(food) {
  const on = Boolean(food.isFavourite);
  return html`
    <button class="fav-btn ${on && 'is-on'}" type="button" data-action="favourite" aria-pressed="${on}"
      aria-label="${on ? 'Remove from favourites' : 'Add to favourites'}: ${food.name}">${on ? '★' : '☆'}</button>`;
}
