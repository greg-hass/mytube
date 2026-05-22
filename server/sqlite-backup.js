const fs = require('fs').promises;
const path = require('path');
const Database = require('better-sqlite3');
const { DEFAULT_DATABASE_FILE } = require('./app-store');

function makeTimestamp() {
    return new Date().toISOString().replace(/:/g, '-');
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

async function backupSqliteDatabase({ databaseFile = DEFAULT_DATABASE_FILE, backupFile }) {
    if (!backupFile) throw new Error('backupFile is required');
    if (path.resolve(databaseFile) === path.resolve(backupFile)) {
        throw new Error('Backup destination must differ from the active database');
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
    databaseFile = DEFAULT_DATABASE_FILE,
    backupFile,
    recoveryDir = path.join(path.dirname(databaseFile), 'backups'),
    timestamp = makeTimestamp(),
}) {
    if (!backupFile) throw new Error('backupFile is required');
    if (path.resolve(databaseFile) === path.resolve(backupFile)) {
        throw new Error('Restore source must differ from the active database');
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
    const databaseFile = parseFlagValue(args, '--database') || process.env.SQLITE_DATABASE_FILE || DEFAULT_DATABASE_FILE;

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
    restoreSqliteDatabase,
    runCli,
    validateSqliteDatabase,
};
