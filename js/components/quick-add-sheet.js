/**
 * Quick add: log raw calories (and optionally protein/carbs/fat) when you don't
 * know the exact food — a restaurant meal, a friend's cooking. Also used to edit
 * quick-add entries afterwards.
 */
import { html } from '../lib/html.js';
import { validateQuickAdd } from '../db/log.js';
import { MEALS } from '../config.js';
import { openSheet } from './sheet.js';
import { field, showFieldErrors } from './fields.js';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {object} [o.values]       existing values when editing
 * @param {string} [o.meal]         show a meal switcher with this selected (editing)
 * @param {string} o.confirmLabel
 * @param {(fields: object) => Promise|void} o.onConfirm  receives validated fields (+ meal)
 * @param {() => Promise|void} [o.onDelete]
 */
export function openQuickAddSheet({ title, values = {}, meal, confirmLabel, onConfirm, onDelete }) {
  const value = (key) => values[key] ?? '';
  const dialog = openSheet(html`
    <form novalidate>
      <h2 class="sheet__title">${title}</h2>
      <p class="sheet__subtitle">For when you don't know the exact food. Only calories are required.</p>
      ${field({ name: 'name', label: 'Name (optional)', value: values.name === 'Quick add' ? '' : value('name'), inputmode: 'text', placeholder: 'e.g. Chipper, takeaway' })}
      <div class="grid-2">
        ${field({ name: 'kcal', label: 'Calories', value: value('kcal'), suffix: 'kcal' })}
        ${field({ name: 'protein', label: 'Protein', value: value('protein'), suffix: 'g' })}
        ${field({ name: 'carbs', label: 'Carbs', value: value('carbs'), suffix: 'g' })}
        ${field({ name: 'fat', label: 'Fat', value: value('fat'), suffix: 'g' })}
      </div>
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
  // New quick add: straight to the calories field. Editing: don't pop the keyboard.
  if (!values.kcal && values.kcal !== 0) form.querySelector('[name="kcal"]').focus();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(form));
    const { valid, errors, fields } = validateQuickAdd(input);
    showFieldErrors(form, errors);
    if (!valid) return;
    form.querySelector('[type="submit"]').disabled = true;
    await onConfirm({ ...fields, ...(input.meal ? { meal: input.meal } : {}) });
    dialog.close();
  });

  form.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    dialog.close();
    await onDelete();
  });
  return dialog;
}
