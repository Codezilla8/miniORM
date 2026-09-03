import { InvalidIdentifierError } from "../errors/index.js";

/**
 * SQL VALUES (e.g. a name, an age) can always be sent as bind parameters
 * ($1, $2, ...) — Postgres treats them purely as data, never as syntax.
 *
 * SQL IDENTIFIERS (table names, column names) CANNOT be parameterized —
 * Postgres has no placeholder syntax for "the name of a column here".
 * `SELECT * FROM $1` is not valid SQL. So identifiers that ever originate
 * from outside our own static schema metadata must be validated against a
 * strict allow-list pattern and then double-quoted, rather than trusted
 * or parameterized.
 *
 * In this ORM, table/column names come from the model definitions the
 * developer writes in code (not raw end-user input), but we still validate
 * them here as defense in depth and to catch typos/misconfiguration early.
 */
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertSafeIdentifier(identifier: string): string {
  if (!SAFE_IDENTIFIER.test(identifier)) {
    throw new InvalidIdentifierError(identifier);
  }
  return identifier;
}

/** Validates and double-quotes an identifier for safe interpolation into SQL text. */
export function quoteIdentifier(identifier: string): string {
  assertSafeIdentifier(identifier);
  return `"${identifier}"`;
}
