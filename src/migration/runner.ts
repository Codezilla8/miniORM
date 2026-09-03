import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "../client/index.js";
import { MigrationError } from "../errors/index.js";

/**
 * MIGRATION FILE FORMAT
 * Plain timestamped .sql files, e.g. migrations/20260214120000_add_users.sql
 * containing raw "up" SQL. We track which filenames have been applied in a
 * `_miniorm_migrations` table so re-running `migrate` is idempotent.
 *
 * LIMITATIONS (documented deliberately, not hidden):
 *  - No automatic rollback/"down" migrations — reverting requires writing
 *    and running a new forward migration. This avoids a whole class of
 *    down-script drift bugs at the cost of one-way migrations only.
 *  - No branch/merge conflict resolution: migrations apply strictly in
 *    filename (timestamp) order. Two developers creating migrations at the
 *    same time must reconcile ordering manually, same as most simple
 *    migration tools without a dependency graph.
 *  - Each migration file runs as a single statement batch, not wrapped in
 *    its own transaction automatically — for multi-statement DDL that must
 *    be atomic, wrap the file's SQL in BEGIN/COMMIT yourself.
 */

const TRACKING_TABLE = "_miniorm_migrations";

async function ensureTrackingTable(client: Client): Promise<void> {
  await client.pool.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKING_TABLE} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedNames(client: Client): Promise<Set<string>> {
  const result = await client.pool.query<{ name: string }>(
    `SELECT name FROM ${TRACKING_TABLE} ORDER BY name`
  );
  return new Set(result.rows.map((r) => r.name));
}

async function listMigrationFiles(dir: string): Promise<string[]> {
  const files = await readdir(dir).catch(() => [] as string[]);
  return files.filter((f) => f.endsWith(".sql")).sort();
}

export async function migrateStatus(
  client: Client,
  dir: string
): Promise<{ applied: string[]; pending: string[] }> {
  await ensureTrackingTable(client);
  const applied = await getAppliedNames(client);
  const all = await listMigrationFiles(dir);
  return {
    applied: all.filter((f) => applied.has(f)),
    pending: all.filter((f) => !applied.has(f)),
  };
}

export async function migrate(client: Client, dir: string): Promise<string[]> {
  await ensureTrackingTable(client);
  const applied = await getAppliedNames(client);
  const files = await listMigrationFiles(dir);
  const ran: string[] = [];

  for (const file of files) {
    if (applied.has(file)) continue; // never execute the same migration twice
    const sql = await readFile(path.join(dir, file), "utf8");

    const conn = await client.connect();
    try {
      await conn.query("BEGIN");
      await conn.query(sql);
      await conn.query(`INSERT INTO ${TRACKING_TABLE} (name) VALUES ($1)`, [file]);
      await conn.query("COMMIT");
      ran.push(file);
    } catch (cause) {
      await conn.query("ROLLBACK");
      throw new MigrationError(`Migration "${file}" failed: ${(cause as Error).message}`);
    } finally {
      conn.release();
    }
  }

  return ran;
}
