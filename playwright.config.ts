import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 20 * 60_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173/LinuxWeb/" },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/LinuxWeb/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
