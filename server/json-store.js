const fs = require('fs').promises;
const path = require('path');

const writeQueues = new Map();
const MAX_BACKUPS_PER_FILE = 10;

async function readJson(file, fallback) {
    try {
        const content = await fs.readFile(file, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT' && fallback !== undefined) {
            return fallback;
        }
        throw err;
    }
}

async function writeJson(file, data, options = {}) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    if (!options.skipBackup) {
        await backupExistingJson(file);
    }
    const tmpFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    const handle = await fs.open(tmpFile, 'w');
    try {
        await handle.writeFile(JSON.stringify(data, null, 2));
        await handle.sync();
    } finally {
        await handle.close();
    }

    await fs.rename(tmpFile, file);
    await syncDirectory(path.dirname(file));
}

async function backupExistingJson(file) {
    try {
        await fs.access(file);
    } catch (err) {
        if (err.code === 'ENOENT') return;
        throw err;
    }

    const backupDir = path.join(path.dirname(file), 'backups');
    await fs.mkdir(backupDir, { recursive: true });

    const parsedPath = path.parse(file);
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupFile = path.join(backupDir, `${parsedPath.name}.${timestamp}.bak.json`);
    await fs.copyFile(file, backupFile);
    await pruneBackups(backupDir, parsedPath.name);
}

async function pruneBackups(backupDir, basename) {
    const entries = await fs.readdir(backupDir);
    const backups = entries
        .filter((entry) => entry.startsWith(`${basename}.`) && entry.endsWith('.bak.json'))
        .sort();

    const excess = backups.length - MAX_BACKUPS_PER_FILE;
    if (excess <= 0) return;

    await Promise.all(
        backups.slice(0, excess).map((entry) => fs.rm(path.join(backupDir, entry), { force: true }))
    );
}

async function recoverJsonFile(file, options = {}) {
    try {
        await fs.access(file);
    } catch (err) {
        if (err.code === 'ENOENT' && options.fallback !== undefined) {
            await writeJson(file, options.fallback, { skipBackup: true });
            return { file, status: 'initialized', backupFile: null };
        }
        throw err;
    }

    try {
        await readJson(file);
        await removeOrphanTempFiles(file);
        return { file, status: 'ok', backupFile: null };
    } catch (err) {
        const backupFile = await findNewestValidBackup(file);
        if (!backupFile) {
            throw new Error(`No valid backup found for ${file}`);
        }

        const backupData = await readJson(backupFile);
        await writeJson(file, backupData, { skipBackup: true });
        await removeOrphanTempFiles(file);
        return { file, status: 'restored', backupFile };
    }
}

async function findNewestValidBackup(file) {
    const backupDir = path.join(path.dirname(file), 'backups');
    const parsedPath = path.parse(file);

    let entries;
    try {
        entries = await fs.readdir(backupDir);
    } catch (err) {
        if (err.code === 'ENOENT') return null;
        throw err;
    }

    const backups = entries
        .filter((entry) => entry.startsWith(`${parsedPath.name}.`) && entry.endsWith('.bak.json'))
        .sort()
        .reverse();

    for (const entry of backups) {
        const backupFile = path.join(backupDir, entry);
        try {
            await readJson(backupFile);
            return backupFile;
        } catch {
            // Keep scanning older backups.
        }
    }

    return null;
}

async function removeOrphanTempFiles(file) {
    const dir = path.dirname(file);
    const basename = path.basename(file);

    let entries;
    try {
        entries = await fs.readdir(dir);
    } catch (err) {
        if (err.code === 'ENOENT') return;
        throw err;
    }

    await Promise.all(
        entries
            .filter((entry) => entry.startsWith(`${basename}.`) && entry.endsWith('.tmp'))
            .map((entry) => fs.rm(path.join(dir, entry), { force: true }))
    );
}

async function syncDirectory(dir) {
    let handle;
    try {
        handle = await fs.open(dir, 'r');
        await handle.sync();
    } catch (err) {
        if (!['EINVAL', 'EPERM', 'EISDIR'].includes(err.code)) {
            throw err;
        }
    } finally {
        if (handle) {
            await handle.close();
        }
    }
}

function enqueueWrite(file, task) {
    const previous = writeQueues.get(file) || Promise.resolve();
    const next = previous.then(task, task).finally(() => {
        if (writeQueues.get(file) === next) {
            writeQueues.delete(file);
        }
    });

    writeQueues.set(file, next);
    return next;
}

function writeJsonQueued(file, data) {
    return enqueueWrite(file, () => writeJson(file, data));
}

function updateJsonQueued(file, fallback, updater) {
    return enqueueWrite(file, async () => {
        const current = await readJson(file, fallback);
        const updated = await updater(current);
        const nextData = updated === undefined ? current : updated;

        await writeJson(file, nextData);
        return nextData;
    });
}

module.exports = {
    readJson,
    recoverJsonFile,
    writeJsonQueued,
    updateJsonQueued,
};
