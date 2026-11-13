/**
 * Circular progress ring (SVG). The arc length is driven by stroke-dashoffset,
 * which also lets CSS animate it smoothly when the value changes.
 */
import { html } from '../lib/html.js';

/**
 * @param {object} opts
 * @param {number} opts.fraction  0..1 (values above 1 draw a full ring)
 * @param {number} [opts.size]    diameter in px
 * @param {number} [opts.stroke]  ring thickness in px
 * @param {string} [opts.color]   CSS colour of the filled arc
 * @param {*}      [opts.center]  html`` content shown in the middle
 * @param {string} [opts.label]   accessible description
 */
export function progressRing({ fraction, size = 112, stroke = 11, color = 'var(--protein)', center = '', label = '' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(fraction, 0), 1);
  const offset = circumference * (1 - clamped);
  const c = size / 2;

  return html`
    <div class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${label}">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
        <circle class="ring__track" cx="${c}" cy="${c}" r="${radius}" stroke-width="${stroke}" />
        <circle class="ring__arc" cx="${c}" cy="${c}" r="${radius}" stroke-width="${stroke}"
          stroke="${color}" stroke-linecap="round"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
          transform="rotate(-90 ${c} ${c})" opacity="${clamped > 0 ? 1 : 0}" />
      </svg>
      <div class="ring__center">${center}</div>
    </div>`;
}
