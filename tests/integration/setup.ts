import { Client } from "../../src/client/index.js";

export const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Integration tests require a real, running PostgreSQL instance (see
 * README "PostgreSQL Setup"). We skip the whole suite rather than fail it
 * when DATABASE_URL isn't set, so `npm test` (unit only) stays fast and
 * dependency-free, while `npm run test:integration` gives a clear signal
 * if the database isn't reachable.
 */
export function requireDatabase() {
  if (!DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Start Postgres and set DATABASE_URL to run integration tests."
    );
  }
  return DATABASE_URL;
}

export async function resetSchema(client: Client): Promise<void> {
  await client.pool.query(`
    DROP TABLE IF EXISTS posts CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    DROP TABLE IF EXISTS _miniorm_migrations CASCADE;

    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER
    );

    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      "userId" INTEGER NOT NULL REFERENCES users(id)
    );
  `);
}

export function makeClient(): Client {
  return new Client({ connectionString: requireDatabase() });
}
