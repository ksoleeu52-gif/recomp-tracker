/**
 * "How much?" sheet: amount + unit with a live macro preview.
 * Used both to log a food with a custom amount and to edit a logged entry
 * (where it also offers a meal switcher and Delete).
 */
import { html, render } from '../lib/html.js';
import { parseNumber } from '../lib/format.js';
import { macrosFor, unitsFor, convertAmount } from '../lib/nutrition.js';
import { MEALS } from '../config.js';
import { openSheet } from './sheet.js';
import { basisLabel, portionLabel, unitLabel, macroLine } from './food-row.js';

const MAX_AMOUNT = { g: 5000, serving: 100 };

/**
 * @param {object} o
 * @param {string} o.title                 food name
 * @param {object} o.food                  a food or entry.foodSnapshot (basis + values)
 * @param {number} o.amount                initial amount
 * @param {string} o.unit                  initial unit ('g' | 'serving')
 * @param {string} [o.meal]                if given, show a meal switcher with this selected
 * @param {string} o.confirmLabel          e.g. "Add to Breakfast" / "Save"
 * @param {(r: {amount:number, unit:string, meal?:string}) => Promise|void} o.onConfirm
 * @param {() => Promise|void} [o.onDelete] if given, show a Delete button
 * @param {boolean} [o.focusAmount]        focus + select the amount on open (opens the keyboard)
 */
export function openPortionSheet({ title, food, amount, unit, meal, confirmLabel, onConfirm, onDelete, focusAmount = true }) {
  const units = unitsFor(food);
  const dialog = openSheet(html`
    <form class="portion" novalidate>
      <h2 class="sheet__title">${title}</h2>
      <p class="sheet__subtitle">${basisLabel(food)}</p>

      <div class="calc">
        <div class="input-wrap">
          <input name="amount" inputmode="decimal" autocomplete="off" enterkeyhint="done" aria-label="Amount" value="${amount}">
        </div>
        <div class="input-wrap">
          <select name="unit" aria-label="Unit">
            ${units.map((u) => html`<option value="${u}" ${u === unit && html`selected`}>${unitLabel(food, u)}</option>`)}
          </select>
        </div>
      </div>
      <p class="field__error" data-error></p>
      <p class="calc__result" data-preview aria-live="polite"></p>

      ${meal && html`
        <div class="segmented segmented--small" role="radiogroup" aria-label="Meal">
          ${MEALS.map((m) => html`
            <label><input type="radio" name="meal" value="${m.id}" ${m.id === meal && html`checked`}><span>${m.label}</span></label>`)}
        </div>`}

      <button class="btn btn--primary btn--block" type="submit">${confirmLabel}</button>
      ${onDelete && html`<button class="btn btn--danger btn--block mt" type="button" data-action="delete">Delete entry</button>`}
    </form>
  `, { label: title });

  const form = dialog.querySelector('form');
  const error = form.querySelector('[data-error]');
  let currentUnit = unit;

  /** Returns the parsed amount, or null (with a message shown) if it's not valid. */
  const readAmount = () => {
    const value = parseNumber(form.amount.value);
    const max = MAX_AMOUNT[form.unit.value];
    const ok = value > 0 && value <= max;
    error.textContent = ok || form.amount.value.trim() === '' ? '' : `Enter an amount above 0 (max ${max}).`;
    return ok ? value : null;
  };

  const updatePreview = () => {
    const value = readAmount();
    const preview = form.querySelector('[data-preview]');
    if (value == null) {
      preview.textContent = '';
      return;
    }
    render(preview, html`
      <span class="calc__portion">${portionLabel(food, value, form.unit.value)} =</span>
      ${macroLine(macrosFor(food, value, form.unit.value))}`);
  };

  // Switching units keeps the same quantity: 1 × scoop (30g) -> 30 g.
  form.unit.addEventListener('change', () => {
    const value = parseNumber(form.amount.value);
    if (value > 0) {
      const converted = convertAmount(food, value, currentUnit, form.unit.value);
      if (Number.isFinite(converted)) form.amount.value = converted;
    }
    currentUnit = form.unit.value;
    updatePreview();
  });
  form.amount.addEventListener('input', updatePreview);
  updatePreview();

  // When logging, select the amount so typing replaces it straight away.
  // When editing, don't pop the keyboard: you may only want to move or delete the entry.
  if (focusAmount) {
    form.amount.focus();
    form.amount.select();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = readAmount();
    if (value == null) {
      error.textContent ||= 'Enter an amount.';
      form.amount.focus();
      return;
    }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true; // guard against double taps
    await onConfirm({ amount: value, unit: form.unit.value, meal: form.meal?.value });
    dialog.close();
  });

  form.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    dialog.close();
    await onDelete();
  });

  return dialog;
}
