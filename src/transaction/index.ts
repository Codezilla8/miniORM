import type { Client } from "../client/index.js";
import { SingleConnectionExecutor } from "../client/executor.js";

/**
 * Runs `fn` inside a Postgres transaction.
 *
 * We check out ONE client from the pool, run BEGIN, hand the caller a scoped
 * "tx" object whose models all route through that same connection (via
 * SingleConnectionExecutor), then COMMIT on success or ROLLBACK on any
 * thrown error. The `finally` always releases the client back to the pool —
 * without it, a thrown error would leak that connection forever and
 * eventually exhaust the pool.
 *
 * Isolation level: we use Postgres's default (READ COMMITTED). We don't
 * implement custom isolation-level selection — it's rarely needed for CRUD
 * apps and would add API surface without a proportional benefit here.
 */
export async function runTransaction<T>(
  client: Client,
  fn: (executor: SingleConnectionExecutor) => Promise<T>
): Promise<T> {
  const conn = await client.connect();
  const executor = new SingleConnectionExecutor(conn);

  try {
    await conn.query("BEGIN");
    const result = await fn(executor);
    await conn.query("COMMIT");
    return result;
  } catch (err) {
    await conn.query("ROLLBACK");
    throw err;
  } finally {
    conn.release();
  }
}
