/**
 * Runs before any test: points the app at a fresh throwaway database
 * so tests never touch your real data.
 */
import { useDatabase, promisify } from '../js/db/idb.js';

const TEST_DB = 'recomp-test';
await promisify(indexedDB.deleteDatabase(TEST_DB));
useDatabase(TEST_DB);
