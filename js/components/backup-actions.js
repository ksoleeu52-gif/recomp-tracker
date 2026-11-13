/**
 * The two backup actions, shared by Settings and the Today reminder:
 *   exportBackupNow()   save everything to a JSON file
 *   importBackupFlow()  pick a file, preview what's in it, then replace or merge (with Undo)
 */
import { html } from '../lib/html.js';
import { fmtInt } from '../lib/format.js';
import { fromDayKey } from '../lib/dates.js';
import { saveFile, pickTextFile } from '../lib/files.js';
import { createBackup, backupFileName, markBackedUp, parseBackup, restoreBackup } from '../db/backup.js';
import { openSheet } from './sheet.js';
import { toast } from './toast.js';

/** "3 Oct 2026 – 13 Nov 2026", or one date if they're the same day. */
function dateRange(first, last) {
  const short = (key) => fromDayKey(key).toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
  return first === last ? short(first) : `${short(first)} – ${short(last)}`;
}

/** @returns {Promise<boolean>} true if a backup was saved */
export async function exportBackupNow() {
  const backup = await createBackup();
  const result = await saveFile(JSON.stringify(backup), backupFileName());
  if (result === 'cancelled') return false;
  await markBackedUp();
  toast(result === 'shared' ? 'Backup saved' : 'Backup downloaded. Keep it somewhere safe, like Google Drive.', { duration: 4000 });
  return true;
}

/**
 * @param {() => void} onRestored  called after data changes (e.g. to re-render the screen)
 */
export async function importBackupFlow(onRestored) {
  const text = await pickTextFile();
  if (text == null) return;

  const parsed = parseBackup(text);
  if (!parsed.ok) {
    toast(parsed.error, { duration: 6000 });
    return;
  }

  const s = parsed.summary;
  const exported = new Date(s.exportedAt);
  const dialog = openSheet(html`
    <h2 class="sheet__title">Restore this backup?</h2>
    <p class="sheet__subtitle">Saved ${Number.isNaN(exported.getTime()) ? 'on an unknown date' : `${exported.toLocaleDateString('en-IE', { day: 'numeric', month: 'long', year: 'numeric' })}`}</p>
    <ul class="preview-items">
      <li><span>Foods</span><span>${fmtInt(s.foods)}</span></li>
      <li><span>Saved meals</span><span>${fmtInt(s.meals)}</span></li>
      <li><span>Logged items</span><span>${fmtInt(s.entries)}</span></li>
      <li><span>Days logged</span><span>${fmtInt(s.days)}${s.firstDate && html` <span class="muted small">(${dateRange(s.firstDate, s.lastDate)})</span>`}</span></li>
    </ul>
    <button class="btn btn--primary btn--block" type="button" data-mode="replace">Replace everything on this phone</button>
    <p class="form-note mt">Best for restoring after clearing your browser or moving to a new phone.</p>
    <button class="btn btn--block" type="button" data-mode="merge">Merge with what's here</button>
    <p class="form-note mt">Adds anything missing and keeps the newest version of anything in both. Your targets stay as they are.</p>
  `, { label: 'Restore backup' });

  dialog.addEventListener('click', async (event) => {
    const mode = event.target.closest('[data-mode]')?.dataset.mode;
    if (!mode) return;
    dialog.close();

    // Keep a copy of the current data in memory so the restore can be undone.
    const before = await createBackup();
    try {
      await restoreBackup(parsed.backup, { mode });
    } catch (error) {
      console.error(error);
      toast('Restore failed. Nothing was changed.', { duration: 5000 });
      return;
    }
    onRestored?.();
    toast(mode === 'replace' ? 'Backup restored' : 'Backup merged', {
      actionLabel: 'Undo',
      duration: 8000,
      onAction: async () => {
        await restoreBackup(before, { mode: 'replace' });
        onRestored?.();
        toast('Restore undone');
      },
    });
  });
}
