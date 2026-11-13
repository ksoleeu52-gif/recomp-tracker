/**
 * A deliberately tiny test harness (no npm needed): open tests/index.html in a browser.
 */
const tests = [];

export function test(name, fn) {
  tests.push({ name, fn });
}

export function assertEqual(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message ? `${message}: ` : ''}expected ${e}, got ${a}`);
}

export function assertClose(actual, expected, tolerance = 1e-9, message = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`${message ? `${message}: ` : ''}expected ≈${expected}, got ${actual}`);
  }
}

export function assert(condition, message = 'assertion failed') {
  if (!condition) throw new Error(message);
}

export async function runAll() {
  const list = document.getElementById('results');
  let failed = 0;
  for (const { name, fn } of tests) {
    const li = document.createElement('li');
    try {
      await fn();
      li.className = 'pass';
      li.textContent = `PASS ${name}`;
    } catch (error) {
      failed += 1;
      li.className = 'fail';
      li.textContent = `FAIL ${name} — ${error.message}`;
    }
    list.append(li);
  }
  const summary = `${tests.length - failed}/${tests.length} passed`;
  document.getElementById('summary').textContent = failed ? `FAILED: ${summary}` : `ALL PASSED: ${summary}`;
  document.title = failed ? 'FAIL' : 'PASS';
}
