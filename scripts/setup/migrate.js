#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Client } = require("pg");

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://delego:delego@localhost:5432/delego";
const REPO_ROOT = path.join(__dirname, "../..");
const SCHEMA_DIR = path.resolve(process.env.DELEGO_SCHEMA_DIR ?? path.join(REPO_ROOT, "database/schema"));
const MIGRATIONS_DIR = path.resolve(
  process.env.DELEGO_MIGRATIONS_DIR ?? path.join(REPO_ROOT, "database/migrations"),
);
const LOCK_KEY = "delegobackend:schema-migrations";
const FILENAME_PATTERN = /^(\d+)_[A-Za-z0-9_-]+\.sql$/;
const TRACKING_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    id BIGSERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    migration_group TEXT NOT NULL CHECK (migration_group IN ('schema', 'migration')),
    version INTEGER NOT NULL,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;
const TRACKING_INDEX_SQL = [
  `CREATE INDEX IF NOT EXISTS schema_migrations_version_idx ON schema_migrations (migration_group, version)`,
  `CREATE INDEX IF NOT EXISTS schema_migrations_applied_at_idx ON schema_migrations (applied_at)`,
];

function log(message) {
  console.log(`[delego] db:migrate — ${message}`);
}

function logError(message) {
  console.error(`[delego] db:migrate — ${message}`);
}

class MigrationError extends Error {}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function discoverFiles(dirPath, group) {
  if (!fs.existsSync(dirPath)) {
    throw new MigrationError(`Migration directory does not exist: ${dirPath}`);
  }
  const entries = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  return entries.map((filename) => {
    const match = FILENAME_PATTERN.exec(filename);
    if (!match) {
      throw new MigrationError(
        `Invalid migration filename: ${path.join(group, filename)} — expected <number>_<description>.sql`,
      );
    }
    const sql = fs.readFileSync(path.join(dirPath, filename), "utf8");
    return {
      filename: path.join(group, filename),
      group,
      version: Number.parseInt(match[1], 10),
      sql,
      checksum: sha256(sql),
    };
  });
}

function compareMigrations(a, b) {
  if (a.group !== b.group) {
    return a.group === "schema" ? -1 : 1;
  }
  if (a.version !== b.version) {
    return a.version - b.version;
  }
  return a.filename.localeCompare(b.filename);
}

function validateMigrations(files) {
  const seenNames = new Map();
  for (const file of files) {
    if (seenNames.has(file.filename)) {
      throw new MigrationError(`Duplicate migration filename: ${file.filename}`);
    }
    seenNames.set(file.filename, file);
  }
  const byGroup = new Map();
  for (const file of files) {
    const groupFiles = byGroup.get(file.group) ?? [];
    groupFiles.push(file);
    byGroup.set(file.group, groupFiles);
  }
  for (const [group, groupFiles] of byGroup) {
    const versions = new Map();
    for (const file of groupFiles) {
      if (versions.has(file.version)) {
        throw new MigrationError(
          [
            `Duplicate migration version ${String(file.version).padStart(3, "0")} in ${group}/:`,
            ...groupFiles.filter((f) => f.version === file.version).map((f) => `  - ${f.filename}`),
            `Renumber one of the files so versions are unique within ${group}/.`,
          ].join("\n"),
        );
      }
      versions.set(file.version, file);
    }
  }
  return [...files].sort(compareMigrations);
}

async function fetchAppliedMigrations(client) {
  const tableExists = await client.query(
    `SELECT to_regclass('public.schema_migrations') IS NOT NULL AS exists`,
  );
  if (!tableExists.rows[0].exists) {
    return [];
  }
  const result = await client.query(
    `SELECT filename, migration_group, version, checksum, applied_at FROM schema_migrations ORDER BY id`,
  );
  return result.rows;
}

async function acquireLock(client) {
  await client.query(`SELECT pg_advisory_lock(hashtext('${LOCK_KEY}'))`);
}

async function releaseLock(client) {
  try {
    await client.query(`SELECT pg_advisory_unlock(hashtext('${LOCK_KEY}'))`);
  } catch {
    logError("failed to release migration advisory lock; it will be released when the connection closes");
  }
}

function reconcile(migrations, appliedRows) {
  const byFilename = new Map(migrations.map((file) => [file.filename, file]));
  const drifted = [];
  const missing = [];
  const applied = [];
  for (const row of appliedRows) {
    const file = byFilename.get(row.filename);
    if (!file) {
      missing.push(row.filename);
      continue;
    }
    if (file.checksum !== row.checksum) {
      drifted.push({ file, storedChecksum: row.checksum });
      continue;
    }
    applied.push(file);
  }
  const appliedFilenames = new Set(appliedRows.map((row) => row.filename));
  const pending = migrations.filter((file) => !appliedFilenames.has(file.filename));
  return { applied, pending, drifted, missing };
}

function assertNoIntegrityProblems({ drifted, missing }) {
  if (missing.length > 0) {
    throw new MigrationError(
      [
        "Applied migrations missing from disk:",
        ...missing.map((filename) => `  - ${filename}`),
        "Applied migration files must not be deleted or renamed.",
      ].join("\n"),
    );
  }
  if (drifted.length > 0) {
    throw new MigrationError(
      [
        "Migration checksum mismatch:",
        ...drifted.map(
          ({ file, storedChecksum }) =>
            [
              `  file: database/${file.filename}`,
              `  applied checksum: ${storedChecksum}`,
              `  current checksum: ${file.checksum}`,
            ].join("\n"),
        ),
        "",
        "Applied migrations must not be edited. Create a new migration instead.",
      ].join("\n"),
    );
  }
}

async function ensureTrackingTable(client) {
  await client.query(TRACKING_TABLE_SQL);
  for (const sql of TRACKING_INDEX_SQL) {
    await client.query(sql);
  }
}

async function applyMigration(client, file) {
  await client.query("BEGIN");
  try {
    await client.query(file.sql);
    await client.query(
      `INSERT INTO schema_migrations (filename, migration_group, version, checksum)
       VALUES ($1, $2, $3, $4)`,
      [file.filename, file.group, file.version, file.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    error.message = `${file.filename} failed: ${error.message}`;
    throw error;
  }
}

async function withClient(callback) {
  const client = new Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function loadState(client) {
  const migrations = validateMigrations([
    ...discoverFiles(SCHEMA_DIR, "schema"),
    ...discoverFiles(MIGRATIONS_DIR, "migration"),
  ]);
  const appliedRows = await fetchAppliedMigrations(client);
  return { migrations, state: reconcile(migrations, appliedRows) };
}

async function runStatus() {
  return withClient(async (client) => {
    await acquireLock(client);
    try {
      const { migrations, state } = await loadState(client);
      assertNoIntegrityProblems(state);
      console.log("Migration status");
      console.log("");
      console.log("Applied:");
      if (state.applied.length === 0) {
        console.log("  (none)");
      }
      for (const file of state.applied) {
        console.log(`  ✓ ${file.filename}`);
      }
      console.log("");
      console.log("Pending:");
      if (state.pending.length === 0) {
        console.log("  (none)");
      }
      for (const file of state.pending) {
        console.log(`  • ${file.filename}`);
      }
      console.log("");
      console.log("Summary:");
      console.log(`  Applied: ${state.applied.length}`);
      console.log(`  Pending: ${state.pending.length}`);
      console.log(`  Drifted: ${state.drifted.length}`);
      console.log("");
      if (state.pending.length === 0) {
        console.log("Database is up to date.");
      }
      log(
        `status — ${migrations.length} tracked file(s): ${state.applied.length} applied, ${state.pending.length} pending.`,
      );
    } finally {
      await releaseLock(client);
    }
  });
}

async function runMigrate() {
  return withClient(async (client) => {
    await acquireLock(client);
    try {
      const { state } = await loadState(client);
      assertNoIntegrityProblems(state);
      if (state.pending.length === 0) {
        log(`nothing to do; database is up to date (${state.applied.length} applied, 0 pending).`);
        return;
      }
      await ensureTrackingTable(client);
      for (const file of state.pending) {
        log(`applying ${file.filename}`);
        await applyMigration(client, file);
      }
      log(`applied ${state.pending.length} migration(s); database is up to date.`);
    } finally {
      await releaseLock(client);
    }
  });
}

async function run() {
  const statusMode = process.argv.includes("--status") || process.argv.includes("status");
  try {
    if (statusMode) {
      await runStatus();
    } else {
      log(`connecting to database: ${DATABASE_URL}`);
      await runMigrate();
    }
  } catch (error) {
    logError(statusMode ? "status failed:" : "migration failed:");
    console.error(error instanceof MigrationError ? error.message : error);
    process.exitCode = 1;
  }
}

run();

module.exports = {
  DATABASE_URL,
  SCHEMA_DIR,
  MIGRATIONS_DIR,
  discoverFiles,
  compareMigrations,
  validateMigrations,
};
