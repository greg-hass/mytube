import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { recoverDataFiles } = require('./data-integrity');

let tempDir;

describe('data integrity startup recovery', () => {
    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'youtube-data-integrity-'));
    });

    afterEach(async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('returns recovery summaries for configured data files', async () => {
        const dbFile = path.join(tempDir, 'db.json');
        const videosFile = path.join(tempDir, 'videos.json');

        const results = await recoverDataFiles([
            { file: dbFile, fallback: { subscriptions: [] } },
            { file: videosFile, fallback: { videos: [] } },
        ]);

        expect(results).toEqual([
            { file: dbFile, status: 'initialized', backupFile: null },
            { file: videosFile, status: 'initialized', backupFile: null },
        ]);
    });
});
