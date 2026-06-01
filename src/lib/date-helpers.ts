import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// The canonical implementation lives in src/lib/date-helpers.js so the
// browser bundle and the server share a single source of truth.
const { getCurrentDateInTimezone } = require('../src/lib/date-helpers.js');

export function getCurrentDateInTimezone(
    timeZone: string = 'America/Los_Angeles',
    now: Date = new Date()
): string {
    return getCurrentDateInTimezone(timeZone, now);
}
