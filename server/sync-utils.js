function isUsefulThumbnail(thumbnail) {
    return Boolean(
        thumbnail &&
        typeof thumbnail === 'string' &&
        !thumbnail.startsWith('data:') &&
        !thumbnail.includes('ui-avatars.com')
    );
}

function mergeIncomingSubscriptions(incomingSubscriptions = [], existingSubscriptions = [], redirects = {}) {
    const existingById = new Map(existingSubscriptions.map(sub => [sub.id, sub]));
    const seenIds = new Set();
    const merged = [];

    for (const incomingSub of incomingSubscriptions) {
        const finalId = redirects[incomingSub.id] || incomingSub.id;
        if (seenIds.has(finalId)) continue;

        const existingSub = existingById.get(finalId) || existingById.get(incomingSub.id);
        const incomingThumbnail = incomingSub.thumbnail;
        const existingThumbnail = existingSub?.thumbnail;

        merged.push({
            ...incomingSub,
            id: finalId,
            title: incomingSub.title || existingSub?.title || finalId,
            description: incomingSub.description || existingSub?.description || '',
            thumbnail: isUsefulThumbnail(incomingThumbnail)
                ? incomingThumbnail
                : existingThumbnail || incomingThumbnail || '',
        });
        seenIds.add(finalId);
    }

    return merged;
}

module.exports = {
    isUsefulThumbnail,
    mergeIncomingSubscriptions,
};
