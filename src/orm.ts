import { Client, type ClientOptions, type QueryExecutor } from "./client/index.js";
import { runTransaction } from "./transaction/index.js";
import { Model } from "./model/model.js";
import type { ModelDefinition } from "./schema/types.js";

export type OrmOptions = ClientOptions;

/**
 * The ORM class is the composition root: it owns the pool (via Client),
 * keeps the registry of model definitions, and builds Model instances bound
 * to either the pool or (inside a transaction) a single pinned connection.
 * Models themselves never talk to `pg` directly — they only see the
 * QueryExecutor interface, which is what makes `db.transaction()` able to
 * swap the underlying connection transparently.
 */
export class ORM {
  private readonly client: Client;
  private readonly definitions = new Map<string, ModelDefinition>();
  private readonly models = new Map<string, Model>();

  constructor(options: OrmOptions) {
    this.client = new Client(options);
  }

  /** Registers a model and exposes it as db.<name-lowercased-first-char> is NOT automatic —
   *  access it via db.getModel(name) or the typed proxy pattern shown in examples. */
  model(name: string, definition: ModelDefinition): Model {
    this.definitions.set(name, definition);
    const model = this.buildModel(name, definition, this.client);
    this.models.set(name, model);
    // Expose as a live property, e.g. db.user, db.post — this is what makes
    // `db.user.findMany()` work instead of `db.getModel("user").findMany()`.
    Object.defineProperty(this, name, { value: model, enumerable: true, configurable: true });
    return model;
  }

  getModel<Row extends Record<string, unknown> = Record<string, unknown>>(
    name: string
  ): Model<Row> {
    const model = this.models.get(name);
    if (!model) throw new Error(`Model "${name}" is not registered. Call db.model("${name}", ...) first.`);
    return model as Model<Row>;
  }

  private buildModel(name: string, definition: ModelDefinition, executor: QueryExecutor): Model {
    return new Model(name, definition, executor, (targetName) => {
      const target = this.definitions.get(targetName);
      if (!target) {
        throw new Error(`Relation target model "${targetName}" is not registered.`);
      }
      return target;
    });
  }

  /**
   * Runs `fn` inside a BEGIN/COMMIT/ROLLBACK transaction. The `tx` object
   * passed to the callback has the same registered models, but every query
   * they run goes through the single connection pinned to this transaction.
   */
  async transaction<T>(fn: (tx: TransactionContext) => Promise<T>): Promise<T> {
    return runTransaction(this.client, async (executor) => {
      const txModels = new Map<string, Model>();
      for (const [name, def] of this.definitions) {
        txModels.set(name, this.buildModel(name, def, executor));
      }
      const tx = {} as TransactionContext;
      for (const [name, model] of txModels) {
        Object.defineProperty(tx, name, { value: model, enumerable: true });
      }
      return fn(tx);
    });
  }

  async close(): Promise<void> {
    await this.client.close();
  }
}

/** Index signature lets `tx.user`, `tx.post`, etc. type-check for registered models. */
export type TransactionContext = Record<string, Model>;
