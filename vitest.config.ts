// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Disable file-level parallelism for database integration tests
    fileParallelism: false,
  },
});