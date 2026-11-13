/**
 * Backup and restore of everything in the database, as one JSON file.
 *
 * All data lives only on this device, so a backup is the only protection against
 * losing a phone or clearing browser data. The file is plain JSON so it is
 * readable, portable, and easy to inspect if something goes wrong.
 *
 * File format (BACKUP_FORMAT 1):
 * {
 *   app: 'recomp', format: 1, exportedAt: ISO date, dbVersion,
 *   data: { settings: [...], foods: [...], meals: [...], logEntries: [...] }
 * }
 * If the format ever changes, bump BACKUP_FORMAT and convert older files in parseBackup().
 */
import { transaction, promisify, getAll, STORES, DB_VERSION } from './idb.js';
import { updateSettings } from './settings.js';
import { BASES } from './foods.js';
import { MEAL_IDS } from './log.js';
import { isDayKey, daysBetween, toDayKey } from '../lib/dates.js';

export const BACKUP_FORMAT = 1;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const DAY_MS = 86_400_000;
export const REMINDER_DAYS = 7;
const SNOOZE_DAYS = 3;

/** Section name in the file -> object store. */
const SECTIONS = {
  settings: STORES.settings,
  foods: STORES.foods,
  meals: STORES.meals,
  logEntries: STORES.log,
};

const isText = (v) => typeof v === 'string' && v.length > 0;
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

/** Minimal sanity checks per record. A damaged file is rejected as a whole. */
const VALIDATORS = {
  settings: (r) => r.key === 'main',
  foods: (r) => isText(r.id) && typeof r.name === 'string' && BASES.includes(r.basis) && isNumber(r.kcal),
  meals: (r) =>
    isText(r.id) && typeof r.name === 'string' && MEAL_IDS.includes(r.mealType) && Array.isArray(r.items) &&
    r.items.every((item) => isText(item.foodId) && isNumber(item.amount)),
  logEntries: (r) => isText(r.id) && isDayKey(r.date) && MEAL_IDS.includes(r.meal) && isNumber(r.kcal) && isNumber(r.protein),
};

// ---------- Export ----------

/** Reads every store into a backup object. */
export async function createBackup(now = new Date()) {
  const names = Object.values(SECTIONS);
  const data = await transaction(names, 'readonly', async (s) => {
    const result = {};
    for (const [section, store] of Object.entries(SECTIONS)) result[section] = await promisify(s[store].getAll());
    return result;
  });
  return { app: 'recomp', format: BACKUP_FORMAT, exportedAt: now.toISOString(), dbVersion: DB_VERSION, data };
}

export const backupFileName = (date = new Date()) => `recomp-backup-${toDayKey(date)}.json`;

/** Records that a backup was saved (resets the weekly reminder). */
export const markBackedUp = (now = Date.now()) => updateSettings({ lastBackupAt: now, backupSnoozedUntil: null });

// ---------- Import ----------

/**
 * Parses and validates a backup file's text. Pure: touches nothing.
 * @returns {{ ok: true, backup: object, summary: object } | { ok: false, error: string }}
 */
export function parseBackup(text) {
  const fail = (error) => ({ ok: false, error });
  if (typeof text !== 'string' || text.length === 0) return fail('The file is empty.');
  if (text.length > MAX_FILE_BYTES) return fail('The file is too large to be a Recomp backup.');

  let backup;
  try {
    backup = JSON.parse(text);
  } catch {
    return fail('This file isn’t a valid backup (it’s not JSON).');
  }
  if (backup?.app !== 'recomp') return fail('This doesn’t look like a Recomp backup.');
  if (!Number.isInteger(backup.format) || backup.format < 1) return fail('This backup file is damaged (unknown format).');
  if (backup.format > BACKUP_FORMAT) return fail('This backup is from a newer version of Recomp. Update the app, then try again.');

  for (const [section, isValid] of Object.entries(VALIDATORS)) {
    const records = backup.data?.[section];
    if (!Array.isArray(records)) return fail(`This backup is damaged: the “${section}” section is missing.`);
    const bad = records.findIndex((record) => !record || typeof record !== 'object' || !isValid(record));
    if (bad !== -1) return fail(`This backup is damaged (record ${bad + 1} in “${section}”), so nothing was imported.`);
  }
  return { ok: true, backup, summary: summarise(backup) };
}

/** Counts shown in the "restore this backup?" preview. */
export function summarise(backup) {
  const { foods, meals, logEntries } = backup.data;
  const dates = [...new Set(logEntries.map((e) => e.date))].sort();
  return {
    exportedAt: backup.exportedAt,
    foods: foods.filter((f) => !f.archived).length,
    meals: meals.length,
    entries: logEntries.length,
    days: dates.length,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  };
}

/**
 * Writes a parsed backup into the database in a single transaction
 * (if anything fails, nothing changes).
 *   'replace': this device becomes exactly the backup.
 *   'merge':   adds records from the backup; where both have the same record, the
 *              more recently updated copy wins. This device's settings are kept.
 */
export async function restoreBackup(backup, { mode }) {
  if (mode !== 'replace' && mode !== 'merge') throw new Error(`Unknown restore mode: ${mode}`);
  const names = Object.values(SECTIONS);

  await transaction(names, 'readwrite', async (s) => {
    for (const [section, storeName] of Object.entries(SECTIONS)) {
      const store = s[storeName];
      const records = backup.data[section];
      if (mode === 'replace') {
        await promisify(store.clear());
        for (const record of records) store.put(record);
        continue;
      }
      if (section === 'settings') continue; // merge keeps this device's targets
      for (const record of records) {
        const key = record.id;
        const current = await promisify(store.get(key));
        const incomingIsNewer = (record.updatedAt ?? record.createdAt ?? 0) >= (current?.updatedAt ?? current?.createdAt ?? 0);
        if (!current || incomingIsNewer) store.put(record);
      }
    }
  });
}

/** True if there's anything worth backing up (used to skip the reminder for brand-new users). */
export async function hasUserData() {
  const [foods, entries] = await Promise.all([getAll(STORES.foods), getAll(STORES.log)]);
  return foods.length > 0 || entries.length > 0;
}

// ---------- Weekly reminder ----------

/**
 * Whether to show the "back up your data" reminder. Pure.
 * Due when there is data and it's been REMINDER_DAYS since the last backup
 * (or since first use, if never backed up), unless snoozed.
 * @returns {{ due: boolean, days: number|null, never: boolean }}
 */
export function backupReminder({ lastBackupAt, firstRunAt, backupSnoozedUntil }, { now = Date.now(), hasData = true } = {}) {
  const never = !lastBackupAt;
  const since = lastBackupAt ?? firstRunAt;
  if (!hasData || !since) return { due: false, days: null, never };
  if (backupSnoozedUntil && now < backupSnoozedUntil) return { due: false, days: null, never };
  const days = Math.floor((now - since) / DAY_MS);
  return { due: days >= REMINDER_DAYS, days, never };
}

/** "Later": hide the reminder for a few days. */
export const snoozeBackupReminder = (now = Date.now()) => updateSettings({ backupSnoozedUntil: now + SNOOZE_DAYS * DAY_MS });

/** Settings-screen text: "Today", "Yesterday", "5 days ago", "Never". */
export function lastBackupLabel(lastBackupAt, now = new Date()) {
  if (!lastBackupAt) return 'Never';
  const days = daysBetween(toDayKey(new Date(lastBackupAt)), toDayKey(now));
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
