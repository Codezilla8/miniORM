import { describe, expect, it } from "vitest";
import { normalizeWhere } from "../../src/query/where.js";

describe("normalizeWhere", () => {
  it("returns an empty array for undefined", () => {
    expect(normalizeWhere(undefined)).toEqual([]);
  });

  it("defaults a plain value to eq", () => {
    expect(normalizeWhere({ id: 1 })).toEqual([{ field: "id", operator: "eq", value: 1 }]);
  });

  it("expands an operator object", () => {
    expect(normalizeWhere({ age: { gt: 18 } })).toEqual([
      { field: "age", operator: "gt", value: 18 },
    ]);
  });

  it("expands multiple operators on the same field independently", () => {
    const result = normalizeWhere({ age: { gt: 18, lt: 65 } });
    expect(result).toContainEqual({ field: "age", operator: "gt", value: 18 });
    expect(result).toContainEqual({ field: "age", operator: "lt", value: 65 });
  });

  it("treats an array value as eq, not as an operator object", () => {
    // arrays are used with the `in` operator explicitly, not as a bare value
    expect(normalizeWhere({ tag: ["a", "b"] })).toEqual([
      { field: "tag", operator: "eq", value: ["a", "b"] },
    ]);
  });
});
