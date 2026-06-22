const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function ensureMigrationsTable(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        )
    `);
}

function listAppliedVersions(db) {
    return new Set(
        db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version)
    );
}

function listMigrationFiles(dir = MIGRATIONS_DIR) {
    return fs.readdirSync(dir)
        .filter((name) => name.endsWith('.sql'))
        .sort();
}

function applyMigration(db, version, sql) {
    const insertVersion = db.prepare(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)'
    );
    const run = db.transaction(() => {
        db.exec(sql);
        insertVersion.run(version, new Date().toISOString());
    });
    run();
}

function runMigrations(db, dir = MIGRATIONS_DIR) {
    ensureMigrationsTable(db);
    const applied = listAppliedVersions(db);
    const files = listMigrationFiles(dir);
    const newlyApplied = [];

    for (const file of files) {
        const version = file.replace(/\.sql$/, '');
        if (applied.has(version)) continue;

        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        applyMigration(db, version, sql);
        newlyApplied.push(version);
    }

    return {
        alreadyApplied: Array.from(applied),
        newlyApplied,
    };
}

function isApplied(db, version) {
    ensureMigrationsTable(db);
    const row = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
    return Boolean(row);
}

module.exports = {
    MIGRATIONS_DIR,
    applyMigration,
    ensureMigrationsTable,
    isApplied,
    listAppliedVersions,
    listMigrationFiles,
    runMigrations,
};

if (require.main === module) {
    const Database = require('better-sqlite3');
    const { resolveDatabaseFile } = require('./app-store');
    const databaseFile = resolveDatabaseFile({ preferLegacy: true });
    const db = new Database(databaseFile);
    try {
        const result = runMigrations(db);
        if (result.newlyApplied.length === 0) {
            console.log(`No pending migrations (${result.alreadyApplied.length} already applied).`);
        } else {
            console.log(`Applied migrations: ${result.newlyApplied.join(', ')}`);
        }
    } finally {
        db.close();
    }
}
