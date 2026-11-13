/**
 * Saving and opening files from a web app.
 *
 * Saving: on phones we use the share sheet (Web Share API) because downloads from
 * an installed PWA are unreliable on iOS. The share sheet lets you "Save to Files",
 * Google Drive, email it to yourself, etc. On desktops we trigger a normal download.
 */

/**
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function saveFile(text, filename, type = 'application/json') {
  const blob = new Blob([text], { type });
  const isPhone = window.matchMedia?.('(pointer: coarse)').matches;

  if (isPhone && typeof File === 'function') {
    const file = new File([blob], filename, { type });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (error) {
        if (error.name === 'AbortError') return 'cancelled'; // user closed the share sheet
        // Any other share failure: fall back to a download below.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Opens the system file picker and resolves with the chosen file's text (or null if cancelled). */
export function pickTextFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.addEventListener('change', async () => resolve(input.files[0] ? await input.files[0].text() : null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
