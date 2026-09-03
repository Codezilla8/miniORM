import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "../../src/client/index.js";
import { migrate, migrateStatus } from "../../src/migration/runner.js";
import { requireDatabase } from "./setup.js";

describe("migrations against real Postgres", () => {
  requireDatabase();
  let client: Client;
  let dir: string;

  beforeEach(async () => {
    client = new Client({ connectionString: requireDatabase() });
    await client.pool.query(`
      DROP TABLE IF EXISTS widgets CASCADE;
      DROP TABLE IF EXISTS _miniorm_migrations CASCADE;
    `);
    dir = await mkdtemp(path.join(tmpdir(), "miniorm-migrations-"));
  });

  afterEach(async () => {
    await client.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("applies pending migrations in filename order and records them", async () => {
    await writeFile(
      path.join(dir, "20260101000000_create_widgets.sql"),
      "CREATE TABLE widgets (id SERIAL PRIMARY KEY, name TEXT);"
    );

    const ran = await migrate(client, dir);
    expect(ran).toEqual(["20260101000000_create_widgets.sql"]);

    const status = await migrateStatus(client, dir);
    expect(status.applied).toEqual(["20260101000000_create_widgets.sql"]);
    expect(status.pending).toEqual([]);
  });

  it("never re-applies an already-applied migration", async () => {
    await writeFile(
      path.join(dir, "20260101000000_create_widgets.sql"),
      "CREATE TABLE widgets (id SERIAL PRIMARY KEY, name TEXT);"
    );

    await migrate(client, dir);
    const secondRun = await migrate(client, dir); // would fail with "already exists" if re-run
    expect(secondRun).toEqual([]);
  });

  it("rolls back a failing migration and does not record it as applied", async () => {
    await writeFile(path.join(dir, "20260101000000_broken.sql"), "NOT VALID SQL;");

    await expect(migrate(client, dir)).rejects.toThrow();

    const status = await migrateStatus(client, dir);
    expect(status.applied).toEqual([]);
  });
});
