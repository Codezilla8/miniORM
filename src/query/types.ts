/**
 * WHY AN IR INSTEAD OF STRING CONCATENATION?
 *
 * If we built SQL by concatenating strings as conditions arrived, every new
 * operator (>, IN, LIKE...) would need its own ad-hoc string-building code,
 * and it would be easy to forget to parameterize a value in one branch.
 * Instead, the model layer converts a `where` object into this plain-object
 * IR (Intermediate Representation). A single compiler function then walks
 * the IR and is the ONLY place that emits SQL text or pushes into the
 * params array. This means:
 *   - there is exactly one place where injection could be introduced,
 *     so there's exactly one place to review/test.
 *   - adding an operator = adding one branch in the compiler, not touching
 *     every model method that builds queries.
 * We didn't go as far as a full AST with a grammar/parser because our query
 * shape is a shallow tree (implicit AND of conditions, each with one
 * operator) — a full AST would be over-engineering for that shape.
 */

export type Operator =
  | "eq"
  | "ne"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "in"
  | "like"
  | "isNull";

export interface FieldCondition {
  field: string;
  operator: Operator;
  value?: unknown;
}

/** A where clause is a map of field -> value-or-operator-object, implicitly AND-ed. */
export type WhereInput = Record<string, unknown>;

export type OrderDirection = "asc" | "desc";

export interface QueryDescriptor {
  table: string;
  columns?: string[]; // undefined => SELECT *
  where?: WhereInput;
  orderBy?: Record<string, OrderDirection>;
  limit?: number;
  offset?: number;
}

export interface CompiledQuery {
  sql: string;
  params: unknown[];
}

export interface InsertDescriptor {
  table: string;
  data: Record<string, unknown>;
  returning?: string[]; // undefined => RETURNING *
}

export interface UpdateDescriptor {
  table: string;
  data: Record<string, unknown>;
  where: WhereInput;
  returning?: string[];
}

export interface DeleteDescriptor {
  table: string;
  where: WhereInput;
  returning?: string[];
}
