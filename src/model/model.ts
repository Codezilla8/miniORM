import type { QueryExecutor } from "../client/index.js";
import { compileDelete, compileInsert, compileSelect, compileUpdate } from "../query/compiler.js";
import type { OrderDirection, WhereInput } from "../query/types.js";
import { loadRelation } from "../relations/loader.js";
import type { ModelDefinition } from "../schema/types.js";
import { NotFoundError } from "../errors/index.js";
import { mapRows } from "./mapper.js";

export interface FindManyOptions {
  where?: WhereInput;
  orderBy?: Record<string, OrderDirection>;
  limit?: number;
  offset?: number;
  include?: Record<string, boolean>;
}

export interface FindUniqueOptions {
  where: WhereInput;
  include?: Record<string, boolean>;
}

export interface CreateOptions {
  data: Record<string, unknown>;
}

export interface UpdateOptions {
  where: WhereInput;
  data: Record<string, unknown>;
}

export interface DeleteOptions {
  where: WhereInput;
}

/**
 * A Model is a thin, table-scoped wrapper around the query compiler +
 * executor. It's intentionally "Active Record"-*shaped* in its call syntax
 * (`db.user.findMany(...)`) but internally behaves like a Data Mapper: rows
 * are plain objects, not instances with save()/destroy() methods. That
 * hybrid was chosen because plain objects are trivial to test, serialize,
 * and reason about, while the ergonomic `db.<model>.<verb>()` syntax is what
 * developers expect from Prisma/ActiveRecord-style tools.
 */
export class Model<Row extends Record<string, unknown> = Record<string, unknown>> {
  constructor(
    private readonly name: string,
    private readonly definition: ModelDefinition,
    private readonly executor: QueryExecutor,
    /** Looks up another model's definition by name, for relation resolution. */
    private readonly resolveModel: (name: string) => ModelDefinition
  ) {}

  async findMany(options: FindManyOptions = {}): Promise<Row[]> {
    const rows = await this.executor.run<Row>(
      compileSelect({
        table: this.definition.table,
        where: options.where,
        orderBy: options.orderBy,
        limit: options.limit,
        offset: options.offset,
      })
    );
    const mapped = mapRows<Row>(rows);
    await this.applyIncludes(mapped, options.include);
    return mapped;
  }

  async findUnique(options: FindUniqueOptions): Promise<Row | null> {
    const rows = await this.executor.run<Row>(
      compileSelect({ table: this.definition.table, where: options.where, limit: 1 })
    );
    if (rows.length === 0) return null;
    const mapped = mapRows<Row>(rows);
    await this.applyIncludes(mapped, options.include);
    return mapped[0] ?? null;
  }

  /** Same as findUnique, but throws NotFoundError instead of returning null. */
  async findUniqueOrThrow(options: FindUniqueOptions): Promise<Row> {
    const row = await this.findUnique(options);
    if (!row) throw new NotFoundError(this.name, options.where);
    return row;
  }

  async create(options: CreateOptions): Promise<Row> {
    const rows = await this.executor.run<Row>(
      compileInsert({ table: this.definition.table, data: options.data })
    );
    return mapRows<Row>(rows)[0] as Row;
  }

  async update(options: UpdateOptions): Promise<Row[]> {
    const rows = await this.executor.run<Row>(
      compileUpdate({ table: this.definition.table, data: options.data, where: options.where })
    );
    return mapRows<Row>(rows);
  }

  async delete(options: DeleteOptions): Promise<Row[]> {
    const rows = await this.executor.run<Row>(
      compileDelete({ table: this.definition.table, where: options.where })
    );
    return mapRows<Row>(rows);
  }

  private async applyIncludes(
    rows: Row[],
    include?: Record<string, boolean>
  ): Promise<void> {
    if (!include || rows.length === 0) return;

    for (const [relationName, enabled] of Object.entries(include)) {
      if (!enabled) continue;
      const relation = this.definition.relations?.[relationName];
      if (!relation) {
        throw new Error(
          `Unknown relation "${relationName}" on model "${this.name}". ` +
            `Define it in db.model("${this.name}", { relations: { ${relationName}: ... } }).`
        );
      }
      const targetTable = this.resolveModel(relation.target).table;
      await loadRelation(this.executor, rows, relationName, relation, targetTable);
    }
  }
}
