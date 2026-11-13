/**
 * Storage durability helpers.
 *
 * By default browsers treat site data as "best effort" and may delete it when the
 * device is low on space (Safari can also clear data for sites not used in a while).
 * Asking for persistent storage, plus installing to the home screen, plus regular
 * JSON backups, is the defence-in-depth against losing your log.
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** @returns {Promise<{ supported: boolean, persisted: boolean, usage?: number, quota?: number }>} */
export async function storageStatus() {
  if (!navigator.storage?.persisted) return { supported: false, persisted: false };
  const [persisted, estimate] = await Promise.all([
    navigator.storage.persisted(),
    navigator.storage.estimate?.() ?? Promise.resolve({}),
  ]);
  return { supported: true, persisted, usage: estimate.usage, quota: estimate.quota };
}
