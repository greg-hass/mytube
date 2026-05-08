const fs = require('fs').promises;
const path = require('path');

const writeQueues = new Map();

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
    const tmpFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    await fs.writeFile(tmpFile, JSON.stringify(data, null, 2));
    await fs.rename(tmpFile, file);
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
