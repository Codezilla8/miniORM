import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORM } from "../../src/index.js";
import { makeClient, resetSchema, requireDatabase } from "./setup.js";
import { Client } from "../../src/client/index.js";

describe("transactions against real Postgres", () => {
  requireDatabase();
  let db: ORM;
  let setupClient: Client;

  beforeAll(async () => {
    setupClient = makeClient();
    db = new ORM({ connectionString: requireDatabase() });
    db.model("user", { table: "users" });
  });

  beforeEach(async () => {
    await resetSchema(setupClient);
  });

  afterAll(async () => {
    await db.close();
    await setupClient.close();
  });

  it("commits all writes when the callback succeeds", async () => {
    await db.transaction(async (tx) => {
      await tx.user.create({ data: { name: "A", age: 1 } });
      await tx.user.create({ data: { name: "B", age: 2 } });
    });

    const all = await db.getModel("user").findMany();
    expect(all).toHaveLength(2);
  });

  it("rolls back all writes when the callback throws", async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.user.create({ data: { name: "A", age: 1 } });
        throw new Error("simulated failure");
      })
    ).rejects.toThrow("simulated failure");

    const all = await db.getModel("user").findMany();
    expect(all).toHaveLength(0);
  });

  it("queries inside the callback see uncommitted writes from the same transaction", async () => {
    await db.transaction(async (tx) => {
      const created = await tx.user.create({ data: { name: "A", age: 1 } });
      const found = await tx.user.findUnique({ where: { id: created.id } });
      expect(found?.name).toBe("A");
    });
  });
});
