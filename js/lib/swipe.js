/**
 * Detects a deliberate horizontal swipe on an element (used to change day on Today).
 *
 * To avoid fighting with vertical scrolling, a swipe only counts when it is
 * mostly horizontal, long enough and quick. Swipes that start on form controls
 * or inside an open sheet are ignored, and so are swipes from the very edge of
 * the screen, which belong to the phone's own back gesture (iOS and Android).
 *
 * @param {HTMLElement} element
 * @param {{ onLeft?: () => void, onRight?: () => void }} handlers
 *        onLeft = finger moved right-to-left (usually "next")
 * @returns {() => void} removes the listeners
 */
export function onSwipe(element, { onLeft, onRight }) {
  const MIN_DISTANCE = 70; // px
  const MAX_DURATION = 600; // ms
  const EDGE = 24; // px reserved for the system back gesture
  let start = null;

  const handleStart = (event) => {
    const touch = event.touches[0];
    const fromEdge = touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE;
    if (event.touches.length !== 1 || fromEdge || event.target.closest('input, select, textarea, dialog')) {
      start = null;
      return;
    }
    start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleEnd = (event) => {
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const quick = Date.now() - start.time < MAX_DURATION;
    start = null;
    if (!quick || Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) onLeft?.();
    else onRight?.();
  };

  element.addEventListener('touchstart', handleStart, { passive: true });
  element.addEventListener('touchend', handleEnd, { passive: true });
  return () => {
    element.removeEventListener('touchstart', handleStart);
    element.removeEventListener('touchend', handleEnd);
  };
}
