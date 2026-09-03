/**
 * Centralized error types. Keeping these distinct (instead of throwing plain
 * Error everywhere) lets callers do `if (err instanceof NotFoundError)` and
 * lets us attach structured context (query, params) for debugging without
 * leaking that context into a generic catch-all.
 */

export class MiniOrmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Thrown when a query/config uses an invalid identifier (table/column name). */
export class InvalidIdentifierError extends MiniOrmError {
  constructor(identifier: string) {
    super(
      `Invalid SQL identifier: "${identifier}". Identifiers must start with a letter ` +
        `or underscore and contain only letters, digits, and underscores.`
    );
  }
}

/** Thrown by findUnique() when no matching row exists. */
export class NotFoundError extends MiniOrmError {
  constructor(model: string, where: unknown) {
    super(`${model} not found for ${JSON.stringify(where)}`);
  }
}

/** Wraps a Postgres driver error with the SQL/params that caused it. */
export class QueryError extends MiniOrmError {
  readonly sql: string;
  readonly params: unknown[];
  readonly cause: unknown;

  constructor(message: string, sql: string, params: unknown[], cause: unknown) {
    super(message);
    this.sql = sql;
    this.params = params;
    this.cause = cause;
  }
}

export class MigrationError extends MiniOrmError {}
