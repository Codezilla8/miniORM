import { quoteIdentifier } from "../utils/identifier.js";
import { normalizeWhere } from "./where.js";
import type {
  CompiledQuery,
  DeleteDescriptor,
  FieldCondition,
  InsertDescriptor,
  Operator,
  QueryDescriptor,
  UpdateDescriptor,
} from "./types.js";

/**
 * Builds a single "field OP $n" fragment and pushes the value (if any) onto
 * params. This is the ONLY function in the codebase that decides how an
 * operator maps to SQL syntax — every query type (select/update/delete)
 * routes its WHERE clause through this, so operator support and injection
 * safety only need to be verified once.
 */
function compileCondition(cond: FieldCondition, params: unknown[]): string {
  const col = quoteIdentifier(cond.field);

  switch (cond.operator satisfies Operator) {
    case "eq":
      params.push(cond.value);
      return `${col} = $${params.length}`;
    case "ne":
      params.push(cond.value);
      return `${col} != $${params.length}`;
    case "gt":
      params.push(cond.value);
      return `${col} > $${params.length}`;
    case "lt":
      params.push(cond.value);
      return `${col} < $${params.length}`;
    case "gte":
      params.push(cond.value);
      return `${col} >= $${params.length}`;
    case "lte":
      params.push(cond.value);
      return `${col} <= $${params.length}`;
    case "like":
      params.push(cond.value);
      return `${col} LIKE $${params.length}`;
    case "isNull":
      return cond.value === false ? `${col} IS NOT NULL` : `${col} IS NULL`;
    case "in": {
      const values = Array.isArray(cond.value) ? cond.value : [cond.value];
      if (values.length === 0) {
        // An empty IN() would be invalid SQL; this is always false, correctly.
        return "1 = 0";
      }
      const placeholders = values.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `${col} IN (${placeholders.join(", ")})`;
    }
  }
}

function compileWhereClause(where: QueryDescriptor["where"], params: unknown[]): string {
  const conditions = normalizeWhere(where);
  if (conditions.length === 0) return "";
  const fragments = conditions.map((c) => compileCondition(c, params));
  return ` WHERE ${fragments.join(" AND ")}`;
}

export function compileSelect(descriptor: QueryDescriptor): CompiledQuery {
  const params: unknown[] = [];
  const table = quoteIdentifier(descriptor.table);
  const columns = descriptor.columns?.length
    ? descriptor.columns.map(quoteIdentifier).join(", ")
    : "*";

  let sql = `SELECT ${columns} FROM ${table}`;
  sql += compileWhereClause(descriptor.where, params);

  if (descriptor.orderBy && Object.keys(descriptor.orderBy).length > 0) {
    const parts = Object.entries(descriptor.orderBy).map(
      ([field, dir]) => `${quoteIdentifier(field)} ${dir === "desc" ? "DESC" : "ASC"}`
    );
    sql += ` ORDER BY ${parts.join(", ")}`;
  }

  if (descriptor.limit !== undefined) {
    params.push(descriptor.limit);
    sql += ` LIMIT $${params.length}`;
  }

  if (descriptor.offset !== undefined) {
    params.push(descriptor.offset);
    sql += ` OFFSET $${params.length}`;
  }

  return { sql, params };
}

export function compileInsert(descriptor: InsertDescriptor): CompiledQuery {
  const params: unknown[] = [];
  const table = quoteIdentifier(descriptor.table);
  const entries = Object.entries(descriptor.data);

  const columns = entries.map(([field]) => quoteIdentifier(field)).join(", ");
  const placeholders = entries
    .map(([, value]) => {
      params.push(value);
      return `$${params.length}`;
    })
    .join(", ");

  const returning = descriptor.returning?.length
    ? descriptor.returning.map(quoteIdentifier).join(", ")
    : "*";

  const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING ${returning}`;
  return { sql, params };
}

export function compileUpdate(descriptor: UpdateDescriptor): CompiledQuery {
  const params: unknown[] = [];
  const table = quoteIdentifier(descriptor.table);

  const setFragments = Object.entries(descriptor.data).map(([field, value]) => {
    params.push(value);
    return `${quoteIdentifier(field)} = $${params.length}`;
  });

  const returning = descriptor.returning?.length
    ? descriptor.returning.map(quoteIdentifier).join(", ")
    : "*";

  let sql = `UPDATE ${table} SET ${setFragments.join(", ")}`;
  sql += compileWhereClause(descriptor.where, params);
  sql += ` RETURNING ${returning}`;

  return { sql, params };
}

export function compileDelete(descriptor: DeleteDescriptor): CompiledQuery {
  const params: unknown[] = [];
  const table = quoteIdentifier(descriptor.table);
  const returning = descriptor.returning?.length
    ? descriptor.returning.map(quoteIdentifier).join(", ")
    : "*";

  let sql = `DELETE FROM ${table}`;
  sql += compileWhereClause(descriptor.where, params);
  sql += ` RETURNING ${returning}`;

  return { sql, params };
}
