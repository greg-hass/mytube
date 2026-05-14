const axios = require('axios');

function applySubscriptionRedirects(subscriptions = [], redirects = {}) {
    const redirectedSubs = [];
    const seenIds = new Set();
    let changed = false;

    for (const sub of subscriptions) {
        const finalId = redirects[sub.id] || sub.id;

        if (finalId !== sub.id) {
            console.log(`🔀 Applying redirect: ${sub.id} -> ${finalId}`);
            changed = true;
        }

        if (!seenIds.has(finalId)) {
            seenIds.add(finalId);
            redirectedSubs.push({
                ...sub,
                id: finalId,
            });
        } else {
            console.log(`  (Skipping duplicate: ${finalId})`);
            changed = true;
        }
    }

    return { subscriptions: redirectedSubs, changed };
}

async function resolveTemporarySubscriptions(subscriptions = [], options = {}) {
    const {
        apiKey,
        redirects = {},
        quotaCap = 100,
        httpClient = axios,
    } = options;
    let resolverQuotaUsed = Number(options.resolverQuotaUsed || 0);

    if (!apiKey || resolverQuotaUsed >= quotaCap) {
        return {
            subscriptions,
            resolverQuotaUsed,
            changed: false,
            redirects,
        };
    }

    let changed = false;
    const resolvedSubs = [];
    const seenIds = new Set();

    for (const sub of subscriptions) {
        if (sub.id.startsWith('handle_') || sub.id.startsWith('custom_')) {
            try {
                if (resolverQuotaUsed >= quotaCap) {
                    console.warn('⚠️ API resolver quota cap reached. Remaining unresolved channels will use RSS/public fallbacks.');
                    if (!seenIds.has(sub.id)) {
                        resolvedSubs.push(sub);
                        seenIds.add(sub.id);
                    }
                    continue;
                }

                let resolveUrl;
                let param;
                if (sub.id.startsWith('handle_')) {
                    param = sub.id.replace('handle_', '');
                    if (!param.startsWith('@')) param = '@' + param;
                    resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forHandle=${encodeURIComponent(param)}&key=${apiKey}`;
                } else {
                    param = sub.id.replace('custom_', '');
                    resolveUrl = `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&forUsername=${encodeURIComponent(param)}&key=${apiKey}`;
                }

                const res = await httpClient.get(resolveUrl);
                resolverQuotaUsed += 1;

                if (res.data.items?.[0]) {
                    const realId = res.data.items[0].id;
                    const realTitle = res.data.items[0].snippet.title;
                    const realThumb = res.data.items[0].snippet.thumbnails.high?.url;

                    console.log(`✨ Resolved ${sub.id} -> ${realId} (${realTitle})`);

                    redirects[sub.id] = realId;

                    if (!seenIds.has(realId)) {
                        resolvedSubs.push({
                            ...sub,
                            id: realId,
                            title: realTitle || sub.title,
                            thumbnail: realThumb || sub.thumbnail
                        });
                        seenIds.add(realId);
                    } else {
                        console.log(`  (Merged with existing subscription)`);
                    }
                    changed = true;
                    continue;
                }
            } catch (err) {
                console.error(`Failed to resolve handle ${sub.id}:`, err.message);
            }
        }

        if (!seenIds.has(sub.id)) {
            resolvedSubs.push(sub);
            seenIds.add(sub.id);
        }
    }

    return {
        subscriptions: resolvedSubs,
        resolverQuotaUsed,
        changed,
        redirects,
    };
}

module.exports = {
    applySubscriptionRedirects,
    resolveTemporarySubscriptions,
};
