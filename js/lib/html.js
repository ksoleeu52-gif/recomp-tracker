/**
 * Tiny, dependency-free HTML templating with automatic escaping.
 *
 *   html`<p>${food.name}</p>`
 *
 * Every interpolated value is HTML-escaped unless it is itself the result of an
 * html`` call. That makes it safe to render text from users or from the
 * Open Food Facts API: a product named "<img onerror=…>" shows up as text, not markup.
 *
 * Arrays are joined (handy for lists); null, undefined, true and false render
 * nothing (handy for `${condition && html`…`}`).
 */
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/** Marker class for markup that is already safe. */
class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

function toMarkup(value) {
  if (value == null || typeof value === 'boolean') return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toMarkup).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((value, i) => {
    out += toMarkup(value) + strings[i + 1];
  });
  return new SafeHtml(out);
}

/** Renders a template into an element, replacing its contents. */
export function render(element, template) {
  element.innerHTML = toMarkup(template);
}
