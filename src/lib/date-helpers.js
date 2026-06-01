export function getCurrentDateInTimezone(timeZone = 'America/Los_Angeles', now = new Date()) {
    return new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    }).format(now);
}
