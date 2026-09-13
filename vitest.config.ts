import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "image/**/*.test.ts", "relay/**/*.test.ts"],
    environment: "node",
  },
});
