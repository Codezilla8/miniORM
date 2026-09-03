import type { PoolClient, QueryExecutor } from "./index.js";
import { QueryError } from "../errors/index.js";
import type { CompiledQuery } from "../query/types.js";

/**
 * Wraps a single already-checked-out pg client (from pool.connect()) so it
 * satisfies the same QueryExecutor interface as the pool. Used exclusively
 * during a transaction so every query inside `db.transaction(tx => ...)`
 * runs on the SAME underlying connection — required because BEGIN/COMMIT
 * and any uncommitted writes only apply within one physical connection.
 * If model queries instead pulled a fresh connection from the pool each
 * time, they'd silently run outside the transaction.
 */
export class SingleConnectionExecutor implements QueryExecutor {
  constructor(private readonly client: PoolClient) {}

  async run<T extends Record<string, unknown> = Record<string, unknown>>(
    query: CompiledQuery
  ): Promise<T[]> {
    try {
      const result = await this.client.query(query.sql, query.params);
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
}
