import { defineConfig } from "vitest/config";

/**
 * Integration test files (crud/relations/transactions/migrations) all
 * connect to the SAME physical PostgreSQL database and operate on
 * identically-named tables ("users", "posts", "_miniorm_migrations").
 * Vitest's default is to run separate test FILES in parallel worker
 * processes. That's safe for the unit suite (pure functions, no shared
 * external state) but unsafe here: one file's `DROP TABLE ... CASCADE`
 * (run in its beforeEach) can execute in the middle of another file's
 * insert/query against the same tables, corrupting both.
 *
 * fileParallelism: false forces test files to run one at a time, in a
 * single process, so no two files' setup/teardown/assertions can ever
 * interleave. Within a file, tests still run sequentially by default
 * (Vitest does not parallelize tests inside one describe block unless
 * `.concurrent` is used, which we don't use here).
 */
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
