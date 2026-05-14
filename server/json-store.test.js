import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { readJson, recoverJsonFile, writeJsonQueued } = require('./json-store');

let tempDir;

describe('json-store durability', () => {
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-json-store-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('creates a timestamped backup before replacing an existing JSON file', async () => {
        const file = path.join(tempDir, 'db.json');

        await writeJsonQueued(file, { version: 1, subscriptions: ['old'] });
        await writeJsonQueued(file, { version: 2, subscriptions: ['new'] });

        const current = await readJson(file);
        const backupFiles = await fs.readdir(path.join(tempDir, 'backups'));
        const backup = await readJson(path.join(tempDir, 'backups', backupFiles[0]));

        expect(current).toEqual({ version: 2, subscriptions: ['new'] });
        expect(backupFiles).toHaveLength(1);
        expect(backupFiles[0]).toMatch(/^db\.\d{4}-\d{2}-\d{2}T/);
        expect(backup).toEqual({ version: 1, subscriptions: ['old'] });
    });

    it('restores the newest valid backup when the primary JSON file is corrupt', async () => {
        const file = path.join(tempDir, 'db.json');
        const backupDir = path.join(tempDir, 'backups');
        await fs.mkdir(backupDir, { recursive: true });
        await fs.writeFile(file, '{bad json');
        await fs.writeFile(path.join(backupDir, 'db.2026-05-14T10-00-00.000Z.bak.json'), JSON.stringify({ version: 1 }));
        await fs.writeFile(path.join(backupDir, 'db.2026-05-14T11-00-00.000Z.bak.json'), JSON.stringify({ version: 2 }));

        const result = await recoverJsonFile(file, { fallback: { version: 0 } });

        await expect(readJson(file)).resolves.toEqual({ version: 2 });
        expect(result).toEqual({
            file,
            status: 'restored',
            backupFile: path.join(backupDir, 'db.2026-05-14T11-00-00.000Z.bak.json'),
        });
    });

    it('fails clearly when the primary file and every backup are corrupt', async () => {
        const file = path.join(tempDir, 'db.json');
        const backupDir = path.join(tempDir, 'backups');
        await fs.mkdir(backupDir, { recursive: true });
        await fs.writeFile(file, '{bad json');
        await fs.writeFile(path.join(backupDir, 'db.2026-05-14T10-00-00.000Z.bak.json'), '{also bad');

        await expect(recoverJsonFile(file, { fallback: { version: 0 } })).rejects.toThrow(
            'No valid backup found'
        );
    });
});
