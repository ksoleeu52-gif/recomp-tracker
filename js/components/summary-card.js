/**
 * The big "what's left today" card at the top of the Today screen.
 * Pure function of (targets, totals) -> markup, so the same card can show any day.
 */
import { html } from '../lib/html.js';
import { fmtInt } from '../lib/format.js';
import { remaining, progress } from '../lib/nutrition.js';
import { progressRing } from './ring.js';

/**
 * @param {{ calorieTarget: number, proteinTarget: number }} targets
 * @param {{ kcal: number, protein: number, carbs: number, fat: number }} totals
 * @param {boolean} isToday  wording: "left today" vs "left" for past days
 */
export function summaryCard({ targets, totals, isToday = true }) {
  const calories = remaining(targets.calorieTarget, totals.kcal);
  const protein = remaining(targets.proteinTarget, totals.protein);
  const proteinHit = protein.over || protein.amount === 0;
  const suffix = isToday ? ' today' : '';
  const kcalPercent = Math.min(progress(totals.kcal, targets.calorieTarget), 1) * 100;

  return html`
    <section class="card summary" aria-label="Daily totals">
      <div class="summary__calories ${calories.over ? 'is-over' : ''}">
        <p class="summary__label">${calories.over ? `Over calorie target${suffix}` : `Calories left${suffix}`}</p>
        <p class="summary__big">
          <span>${fmtInt(calories.amount)}</span>
          <span class="summary__unit">${calories.over ? 'over' : 'kcal'}</span>
        </p>
        <div class="bar" aria-hidden="true"><div class="bar__fill" style="width:${kcalPercent.toFixed(1)}%"></div></div>
        <p class="summary__sub">${fmtInt(totals.kcal)} eaten of ${fmtInt(targets.calorieTarget)} kcal</p>
      </div>

      <div class="summary__protein">
        ${progressRing({
          fraction: progress(totals.protein, targets.proteinTarget),
          label: `Protein ${fmtInt(totals.protein)} of ${fmtInt(targets.proteinTarget)} grams`,
          center: html`
            <span class="ring__value">${fmtInt(totals.protein)}g</span>
            <span class="ring__caption">of ${fmtInt(targets.proteinTarget)}g</span>`,
        })}
        <div>
          <p class="summary__label">${proteinHit ? `Protein target hit` : `Protein left${suffix}`}</p>
          <p class="summary__protein-left">${proteinHit ? `+${fmtInt(protein.amount)}g` : `${fmtInt(protein.amount)}g`}</p>
        </div>
      </div>

      <dl class="summary__macros">
        <div><dt>Eaten</dt><dd>${fmtInt(totals.kcal)} kcal</dd></div>
        <div><dt><i class="dot dot--carbs"></i>Carbs</dt><dd>${fmtInt(totals.carbs)}g</dd></div>
        <div><dt><i class="dot dot--fat"></i>Fat</dt><dd>${fmtInt(totals.fat)}g</dd></div>
      </dl>
    </section>`;
}
