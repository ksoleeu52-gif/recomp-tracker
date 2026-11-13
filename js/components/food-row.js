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

/** One line in the Foods list. Tapping it opens the editor. */
export function foodRow(food) {
  return html`
    <li>
      <a class="row" href="#/food/${encodeURIComponent(food.id)}">
        <span class="row__main">
          <span class="row__title">${food.name}</span>
          <span class="row__meta">${food.brand && `${food.brand} · `}${basisLabel(food)} · <b class="text-protein">${fmtDecimal(food.protein)}g protein</b></span>
        </span>
        <span class="row__side"><b>${fmtInt(food.kcal)}</b><small>kcal</small></span>
      </a>
    </li>`;
}
