/**
 * Test entry point: import every *.test.js file here, then run.
 */
import './setup.js'; // must be first: switches to the throwaway test database
import { runAll } from './harness.js';
import './format.test.js';
import './dates.test.js';
import './html.test.js';
import './nutrition.test.js';
import './settings.test.js';
import './foods.test.js';
import './log.test.js';
import './meals.test.js';
import './fast-entry.test.js';
import './barcode.test.js';
import './backup.test.js';
import './sw.test.js';

runAll();
