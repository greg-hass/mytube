const path = require('path');
const fs = require('fs');
const { createSqliteStore } = require('./sqlite-store');

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_DATA_FILE = path.join(DATA_DIR, 'db.json');
const DEFAULT_VIDEOS_FILE = path.join(DATA_DIR, 'videos.json');
const DEFAULT_DATABASE_FILE = path.join(DATA_DIR, 'mytube.sqlite');
const LEGACY_DATABASE_FILE = path.join(DATA_DIR, 'youtube-subscriptions.sqlite');

function resolveDatabaseFile({ preferLegacy = false } = {}) {
    const configuredDatabaseFile = process.env.SQLITE_DATABASE_FILE;
    if (configuredDatabaseFile) return configuredDatabaseFile;

    if (!preferLegacy) return DEFAULT_DATABASE_FILE;

    if (fs.existsSync(DEFAULT_DATABASE_FILE)) return DEFAULT_DATABASE_FILE;
    if (fs.existsSync(LEGACY_DATABASE_FILE)) return LEGACY_DATABASE_FILE;

    return DEFAULT_DATABASE_FILE;
}

const DEFAULT_DATA = { subscriptions: [], settings: {}, watchedVideos: [], redirects: {} };
const DEFAULT_VIDEO_CACHE = { videos: [], lastUpdated: null, totalChannels: 0, totalVideos: 0, channelRefreshes: {} };

const store = createSqliteStore({
    databaseFile: resolveDatabaseFile(),
    legacyDatabaseFile: LEGACY_DATABASE_FILE,
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

function getCurrentRevision() {
    return store.getRevision();
}

module.exports = {
    DATA_DIR,
    DEFAULT_DATA,
    DEFAULT_DATA_FILE,
    DEFAULT_DATABASE_FILE,
    DEFAULT_VIDEO_CACHE,
    DEFAULT_VIDEOS_FILE,
    LEGACY_DATABASE_FILE,
    getCurrentRevision,
    init,
    readData: (...args) => withStore('readData', ...args),
    readVideoCache: (...args) => withStore('readVideoCache', ...args),
    updateData: (...args) => withStore('updateData', ...args),
    updateSubscriptionField: (...args) => withStore('updateSubscriptionField', ...args),
    writeData: (...args) => withStore('writeData', ...args),
    writeVideoCache: (...args) => withStore('writeVideoCache', ...args),
    close: () => store.close(),
    resolveDatabaseFile,
};
