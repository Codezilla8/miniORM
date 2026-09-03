import { describe, expect, it } from "vitest";
import { assertSafeIdentifier, quoteIdentifier } from "../../src/utils/identifier.js";
import { InvalidIdentifierError } from "../../src/errors/index.js";

describe("identifier validation", () => {
  it("accepts normal identifiers", () => {
    expect(assertSafeIdentifier("users")).toBe("users");
    expect(assertSafeIdentifier("user_id")).toBe("user_id");
    expect(assertSafeIdentifier("_private")).toBe("_private");
  });

  it("rejects identifiers with SQL syntax characters", () => {
    expect(() => assertSafeIdentifier("users; DROP TABLE users;--")).toThrow(
      InvalidIdentifierError
    );
    expect(() => assertSafeIdentifier('users" OR "1"="1')).toThrow(InvalidIdentifierError);
    expect(() => assertSafeIdentifier("users)")).toThrow(InvalidIdentifierError);
  });

  it("rejects identifiers starting with a digit", () => {
    expect(() => assertSafeIdentifier("1users")).toThrow(InvalidIdentifierError);
  });

  it("quotes valid identifiers with double quotes", () => {
    expect(quoteIdentifier("users")).toBe('"users"');
  });
});
