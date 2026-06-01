/**
 * Format `now` as M/D/YYYY in the given IANA timezone.
 *
 * @param {string} [timeZone='America/Los_Angeles'] IANA timezone identifier.
 * @param {Date} [now=new Date()] The instant to format.
 * @returns {string} The formatted date in en-US M/D/YYYY form.
 */
export function getCurrentDateInTimezone(timeZone = 'America/Los_Angeles', now = new Date()) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).format(now);
}
