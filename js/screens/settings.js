/**
 * Settings: daily calorie and protein targets, plus app/storage info.
 */
import { html, render } from '../lib/html.js';
import { getSettings, updateSettings, validateTargets } from '../db/settings.js';
import { storageStatus } from '../db/storage.js';
import { field, showFieldErrors } from '../components/fields.js';
import { toast } from '../components/toast.js';
import { APP_VERSION } from '../config.js';

export default {
  title: 'Settings',

  async render(root) {
    const [settings, storage] = await Promise.all([getSettings(), storageStatus()]);

    render(root, html`
      <header class="view-header"><h1 class="view-title">Settings</h1></header>

      <form class="card" id="targets-form" novalidate>
        <h2 class="card__title">Daily targets</h2>
        ${field({ name: 'calorieTarget', label: 'Calories', value: settings.calorieTarget, suffix: 'kcal', inputmode: 'numeric' })}
        ${field({ name: 'proteinTarget', label: 'Protein', value: settings.proteinTarget, suffix: 'g', inputmode: 'numeric' })}
        <p class="form-note">Carbs and fat are tracked and shown, but have no targets.</p>
        <button class="btn btn--primary btn--block" type="submit">Save targets</button>
      </form>

      <section class="card">
        <h2 class="card__title">About</h2>
        <dl class="kv">
          <div><dt>Version</dt><dd>${APP_VERSION}</dd></div>
          <div><dt>Data storage</dt><dd>On this device only</dd></div>
          <div>
            <dt>Protected from auto-clear</dt>
            <dd>${!storage.supported ? 'Not supported' : storage.persisted ? 'Yes' : 'Not yet'}</dd>
          </div>
        </dl>
      </section>
    `);

    const form = root.querySelector('#targets-form');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { valid, errors, values } = validateTargets({
        calorieTarget: form.calorieTarget.value,
        proteinTarget: form.proteinTarget.value,
      });
      showFieldErrors(form, errors);
      if (!valid) return;

      await updateSettings(values);
      // Normalise what's shown, e.g. "2,400" -> "2400".
      form.calorieTarget.value = values.calorieTarget;
      form.proteinTarget.value = values.proteinTarget;
      document.activeElement?.blur(); // dismiss the phone keyboard
      toast('Targets saved');
    });
  },
};
