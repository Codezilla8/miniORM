import pg from "pg";
import { QueryError } from "../errors/index.js";
import type { CompiledQuery } from "../query/types.js";

const { Pool } = pg;
export type PoolClient = pg.PoolClient;

export interface ClientOptions {
  connectionString: string;
  /** Max simultaneous connections in the pool. Default 10 — plenty for a
   *  single backend process; raise only if you understand your Postgres
   *  max_connections budget. */
  max?: number;
  idleTimeoutMillis?: number;
}

/**
 * Any executor (pool or a single transaction client) implements this. This
 * abstraction is what lets the model layer run the exact same code whether
 * it's operating on the shared pool or inside `db.transaction(tx => ...)`
 * without knowing which one it has.
 */
export interface QueryExecutor {
  run<T extends Record<string, unknown> = Record<string, unknown>>(
    query: CompiledQuery
  ): Promise<T[]>;
}

/**
 * Thin wrapper over pg.Pool.
 *
 * WHY POOLING: opening a TCP + auth handshake per query is slow and Postgres
 * caps concurrent connections; a pool keeps a small set of already-authenticated
 * connections open and hands them out to concurrent callers, returning them
 * when the query finishes. This is what lets many concurrent HTTP requests
 * share the database efficiently without serializing on one connection.
 */
export class Client implements QueryExecutor {
  readonly pool: pg.Pool;

  constructor(options: ClientOptions) {
    this.pool = new Pool({
      connectionString: options.connectionString,
      max: options.max ?? 10,
      idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    });
  }

  async run<T extends Record<string, unknown> = Record<string, unknown>>(
    query: CompiledQuery
  ): Promise<T[]> {
    try {
      const result = await this.pool.query(query.sql, query.params);
      return result.rows as T[];
    } catch (cause) {
      throw new QueryError(
        `Query failed: ${(cause as Error).message}`,
        query.sql,
        query.params,
        cause
      );
    }
  }

  /** Checks out a single dedicated client — used by the transaction module. */
  async connect(): Promise<pg.PoolClient> {
    return this.pool.connect();
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
