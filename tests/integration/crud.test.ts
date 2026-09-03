import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORM } from "../../src/index.js";
import { makeClient, resetSchema, requireDatabase } from "./setup.js";
import { Client } from "../../src/client/index.js";

describe("CRUD against real Postgres", () => {
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

  it("creates and finds a record", async () => {
    const created = await db.getModel("user").create({ data: { name: "Jay", age: 21 } });
    expect(created.name).toBe("Jay");

    const found = await db.getModel("user").findUnique({ where: { id: created.id } });
    expect(found?.name).toBe("Jay");
  });

  it("findMany filters, orders, and limits", async () => {
    const user = db.getModel("user");
    await user.create({ data: { name: "A", age: 30 } });
    await user.create({ data: { name: "B", age: 15 } });
    await user.create({ data: { name: "C", age: 25 } });

    const adults = await user.findMany({
      where: { age: { gt: 18 } },
      orderBy: { name: "asc" },
      limit: 10,
    });

    expect(adults.map((u) => u.name)).toEqual(["A", "C"]);
  });

  it("updates a record", async () => {
    const user = db.getModel("user");
    const created = await user.create({ data: { name: "Jay", age: 21 } });
    const updated = await user.update({ where: { id: created.id }, data: { age: 22 } });
    expect(updated[0]?.age).toBe(22);
  });

  it("deletes a record", async () => {
    const user = db.getModel("user");
    const created = await user.create({ data: { name: "Jay", age: 21 } });
    await user.delete({ where: { id: created.id } });
    const found = await user.findUnique({ where: { id: created.id } });
    expect(found).toBeNull();
  });

  it("rejects SQL injection attempts in values without altering query structure", async () => {
    const user = db.getModel("user");
    const malicious = "Robert'); DROP TABLE users;--";
    const created = await user.create({ data: { name: malicious, age: 10 } });
    expect(created.name).toBe(malicious);

    // Table must still exist and be queryable.
    const all = await user.findMany();
    expect(all.length).toBe(1);
  });
});
