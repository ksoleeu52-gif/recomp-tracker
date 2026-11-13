/**
 * Camera barcode scanner.
 *
 * Uses the browser's built-in BarcodeDetector where it exists (Chrome on Android),
 * otherwise ZXing compiled to WebAssembly (needed on iPhone, where Safari has no
 * BarcodeDetector). ZXing is vendored in /vendor and only loaded when first needed,
 * so it costs nothing until you scan.
 */
import { normaliseBarcode } from './barcode.js';

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const ZXING_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE'];
const SCAN_INTERVAL_MS = 120;
const MAX_FRAME_WIDTH = 960; // downscale big camera frames: faster, and plenty for a barcode

/** Error with a `reason` the UI can turn into a friendly message. */
export class ScannerError extends Error {
  constructor(reason, cause) {
    super(reason);
    this.reason = reason; // 'unsupported' | 'denied' | 'no-camera' | 'in-use' | 'failed'
    this.cause = cause;
  }
}

let detectorPromise = null;

/** Picks the best available decoder once and reuses it. Exported for tests. */
export function getDetector() {
  detectorPromise ??= createDetector();
  return detectorPromise;
}

async function createDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length) {
        const detector = new window.BarcodeDetector({ formats });
        return { name: 'native', detect: async (source) => (await detector.detect(source)).map((b) => b.rawValue) };
      }
    } catch {
      // fall through to ZXing
    }
  }

  const zxing = await import('../../vendor/zxing-wasm/reader/index.js');
  const wasmUrl = new URL('../../vendor/zxing-wasm/zxing_reader.wasm', import.meta.url).href;
  zxing.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return {
    name: 'zxing',
    /** @param {HTMLVideoElement|HTMLImageElement|HTMLCanvasElement} source */
    detect: async (source) => {
      const width = source.videoWidth || source.naturalWidth || source.width;
      const height = source.videoHeight || source.naturalHeight || source.height;
      if (!width || !height) return [];
      const scale = Math.min(1, MAX_FRAME_WIDTH / width);
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const results = await zxing.readBarcodes(image, { formats: ZXING_FORMATS, tryHarder: true, maxNumberOfSymbols: 1 });
      return results.filter((r) => r.isValid).map((r) => r.text);
    },
  };
}

/**
 * Starts the rear camera in `video` and calls onDetect(code) once with the first
 * barcode found. The camera is switched off as soon as a code is found.
 * @returns {Promise<() => void>} stop function (safe to call more than once)
 * @throws {ScannerError}
 */
export async function startScanner(video, { onDetect }) {
  if (!navigator.mediaDevices?.getUserMedia) throw new ScannerError('unsupported');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  } catch (error) {
    const reason = { NotAllowedError: 'denied', SecurityError: 'denied', NotFoundError: 'no-camera', OverconstrainedError: 'no-camera', NotReadableError: 'in-use' }[error.name];
    throw new ScannerError(reason ?? 'failed', error);
  }

  let stopped = false;
  let timer = null;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
  };

  try {
    video.srcObject = stream;
    video.muted = true;
    video.setAttribute('playsinline', ''); // iOS: play inline instead of going full screen
    await video.play();
    const detector = await getDetector();

    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= 2) {
        try {
          const code = (await detector.detect(video)).map(normaliseBarcode).find((c) => c.length >= 8);
          if (code && !stopped) {
            stop();
            onDetect(code);
            return;
          }
        } catch (error) {
          console.warn('Barcode detection failed for a frame:', error);
        }
      }
      timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };
    tick();
  } catch (error) {
    stop();
    throw error instanceof ScannerError ? error : new ScannerError('failed', error);
  }
  return stop;
}
