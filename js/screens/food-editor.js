/**
 * Create / edit a food.  Routes: #/food/new   #/food/<id>
 *
 * The form switches between "per 100g" and "per serving" without re-rendering
 * (so the keyboard and typed values are kept), and has a live "Check the maths"
 * calculator so you can confirm the numbers before saving.
 */
import { html, render } from '../lib/html.js';
import { getFood, saveFood, archiveFood, restoreFood, validateFood } from '../db/foods.js';
import { macrosFor, unitsFor, defaultPortion, kcalFromMacros } from '../lib/nutrition.js';
import { parseNumber, fmtInt } from '../lib/format.js';
import { field, showFieldErrors } from '../components/fields.js';
import { portionLabel, unitLabel, macroLine } from '../components/food-row.js';
import { backHeader } from '../components/header.js';
import { toast } from '../components/toast.js';
import { goBack, navigate } from '../router.js';

/** Text that changes with the selected basis. */
const BASIS_TEXT = {
  per100g: {
    nutritionTitle: 'Nutrition per 100g',
    servingTitle: 'Serving size (optional)',
    servingHint: 'E.g. “scoop” and 30g, so you can log “1 scoop” as well as grams.',
    labelPlaceholder: 'scoop',
  },
  perServing: {
    nutritionTitle: 'Nutrition per serving',
    servingTitle: 'What is one serving?',
    servingHint: 'Weight is optional. Add it if you also want to log this food in grams.',
    labelPlaceholder: 'egg',
  },
};

export default {
  title: 'Food',
  tab: 'foods',

  async render(root, { params, query }) {
    const id = params[0] && params[0] !== 'new' ? params[0] : null;
    const existing = id ? await getFood(id) : null;

    if (id && !existing) {
      render(root, html`${subHeader('Food not found')}<div class="empty"><p>This food no longer exists.</p></div>`);
      return;
    }

    const food = existing ?? { basis: 'per100g', name: query.name ?? '' };
    const valueOf = (key) => food[key] ?? '';
    const isPer100g = food.basis !== 'perServing';

    render(root, html`
      ${subHeader(existing ? 'Edit food' : 'New food')}
      <form id="food-form" novalidate>
        <section class="card">
          ${field({ name: 'name', label: 'Name', value: valueOf('name'), inputmode: 'text', placeholder: 'e.g. Porridge oats' })}
          ${field({ name: 'brand', label: 'Brand (optional)', value: valueOf('brand'), inputmode: 'text' })}
          <label class="switch">
            <input type="checkbox" name="isFavourite" ${food.isFavourite && html`checked`}>
            <span class="switch__track" aria-hidden="true"></span>
            <span>★ Favourite <span class="muted small">(shown near the top when adding food)</span></span>
          </label>
        </section>

        <section class="card">
          <div class="segmented" role="radiogroup" aria-label="Values on the label are">
            <label><input type="radio" name="basis" value="per100g" ${isPer100g && html`checked`}><span>Per 100g</span></label>
            <label><input type="radio" name="basis" value="perServing" ${!isPer100g && html`checked`}><span>Per serving / item</span></label>
          </div>
          <h2 class="card__title" data-text="nutritionTitle"></h2>
          <div class="grid-2">
            ${field({ name: 'kcal', label: 'Calories', value: valueOf('kcal'), suffix: 'kcal' })}
            ${field({ name: 'protein', label: 'Protein', value: valueOf('protein'), suffix: 'g' })}
            ${field({ name: 'carbs', label: 'Carbs', value: valueOf('carbs'), suffix: 'g' })}
            ${field({ name: 'fat', label: 'Fat', value: valueOf('fat'), suffix: 'g' })}
          </div>
          <p class="notice" data-kcal-check hidden></p>
        </section>

        <section class="card">
          <h2 class="card__title" data-text="servingTitle"></h2>
          <div class="grid-2">
            ${field({ name: 'servingLabel', label: 'Name', value: valueOf('servingLabel'), inputmode: 'text' })}
            ${field({ name: 'servingGrams', label: 'Weight', value: valueOf('servingGrams'), suffix: 'g' })}
          </div>
          <p class="form-note" data-text="servingHint"></p>
        </section>

        <section class="card">
          <h2 class="card__title">Check the maths</h2>
          <div class="calc">
            <div class="input-wrap calc__amount">
              <input name="previewAmount" inputmode="decimal" aria-label="Amount" autocomplete="off">
            </div>
            <div class="input-wrap calc__unit">
              <select name="previewUnit" aria-label="Unit"></select>
            </div>
          </div>
          <p class="calc__result" data-preview aria-live="polite"></p>
        </section>

        <button class="btn btn--primary btn--block" type="submit">Save food</button>
        ${existing && html`<button class="btn btn--danger btn--block mt" type="button" data-action="delete">Delete food</button>`}
      </form>
    `);

    const form = root.querySelector('#food-form');
    const readInput = () => Object.fromEntries(new FormData(form));

    /** Updates everything that depends on the current input, without touching what's being typed. */
    const update = ({ resetPreview = false } = {}) => {
      const input = readInput();
      const { food: draft } = validateFood(input);

      // Basis-dependent wording.
      const text = BASIS_TEXT[draft.basis];
      for (const el of form.querySelectorAll('[data-text]')) el.textContent = text[el.dataset.text];
      form.servingLabel.placeholder = text.labelPlaceholder;

      // Units the preview can use depend on basis + serving weight.
      const units = unitsFor(draft);
      const select = form.previewUnit;
      const previousUnit = select.value;
      render(select, units.map((unit) => html`<option value="${unit}">${unitLabel(draft, unit)}</option>`));
      if (!resetPreview && units.includes(previousUnit)) select.value = previousUnit;
      if (resetPreview || !units.includes(previousUnit)) {
        const portion = defaultPortion(draft);
        select.value = portion.unit;
        form.previewAmount.value = portion.amount;
      }

      // Live calculation.
      const amount = parseNumber(form.previewAmount.value);
      const preview = form.querySelector('[data-preview]');
      if (form.kcal.value.trim() === '' || !Number.isFinite(draft.kcal) || !(amount >= 0)) {
        preview.textContent = 'Enter the calories and an amount to see the maths.';
      } else {
        render(preview, html`
          <span class="calc__portion">${portionLabel(draft, amount, select.value)} =</span>
          ${macroLine(macrosFor(draft, amount, select.value))}`);
      }

      // Gentle sanity check: macros should roughly account for the calories.
      const check = form.querySelector('[data-kcal-check]');
      const fromMacros = kcalFromMacros(draft);
      const mismatch = draft.kcal > 0 && fromMacros > 0 && Math.abs(draft.kcal - fromMacros) > Math.max(25, draft.kcal * 0.2);
      check.hidden = !mismatch;
      if (mismatch) check.textContent = `These macros add up to about ${fmtInt(fromMacros)} kcal. Worth double-checking the label.`;
    };

    update({ resetPreview: true });
    form.addEventListener('input', (event) => update({ resetPreview: event.target.name === 'basis' }));
    form.addEventListener('change', (event) => {
      if (event.target.name === 'basis') update({ resetPreview: true });
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { valid, errors, food: fields } = validateFood(readInput());
      showFieldErrors(form, errors);
      if (!valid) return;
      const saved = await saveFood({ ...fields, isFavourite: form.isFavourite.checked }, existing?.id);
      toast(`Saved ${saved.name}`);
      goBack('foods');
    });

    form.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
      await archiveFood(existing.id);
      toast(`Deleted ${existing.name}`, {
        actionLabel: 'Undo',
        duration: 5000,
        onAction: async () => {
          await restoreFood(existing.id);
          navigate(`food/${encodeURIComponent(existing.id)}`);
        },
      });
      goBack('foods');
    });
  },
};

const subHeader = (title) => backHeader(title, 'foods');
