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

async function writeJson(file, data) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await backupExistingJson(file);
    const tmpFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
    await fs.rename(tmpFile, file);
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
    writeJsonQueued,
    updateJsonQueued,
};
