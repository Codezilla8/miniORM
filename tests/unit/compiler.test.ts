import { describe, expect, it } from "vitest";
import {
  compileDelete,
  compileInsert,
  compileSelect,
  compileUpdate,
} from "../../src/query/compiler.js";
import { InvalidIdentifierError } from "../../src/errors/index.js";

describe("compileSelect", () => {
  it("builds a plain SELECT *", () => {
    const { sql, params } = compileSelect({ table: "users" });
    expect(sql).toBe('SELECT * FROM "users"');
    expect(params).toEqual([]);
  });

  it("compiles a gt condition with a parameter, not an inline value", () => {
    const { sql, params } = compileSelect({ table: "users", where: { age: { gt: 18 } } });
    expect(sql).toBe('SELECT * FROM "users" WHERE "age" > $1');
    expect(params).toEqual([18]);
  });

  it("defaults a plain value to equality", () => {
    const { sql, params } = compileSelect({ table: "users", where: { id: 1 } });
    expect(sql).toBe('SELECT * FROM "users" WHERE "id" = $1');
    expect(params).toEqual([1]);
  });

  it("ANDs multiple conditions in declaration order", () => {
    const { sql, params } = compileSelect({
      table: "users",
      where: { age: { gte: 18 }, name: "Jay" },
    });
    expect(sql).toBe('SELECT * FROM "users" WHERE "age" >= $1 AND "name" = $2');
    expect(params).toEqual([18, "Jay"]);
  });

  it("compiles IN with multiple placeholders", () => {
    const { sql, params } = compileSelect({ table: "users", where: { id: { in: [1, 2, 3] } } });
    expect(sql).toBe('SELECT * FROM "users" WHERE "id" IN ($1, $2, $3)');
    expect(params).toEqual([1, 2, 3]);
  });

  it("compiles an empty IN() as an always-false predicate, not invalid SQL", () => {
    const { sql, params } = compileSelect({ table: "users", where: { id: { in: [] } } });
    expect(sql).toBe('SELECT * FROM "users" WHERE 1 = 0');
    expect(params).toEqual([]);
  });

  it("compiles isNull true/false", () => {
    expect(compileSelect({ table: "users", where: { deletedAt: { isNull: true } } }).sql).toBe(
      'SELECT * FROM "users" WHERE "deletedAt" IS NULL'
    );
    expect(compileSelect({ table: "users", where: { deletedAt: { isNull: false } } }).sql).toBe(
      'SELECT * FROM "users" WHERE "deletedAt" IS NOT NULL'
    );
  });

  it("compiles ORDER BY, LIMIT, OFFSET with limit/offset parameterized", () => {
    const { sql, params } = compileSelect({
      table: "users",
      orderBy: { name: "asc" },
      limit: 10,
      offset: 5,
    });
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "name" ASC LIMIT $1 OFFSET $2');
    expect(params).toEqual([10, 5]);
  });

  it("rejects an unsafe table identifier", () => {
    expect(() => compileSelect({ table: "users; DROP TABLE users;--" })).toThrow(
      InvalidIdentifierError
    );
  });
});

describe("SQL injection resistance", () => {
  it("never lets a malicious value alter query structure", () => {
    const malicious = "'; DROP TABLE users; --";
    const { sql, params } = compileSelect({ table: "users", where: { name: malicious } });
    // The payload must appear ONLY as a bound parameter, never in the SQL text.
    expect(sql).toBe('SELECT * FROM "users" WHERE "name" = $1');
    expect(sql).not.toContain("DROP TABLE");
    expect(params).toEqual([malicious]);
  });

  it("parameterizes malicious values inside IN()", () => {
    const malicious = "1) OR (1=1";
    const { sql, params } = compileSelect({ table: "users", where: { id: { in: [malicious] } } });
    expect(sql).toBe('SELECT * FROM "users" WHERE "id" IN ($1)');
    expect(params).toEqual([malicious]);
  });

  it("rejects malicious column names used as identifiers", () => {
    expect(() =>
      compileSelect({ table: "users", where: { "id; DROP TABLE users;--": 1 } })
    ).toThrow(InvalidIdentifierError);
  });
});

describe("compileInsert", () => {
  it("builds parameterized INSERT ... RETURNING *", () => {
    const { sql, params } = compileInsert({ table: "users", data: { name: "Jay", age: 21 } });
    expect(sql).toBe('INSERT INTO "users" ("name", "age") VALUES ($1, $2) RETURNING *');
    expect(params).toEqual(["Jay", 21]);
  });
});

describe("compileUpdate", () => {
  it("builds parameterized UPDATE ... WHERE ... RETURNING *", () => {
    const { sql, params } = compileUpdate({
      table: "users",
      data: { age: 22 },
      where: { id: 1 },
    });
    expect(sql).toBe('UPDATE "users" SET "age" = $1 WHERE "id" = $2 RETURNING *');
    expect(params).toEqual([22, 1]);
  });
});

describe("compileDelete", () => {
  it("builds parameterized DELETE ... WHERE ... RETURNING *", () => {
    const { sql, params } = compileDelete({ table: "users", where: { id: 1 } });
    expect(sql).toBe('DELETE FROM "users" WHERE "id" = $1 RETURNING *');
    expect(params).toEqual([1]);
  });
});
