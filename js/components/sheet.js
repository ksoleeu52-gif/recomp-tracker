/**
 * Bottom sheet built on the native <dialog> element, which gives us a backdrop,
 * focus trapping, Esc-to-close and the Android back gesture for free.
 *
 * Content goes inside .sheet__body so a tap on the dialog element itself can only
 * mean the backdrop was tapped (which closes the sheet).
 */
import { html, render } from '../lib/html.js';

/**
 * @param {*} content html`` markup for the sheet body
 * @param {{ onClose?: () => void, label?: string }} options
 * @returns {HTMLDialogElement}
 */
export function openSheet(content, { onClose, label = '' } = {}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'sheet';
  if (label) dialog.setAttribute('aria-label', label);
  render(dialog, html`<div class="sheet__body"><div class="sheet__handle" aria-hidden="true"></div>${content}</div>`);
  document.body.append(dialog);

  // Tap on the backdrop closes the sheet.
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  // iOS Safari doesn't shrink the layout when the keyboard opens, so lift the
  // sheet by the keyboard's height to keep the input and button visible.
  const viewport = window.visualViewport;
  const avoidKeyboard = () => {
    const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    dialog.style.marginBottom = `${keyboard}px`;
  };
  viewport?.addEventListener('resize', avoidKeyboard);
  viewport?.addEventListener('scroll', avoidKeyboard);

  dialog.addEventListener('close', () => {
    viewport?.removeEventListener('resize', avoidKeyboard);
    viewport?.removeEventListener('scroll', avoidKeyboard);
    dialog.remove();
    onClose?.();
  });

  dialog.showModal();
  // showModal() focuses the first input, which pops up the phone keyboard.
  // Focus the sheet itself instead; callers can focus an input explicitly when wanted.
  dialog.tabIndex = -1;
  dialog.focus();
  return dialog;
}

/** Closes any open sheet (the router calls this when the screen changes). */
export function closeAllSheets() {
  for (const dialog of document.querySelectorAll('dialog.sheet[open]')) dialog.close();
}
