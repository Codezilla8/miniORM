import type { QueryExecutor } from "../client/index.js";
import { compileSelect } from "../query/compiler.js";
import type { RelationDefinition } from "../schema/types.js";

/**
 * THE N+1 PROBLEM
 * Naively, loading `include: { posts: true }` for 50 users by running one
 * "SELECT * FROM posts WHERE userId = $1" per user means 1 query for the
 * users + 50 queries for their posts = 51 round-trips. That's the N+1
 * problem, and it gets worse linearly with result size.
 *
 * HOW WE AVOID IT
 * Instead we run exactly ONE extra query per included relation, regardless
 * of how many parent rows there are: collect every parent's key, run a
 * single "WHERE foreignKey IN (...)" query, then group the results back
 * onto their parent in memory. Total queries = 1 (parents) + 1 per relation,
 * not 1 + N. We do not implement JOIN-based single-query fetching or lazy
 * (on-access) loading — batching is the simplest approach that fully
 * solves N+1 for the common case, without the row-duplication bookkeeping
 * a JOIN approach requires when a parent has many children.
 */
export async function loadRelation(
  executor: QueryExecutor,
  parents: Array<Record<string, unknown>>,
  relationName: string,
  relation: RelationDefinition,
  targetTable: string
): Promise<void> {
  if (parents.length === 0) return;
  const localKey = relation.localKey ?? "id";

  if (relation.kind === "hasMany") {
    const parentKeys = [...new Set(parents.map((p) => p[localKey]))];
    const children = await executor.run(
      compileSelect({
        table: targetTable,
        where: { [relation.foreignKey]: { in: parentKeys } },
      })
    );

    const byParentKey = new Map<unknown, Record<string, unknown>[]>();
    for (const child of children) {
      const key = child[relation.foreignKey];
      const bucket = byParentKey.get(key) ?? [];
      bucket.push(child);
      byParentKey.set(key, bucket);
    }

    for (const parent of parents) {
      parent[relationName] = byParentKey.get(parent[localKey]) ?? [];
    }
    return;
  }

  // belongsTo: this row's foreignKey value points at the target's localKey.
  const foreignValues = [...new Set(parents.map((p) => p[relation.foreignKey]))].filter(
    (v) => v !== null && v !== undefined
  );

  const related =
    foreignValues.length === 0
      ? []
      : await executor.run(
          compileSelect({
            table: targetTable,
            where: { [localKey]: { in: foreignValues } },
          })
        );

  const byKey = new Map(related.map((row) => [row[localKey], row]));
  for (const parent of parents) {
    parent[relationName] = byKey.get(parent[relation.foreignKey]) ?? null;
  }
}
