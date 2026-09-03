/**
 * pg returns some types as strings by default (notably BIGINT/NUMERIC,
 * since they can exceed JS's safe integer range). We deliberately do NOT
 * silently coerce those to `number`, because that would reintroduce the
 * precision-loss bug pg avoided in the first place.
 *
 * SUPPORTED / DOCUMENTED MAPPING:
 *   integer, smallint         -> number
 *   bigint, numeric, decimal  -> string  (avoid precision loss; parse explicitly if needed)
 *   text, varchar             -> string
 *   boolean                   -> boolean
 *   timestamp, timestamptz    -> Date            (handled by pg's built-in parser)
 *   json, jsonb                -> parsed object   (handled by pg's built-in parser)
 *   null                      -> null
 *
 * We do not attempt to support arrays, ranges, geometric types, or custom
 * enums — that's out of scope; pg will return those as its own defaults
 * (usually raw strings) and callers can parse them manually if needed.
 */
export function mapRow<T extends Record<string, unknown>>(row: Record<string, unknown>): T {
  // pg's default type parsing already does the useful work (Date, JSON, etc).
  // This function exists as the single seam where future normalization
  // (e.g. camelCase conversion) would go, so model code never touches
  // raw driver output directly.
  return row as T;
}

export function mapRows<T extends Record<string, unknown>>(
  rows: Record<string, unknown>[]
): T[] {
  return rows.map((r) => mapRow<T>(r));
}
