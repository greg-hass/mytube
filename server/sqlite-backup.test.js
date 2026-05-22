import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { backupSqliteDatabase, restoreSqliteDatabase } = require('./sqlite-backup');

let tempDir;

function writeValue(databaseFile, value) {
    const db = new Database(databaseFile);
    db.exec('CREATE TABLE IF NOT EXISTS notes (value TEXT NOT NULL)');
    db.prepare('DELETE FROM notes').run();
    db.prepare('INSERT INTO notes (value) VALUES (?)').run(value);
    db.close();
}

function readValue(databaseFile) {
    const db = new Database(databaseFile, { readonly: true });
    try {
        return db.prepare('SELECT value FROM notes').get().value;
    } finally {
        db.close();
    }
}

describe('sqlite backup', () => {
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-sqlite-backup-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('creates a validated online backup snapshot', async () => {
        const databaseFile = path.join(tempDir, 'state.sqlite');
        const backupFile = path.join(tempDir, 'backups', 'state.snapshot.sqlite');
        writeValue(databaseFile, 'original');

        const result = await backupSqliteDatabase({ databaseFile, backupFile });

        expect(result).toEqual({
            databaseFile,
            backupFile,
            integrity: 'ok',
        });
        expect(readValue(backupFile)).toBe('original');
    });

    it('restores a validated backup and keeps a pre-restore recovery copy', async () => {
        const databaseFile = path.join(tempDir, 'state.sqlite');
        const backupFile = path.join(tempDir, 'restore.sqlite');
        const recoveryDir = path.join(tempDir, 'recovery');
        writeValue(databaseFile, 'current');
        writeValue(backupFile, 'restored');
        await fs.writeFile(`${databaseFile}-wal`, 'stale wal');
        await fs.writeFile(`${databaseFile}-shm`, 'stale shm');

        const result = await restoreSqliteDatabase({
            databaseFile,
            backupFile,
            recoveryDir,
            timestamp: '2026-05-22T21-30-00.000Z',
        });

        expect(readValue(databaseFile)).toBe('restored');
        expect(readValue(result.recoveryFile)).toBe('current');
        await expect(fs.access(`${databaseFile}-wal`)).rejects.toMatchObject({ code: 'ENOENT' });
        await expect(fs.access(`${databaseFile}-shm`)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(result).toMatchObject({
            databaseFile,
            backupFile,
            recoveryFile: path.join(recoveryDir, 'state.2026-05-22T21-30-00.000Z.pre-restore.sqlite'),
            integrity: 'ok',
        });
    });
});
