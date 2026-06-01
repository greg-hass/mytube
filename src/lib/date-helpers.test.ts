import { describe, expect, it } from 'vitest';
import { getCurrentDateInTimezone } from './date-helpers';

describe('getCurrentDateInTimezone', () => {
    it('returns the calendar date in the given timezone for a fixed instant', () => {
        const instant = new Date('2026-05-22T05:30:00.000Z'); // 22:30 PT the previous day
        const pacific = getCurrentDateInTimezone('America/Los_Angeles', instant);
        const utc = getCurrentDateInTimezone('UTC', instant);

        expect(pacific).toBe('5/21/2026');
        expect(utc).toBe('5/22/2026');
    });

    it('defaults to America/Los_Angeles when no timezone is supplied', () => {
        const instant = new Date('2026-01-01T12:00:00.000Z'); // 04:00 PT on 2026-01-01
        expect(getCurrentDateInTimezone(undefined, instant)).toBe('1/1/2026');
    });

    it('produces identical output for the same instant across calls', () => {
        const instant = new Date('2026-12-31T23:59:59.000Z');
        expect(getCurrentDateInTimezone('UTC', instant)).toBe(getCurrentDateInTimezone('UTC', instant));
    });
});
