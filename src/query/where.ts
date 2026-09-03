import type { FieldCondition, Operator, WhereInput } from "./types.js";

const OPERATOR_KEYS: Operator[] = ["eq", "ne", "gt", "lt", "gte", "lte", "in", "like", "isNull"];

function isOperatorObject(value: unknown): value is Partial<Record<Operator, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.keys(value).some((k) => OPERATOR_KEYS.includes(k as Operator));
}

/**
 * Turns:
 *   { age: { gt: 18 }, name: "Jay" }
 * into:
 *   [ { field: "age", operator: "gt", value: 18 },
 *     { field: "name", operator: "eq", value: "Jay" } ]
 *
 * Plain values default to equality — this is what lets `where: { id: 1 }`
 * work without forcing the caller to write `{ id: { eq: 1 } }` everywhere.
 */
export function normalizeWhere(where: WhereInput | undefined): FieldCondition[] {
  if (!where) return [];
  const conditions: FieldCondition[] = [];

  for (const [field, raw] of Object.entries(where)) {
    if (isOperatorObject(raw)) {
      for (const op of OPERATOR_KEYS) {
        if (op in raw) {
          conditions.push({ field, operator: op, value: (raw as Record<string, unknown>)[op] });
        }
      }
    } else {
      conditions.push({ field, operator: "eq", value: raw });
    }
  }

  return conditions;
}
