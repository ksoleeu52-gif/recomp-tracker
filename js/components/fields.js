/**
 * Form field building blocks shared by every form in the app.
 *
 * Numbers use type="text" + inputmode rather than type="number": number inputs
 * reject EU decimal commas on some phones and have awkward spinner/scroll behaviour.
 * inputmode still brings up the numeric keypad.
 */
import { html } from '../lib/html.js';

/**
 * @param {object} o
 * @param {string} o.name
 * @param {string} o.label
 * @param {string|number} [o.value]
 * @param {string} [o.suffix]     unit shown inside the field, e.g. "kcal"
 * @param {'decimal'|'numeric'|'text'} [o.inputmode]
 * @param {string} [o.hint]
 * @param {string} [o.placeholder]
 */
export function field({ name, label, value = '', suffix = '', inputmode = 'decimal', hint = '', placeholder = '', type = 'text', autocomplete = 'off' }) {
  const id = `f-${name}`;
  return html`
    <div class="field">
      <label class="field__label" for="${id}">${label}</label>
      <div class="input-wrap">
        <input id="${id}" name="${name}" type="${type}" inputmode="${inputmode}" value="${value}"
          placeholder="${placeholder}" autocomplete="${autocomplete}" enterkeyhint="done"
          aria-describedby="${id}-error ${hint ? `${id}-hint` : ''}">
        ${suffix && html`<span class="input-wrap__suffix">${suffix}</span>`}
      </div>
      ${hint && html`<p class="field__hint" id="${id}-hint">${hint}</p>`}
      <p class="field__error" id="${id}-error" data-error-for="${name}"></p>
    </div>`;
}

/** Shows/clears validation messages produced by a validate*() function. */
export function showFieldErrors(form, errors) {
  for (const input of form.querySelectorAll('input[name], select[name], textarea[name]')) {
    const message = errors[input.name] ?? '';
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
    input.closest('.input-wrap')?.classList.toggle('is-invalid', Boolean(message));
    const errorEl = form.querySelector(`[data-error-for="${input.name}"]`);
    if (errorEl) errorEl.textContent = message;
  }
  // Move focus to the first problem so it's obvious what to fix.
  form.querySelector('[aria-invalid="true"]')?.focus();
}
