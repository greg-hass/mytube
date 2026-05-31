const path = require('path');
const { createSqliteStore } = require('./sqlite-store');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DATA_FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT_VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const DEFAULT_DATABASE_FILE = path.join(DATA_DIR, 'youtube-subscriptions.sqlite');

const DEFAULT_DATA = { subscriptions: [], settings: {}, watchedVideos: [], redirects: {} };
const DEFAULT_VIDEO_CACHE = { videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0, channelRefreshes: {} };

const store = createSqliteStore({
    databaseFile: process.env.SQLITE_DATABASE_FILE || DEFAULT_DATABASE_FILE,
    legacyDataFile: DEFAULT_DATA_FILE,
    legacyVideosFile: DEFAULT_VIDEOS_FILE,
});
let initPromise = null;

function init() {
    if (!initPromise) {
        initPromise = store.init({ defaultData: DEFAULT_DATA, defaultVideoCache: DEFAULT_VIDEO_CACHE });
    }
    return initPromise;
}

async function withStore(method, ...args) {
    await init();
    return store[method](...args);
}

module.exports = {
    DATA_DIR,
    DEFAULT_DATA,
    DEFAULT_DATA_FILE,
    DEFAULT_DATABASE_FILE,
    DEFAULT_VIDEO_CACHE,
    DEFAULT_VIDEOS_FILE,
    init,
    readData: (...args) => withStore('readData', ...args),
    readVideoCache: (...args) => withStore('readVideoCache', ...args),
    updateData: (...args) => withStore('updateData', ...args),
    updateSubscriptionField: (...args) => withStore('updateSubscriptionField', ...args),
    writeData: (...args) => withStore('writeData', ...args),
    writeVideoCache: (...args) => withStore('writeVideoCache', ...args),
    close: () => store.close(),
};
