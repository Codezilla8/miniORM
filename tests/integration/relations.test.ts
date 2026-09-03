import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORM } from "../../src/index.js";
import { makeClient, resetSchema, requireDatabase } from "./setup.js";
import { Client } from "../../src/client/index.js";

describe("relations against real Postgres", () => {
  requireDatabase();
  let db: ORM;
  let setupClient: Client;

  beforeAll(async () => {
    setupClient = makeClient();
    db = new ORM({ connectionString: requireDatabase() });
    db.model("user", {
      table: "users",
      relations: { posts: { kind: "hasMany", target: "post", foreignKey: "userId" } },
    });
    db.model("post", {
      table: "posts",
      relations: { author: { kind: "belongsTo", target: "user", foreignKey: "userId" } },
    });
  });

  beforeEach(async () => {
    await resetSchema(setupClient);
  });

  afterAll(async () => {
    await db.close();
    await setupClient.close();
  });

  it("loads hasMany relations via a single batched query", async () => {
    const user = db.getModel("user");
    const post = db.getModel<{ id: number; title: string; userId: number }>("post");

    const u1 = await user.create({ data: { name: "Alice", age: 30 } });
    const u2 = await user.create({ data: { name: "Bob", age: 25 } });
    await post.create({ data: { title: "Alice post 1", userId: u1.id } });
    await post.create({ data: { title: "Alice post 2", userId: u1.id } });
    await post.create({ data: { title: "Bob post 1", userId: u2.id } });

    const users = await user.findMany({ orderBy: { name: "asc" }, include: { posts: true } });

    expect(users[0]?.posts).toHaveLength(2);
    expect(users[1]?.posts).toHaveLength(1);
  });

  it("loads belongsTo relations", async () => {
    const user = db.getModel("user");
    const post = db.getModel<{ id: number; title: string; userId: number }>("post");

    const u1 = await user.create({ data: { name: "Alice", age: 30 } });
    const created = await post.create({ data: { title: "Hello", userId: u1.id } });

    const found = await post.findUnique({
      where: { id: created.id },
      include: { author: true },
    });

    const foundWithAuthor = found as unknown as { author: { name: string } };
    expect(foundWithAuthor.author.name).toBe("Alice");
  });

  it("empty parent set produces empty relation arrays, not an error", async () => {
    const user = db.getModel("user");
    const results = await user.findMany({ include: { posts: true } });
    expect(results).toEqual([]);
  });
});
