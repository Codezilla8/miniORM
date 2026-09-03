#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "../client/index.js";
import { createMigration } from "../migration/create.js";
import { migrate, migrateStatus } from "../migration/runner.js";

/**
 * WHY A HAND-ROLLED PARSER INSTEAD OF commander/yargs:
 * We have exactly 4 commands, each with at most one positional argument.
 * A dependency here would add install weight and an API surface to learn
 * for something `process.argv.slice(2)` handles in a dozen lines.
 *
 * CONFIG DISCOVERY:
 * The CLI reads DATABASE_URL from the environment (loaded from a local
 * .env by the shell / a preceding `node -r dotenv/config`, or the OS env)
 * and looks for migrations in ./migrations relative to the current working
 * directory. Both are overridable via flags for scripting.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Add it to your environment or .env file.");
    process.exit(1);
  }
  return url;
}

async function cmdInit(): Promise<void> {
  await mkdir(MIGRATIONS_DIR, { recursive: true });
  const envExample = path.resolve(process.cwd(), ".env.example");
  await writeFile(envExample, "DATABASE_URL=postgres://user:pass@localhost:5432/dbname\n", {
    flag: "wx",
  }).catch(() => {
    /* already exists, fine */
  });
  console.log(`Initialized. Created ${MIGRATIONS_DIR}`);
}

async function cmdMigrateCreate(name: string | undefined): Promise<void> {
  if (!name) {
    console.error("Usage: miniorm migrate:create <name>");
    process.exit(1);
  }
  const filepath = await createMigration(MIGRATIONS_DIR, name);
  console.log(`Created migration: ${filepath}`);
}

async function cmdMigrate(): Promise<void> {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  try {
    const ran = await migrate(client, MIGRATIONS_DIR);
    if (ran.length === 0) {
      console.log("No pending migrations.");
    } else {
      console.log(`Applied ${ran.length} migration(s):`);
      ran.forEach((f) => console.log(`  - ${f}`));
    }
  } finally {
    await client.close();
  }
}

async function cmdStatus(): Promise<void> {
  const client = new Client({ connectionString: requireDatabaseUrl() });
  try {
    const { applied, pending } = await migrateStatus(client, MIGRATIONS_DIR);
    console.log(`Applied (${applied.length}):`);
    applied.forEach((f) => console.log(`  ✓ ${f}`));
    console.log(`Pending (${pending.length}):`);
    pending.forEach((f) => console.log(`  - ${f}`));
  } finally {
    await client.close();
  }
}

async function main(): Promise<void> {
  const [command, arg] = process.argv.slice(2);

  switch (command) {
    case "init":
      return cmdInit();
    case "migrate:create":
      return cmdMigrateCreate(arg);
    case "migrate":
      return cmdMigrate();
    case "status":
      return cmdStatus();
    default:
      console.log(
        "Usage:\n" +
          "  miniorm init\n" +
          "  miniorm migrate:create <name>\n" +
          "  miniorm migrate\n" +
          "  miniorm status"
      );
      if (command) process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
