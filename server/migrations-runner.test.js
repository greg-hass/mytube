import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const { runMigrations, listMigrationFiles } = require('./migrations-runner');

let tempDir;
let migrationsDir;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-runner-'));
    migrationsDir = path.join(tempDir, 'migrations');
    fs.mkdirSync(migrationsDir);

    const realMigrationsDir = path.join(__dirname, 'migrations');
    for (const file of fs.readdirSync(realMigrationsDir)) {
        fs.copyFileSync(path.join(realMigrationsDir, file), path.join(migrationsDir, file));
    }
});

afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('migrations runner', () => {
    it('applies all pending migrations and records them in schema_migrations', () => {
        const db = new Database(':memory:');
        try {
            const result = runMigrations(db, migrationsDir);
            expect(result.newlyApplied.length).toBeGreaterThan(0);
            expect(result.alreadyApplied).toEqual([]);

            const applied = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
            expect(applied.map((row) => row.version)).toEqual(result.newlyApplied);
        } finally {
            db.close();
        }
    });

    it('is a no-op when called a second time', () => {
        const db = new Database(':memory:');
        try {
            const first = runMigrations(db, migrationsDir);
            const second = runMigrations(db, migrationsDir);

            expect(second.newlyApplied).toEqual([]);
            expect(second.alreadyApplied.sort()).toEqual(first.newlyApplied.slice().sort());
        } finally {
            db.close();
        }
    });

    it('rolls back a failing migration so the database stays consistent', () => {
        const db = new Database(':memory:');
        try {
            const goodFile = path.join(migrationsDir, '001_initial.sql');
            expect(fs.existsSync(goodFile)).toBe(true);

            fs.writeFileSync(path.join(migrationsDir, '002_broken.sql'), 'THIS IS NOT VALID SQL;');

            expect(() => runMigrations(db, migrationsDir)).toThrow();

            const applied = db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version);
            expect(applied).not.toContain('002_broken');
            expect(applied).toContain('001_initial');
        } finally {
            db.close();
        }
    });

    it('lists migration files in lexical order', () => {
        expect(listMigrationFiles(migrationsDir)).toEqual(listMigrationFiles(migrationsDir).slice().sort());
    });
});
