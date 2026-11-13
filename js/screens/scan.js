/**
 * Scan a barcode.
 * Routes: #/scan                                 from Foods: add the product to your library
 *         #/scan?meal=lunch&date=YYYY-MM-DD      from Add: add it, then log it straight away
 *
 * Flow: camera (or typed number) -> already in My Foods?  -> use it
 *                                -> else Open Food Facts  -> food editor, pre-filled for review
 * Nothing from Open Food Facts is saved without you seeing an editable preview.
 */
import { html, render } from '../lib/html.js';
import { startScanner } from '../lib/scanner.js';
import { lookupBarcode } from '../lib/off.js';
import { normaliseBarcode, isValidBarcode } from '../lib/barcode.js';
import { handOff } from '../lib/handoff.js';
import { findFoodByBarcode } from '../db/foods.js';
import { MEAL_IDS } from '../db/log.js';
import { backHeader } from '../components/header.js';
import { toast } from '../components/toast.js';
import { goBack } from '../router.js';

const CAMERA_PROBLEMS = {
  unsupported: 'This browser can’t use the camera. Type the barcode number below instead.',
  denied: 'Camera access is blocked. Allow it in your browser settings, or type the number below.',
  'no-camera': 'No camera found. Type the barcode number below instead.',
  'in-use': 'The camera is being used by another app. Close it and try again, or type the number below.',
  failed: 'The camera couldn’t start. Type the barcode number below instead.',
};

export default {
  title: 'Scan',
  tab: (route) => (route.query.meal ? 'today' : 'foods'),

  async render(root, { query, navigate }) {
    const logMode = MEAL_IDS.includes(query.meal);

    render(root, html`
      ${backHeader('Scan a barcode', logMode ? 'today' : 'foods')}
      <div class="scanner" data-state="starting">
        <video class="scanner__video" playsinline muted autoplay></video>
        <div class="scanner__frame" aria-hidden="true"></div>
        <p class="scanner__status" role="status" aria-live="polite">Starting camera…</p>
        <div class="scanner__actions" hidden></div>
      </div>

      <form class="card manual" novalidate>
        <label class="field__label" for="manual-code">Or type the number under the barcode</label>
        <div class="manual__row">
          <div class="input-wrap">
            <input id="manual-code" name="code" inputmode="numeric" autocomplete="off" enterkeyhint="search" placeholder="e.g. 5000159484695">
          </div>
          <button class="btn btn--primary" type="submit">Look up</button>
        </div>
        <p class="field__error" data-error></p>
      </form>

      <p class="small muted center">Product data from <b>Open Food Facts</b>, a free, open database. It can be incomplete, so you'll always review it before saving.</p>
    `);

    const scanner = root.querySelector('.scanner');
    const video = root.querySelector('video');
    const status = root.querySelector('.scanner__status');
    const actions = root.querySelector('.scanner__actions');
    let stopCamera = () => {};
    let busy = false; // a code is being handled
    let left = false; // the user navigated away

    /** state: 'starting' | 'scanning' | 'busy' | 'error'.  buttons: [{ label, onClick, primary }] */
    const setState = (state, message, buttons = []) => {
      scanner.dataset.state = state;
      status.textContent = message;
      actions.hidden = buttons.length === 0;
      render(actions, buttons.map((b) => html`<button class="btn ${b.primary && 'btn--primary'}" type="button">${b.label}</button>`));
      [...actions.children].forEach((el, i) => el.addEventListener('click', buttons[i].onClick));
    };

    const startCamera = async () => {
      setState('starting', 'Starting camera…');
      try {
        stopCamera = await startScanner(video, { onDetect: handleCode });
        // Left the screen while the camera was starting: switch it straight off.
        if (left) return stopCamera();
        if (!busy) setState('scanning', 'Point the camera at the barcode');
      } catch (error) {
        setState('error', CAMERA_PROBLEMS[error.reason] ?? CAMERA_PROBLEMS.failed, [
          { label: 'Try again', onClick: startCamera },
        ]);
      }
    };

    /** Where to go once we know about the product. */
    const openEditor = (code) => {
      const params = new URLSearchParams({ barcode: code });
      if (logMode) params.set('then', 'log');
      // Replace the Scan screen so Back from the editor returns to where scanning started.
      navigate(`food/new?${params}`, { replace: true });
    };

    async function handleCode(code) {
      if (busy) return;
      busy = true;
      stopCamera();
      navigator.vibrate?.(40);
      setState('busy', `Found ${code}. Looking it up…`);

      // 1. Already in My Foods? Use it — no duplicates.
      const existing = await findFoodByBarcode(code);
      if (existing) {
        toast(`${existing.name} is already in your foods`);
        if (logMode) {
          handOff('pick', existing.id); // the Add screen opens the amount sheet for it
          goBack('today');
        } else {
          navigate(`food/${encodeURIComponent(existing.id)}`, { replace: true });
        }
        return;
      }

      // 2. Ask Open Food Facts.
      try {
        handOff(`barcode:${code}`, await lookupBarcode(code));
        openEditor(code);
      } catch {
        busy = false;
        const offline = navigator.onLine === false;
        setState('error', offline
          ? 'You’re offline, so the product can’t be looked up. You can enter it from the label instead.'
          : 'Couldn’t reach Open Food Facts. Check your connection and try again.', [
          { label: 'Try again', primary: true, onClick: () => handleCode(code) },
          { label: 'Enter manually', onClick: () => openEditor(code) },
        ]);
      }
    }

    // Typed barcode.
    const form = root.querySelector('.manual');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const code = normaliseBarcode(form.code.value);
      const error = form.querySelector('[data-error]');
      error.textContent = isValidBarcode(code) ? '' : 'That doesn’t look like a valid barcode. Check the digits.';
      if (!error.textContent) {
        form.code.blur();
        handleCode(code);
      }
    });

    startCamera();

    // Always switch the camera off when leaving this screen.
    return () => {
      left = true;
      stopCamera();
    };
  },
};
