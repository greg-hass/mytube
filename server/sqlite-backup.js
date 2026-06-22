const fs = require('fs').promises;
const path = require('path');
const Database = require('better-sqlite3');
const { resolveDatabaseFile } = require('./app-store');

const BUSY_AGGREGATOR_STATES = new Set(['running', 'queued']);
const DEFAULT_AGGREGATOR_STATUS_URL = `http://127.0.0.1:${process.env.PORT || 3001}/api/videos/status`;
const DEFAULT_AGGREGATOR_WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const DEFAULT_AGGREGATOR_POLL_INTERVAL_MS = 1000;

function makeTimestamp() {
    return new Date().toISOString().replace(/:/g, '-');
}

function getAggregatorStatusUrl() {
    if (process.env.AGGREGATOR_STATUS_URL) {
        return process.env.AGGREGATOR_STATUS_URL;
    }
    return DEFAULT_AGGREGATOR_STATUS_URL;
}

async function fetchAggregatorStatus({ statusUrl, fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
    if (!statusUrl) {
        throw new Error('aggregator statusUrl is required');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetchImpl(statusUrl, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`Aggregator status request failed: ${response.status}`);
        }
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}

async function waitForAggregatorIdle({
    statusUrl = getAggregatorStatusUrl(),
    timeoutMs = DEFAULT_AGGREGATOR_WAIT_TIMEOUT_MS,
    pollMs = DEFAULT_AGGREGATOR_POLL_INTERVAL_MS,
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) {
    const deadline = Date.now() + timeoutMs;
    let lastState = null;
    let didWait = false;

    while (Date.now() <= deadline) {
        let status;
        try {
            status = await fetchAggregatorStatus({ statusUrl, fetchImpl });
        } catch (error) {
            // The server may be offline (CLI run from cron without the app).
            // Treat that as "idle" so the backup proceeds; the database
            // cannot be mutated by a process that is not running.
            console.warn(`Skipping aggregator coordination (${error.message || error}); proceeding with backup.`);
            return { waited: false, state: 'unreachable' };
        }

        const state = status?.state || 'idle';
        lastState = state;

        if (!BUSY_AGGREGATOR_STATES.has(state)) {
            return { waited: didWait, state };
        }

        didWait = true;
        await sleep(pollMs);
    }

    throw new Error(
        `Aggregator still ${lastState} after ${Math.round(timeoutMs / 1000)}s; refusing to back up while feeds are being refreshed.`
    );
}

async function validateSqliteDatabase(databaseFile) {
    const db = new Database(databaseFile, { fileMustExist: true, readonly: true });

    try {
        const integrity = db.pragma('integrity_check', { simple: true });
        if (integrity !== 'ok') {
            throw new Error(`SQLite integrity check failed for ${databaseFile}: ${integrity}`);
        }

        return integrity;
    } finally {
        db.close();
    }
}

async function backupSqliteDatabase({
    databaseFile = resolveDatabaseFile({ preferLegacy: true }),
    backupFile,
    aggregatorStatusUrl,
    waitForAggregator = true,
    aggregatorTimeoutMs = DEFAULT_AGGREGATOR_WAIT_TIMEOUT_MS,
}) {
    if (!backupFile) throw new Error('backupFile is required');
    if (path.resolve(databaseFile) === path.resolve(backupFile)) {
        throw new Error('Backup destination must differ from the active database');
    }

    if (waitForAggregator) {
        await waitForAggregatorIdle({
            statusUrl: aggregatorStatusUrl,
            timeoutMs: aggregatorTimeoutMs,
        });
    }

    await fs.mkdir(path.dirname(backupFile), { recursive: true });

    const source = new Database(databaseFile, { fileMustExist: true, readonly: true });
    try {
        await source.backup(backupFile);
    } finally {
        source.close();
    }

    return {
        databaseFile,
        backupFile,
        integrity: await validateSqliteDatabase(backupFile),
    };
}

async function removeSqliteSidecars(databaseFile) {
    await Promise.all([
        fs.rm(`${databaseFile}-wal`, { force: true }),
        fs.rm(`${databaseFile}-shm`, { force: true }),
    ]);
}

async function restoreSqliteDatabase({
    databaseFile = resolveDatabaseFile({ preferLegacy: true }),
    backupFile,
    recoveryDir = path.join(path.dirname(databaseFile), 'backups'),
    timestamp = makeTimestamp(),
    aggregatorStatusUrl,
    waitForAggregator = true,
    aggregatorTimeoutMs = DEFAULT_AGGREGATOR_WAIT_TIMEOUT_MS,
}) {
    if (!backupFile) throw new Error('backupFile is required');
    if (path.resolve(databaseFile) === path.resolve(backupFile)) {
        throw new Error('Restore source must differ from the active database');
    }

    if (waitForAggregator) {
        await waitForAggregatorIdle({
            statusUrl: aggregatorStatusUrl,
            timeoutMs: aggregatorTimeoutMs,
        });
    }

    const integrity = await validateSqliteDatabase(backupFile);
    const parsedDatabase = path.parse(databaseFile);
    const recoveryFile = path.join(recoveryDir, `${parsedDatabase.name}.${timestamp}.pre-restore.sqlite`);
    let hasCurrentDatabase = false;

    try {
        await fs.access(databaseFile);
        hasCurrentDatabase = true;
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    if (hasCurrentDatabase) {
        await backupSqliteDatabase({ databaseFile, backupFile: recoveryFile });
    }

    await fs.mkdir(path.dirname(databaseFile), { recursive: true });
    const restoreTempFile = `${databaseFile}.${process.pid}.${Date.now()}.restore.tmp`;

    try {
        await fs.copyFile(backupFile, restoreTempFile);
        await validateSqliteDatabase(restoreTempFile);
        await removeSqliteSidecars(databaseFile);
        await fs.rename(restoreTempFile, databaseFile);
    } finally {
        await fs.rm(restoreTempFile, { force: true });
    }

    return {
        databaseFile,
        backupFile,
        recoveryFile: hasCurrentDatabase ? recoveryFile : null,
        integrity,
    };
}

function parseFlagValue(args, flag) {
    const index = args.indexOf(flag);
    if (index === -1) return undefined;

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
        throw new Error(`${flag} requires a value`);
    }

    return value;
}

async function runCli(args = process.argv.slice(2)) {
    const [command] = args;
    const databaseFile = parseFlagValue(args, '--database') || process.env.SQLITE_DATABASE_FILE || resolveDatabaseFile({ preferLegacy: true });

    if (command === 'backup') {
        const backupDir = parseFlagValue(args, '--dir') || path.join(path.dirname(databaseFile), 'backups');
        const backupFile = parseFlagValue(args, '--file')
            || path.join(backupDir, `${path.parse(databaseFile).name}.${makeTimestamp()}.backup.sqlite`);
        const result = await backupSqliteDatabase({ databaseFile, backupFile });
        console.log(`SQLite backup created: ${result.backupFile}`);
        return;
    }

    if (command === 'restore') {
        const backupFile = parseFlagValue(args, '--file');
        if (!backupFile) throw new Error('restore requires --file <backup.sqlite>');
        const recoveryDir = parseFlagValue(args, '--recovery-dir');
        const result = await restoreSqliteDatabase({ databaseFile, backupFile, recoveryDir });
        console.log(`SQLite restore completed from: ${result.backupFile}`);
        if (result.recoveryFile) console.log(`Pre-restore recovery backup: ${result.recoveryFile}`);
        return;
    }

    throw new Error('Usage: node sqlite-backup.js <backup|restore> [--database file] [--file file]');
}

if (require.main === module) {
    runCli().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    backupSqliteDatabase,
    fetchAggregatorStatus,
    getAggregatorStatusUrl,
    restoreSqliteDatabase,
    runCli,
    validateSqliteDatabase,
    waitForAggregatorIdle,
};
