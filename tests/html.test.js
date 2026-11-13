import { test, assertEqual } from './harness.js';
import { html, escapeHtml } from '../js/lib/html.js';

test('html escapes interpolated text', () => {
  const name = '<img src=x onerror="alert(1)">';
  assertEqual(String(html`<p>${name}</p>`), '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>');
});

test('html does not double-escape nested templates', () => {
  const inner = html`<b>${'Tom & Jerry'}</b>`;
  assertEqual(String(html`<p>${inner}</p>`), '<p><b>Tom &amp; Jerry</b></p>');
});

test('html joins arrays and skips null/false', () => {
  const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
  assertEqual(String(html`<ul>${items}${null}${false}</ul>`), '<ul><li>a</li><li>b</li></ul>');
});

test('html renders zero', () => {
  assertEqual(String(html`${0}`), '0');
});

test('escapeHtml escapes quotes for attributes', () => {
  assertEqual(escapeHtml(`"O'Brien"`), '&quot;O&#39;Brien&quot;');
});
