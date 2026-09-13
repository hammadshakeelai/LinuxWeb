import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  // The network test uses the internet; only the "Network (uses the internet)" CI job runs it.
  testIgnore: process.env.LINUXWEB_NETWORK_E2E ? [] : ["**/network.spec.ts"],
  timeout: 20 * 60_000,
  use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173/LinuxWeb/" },
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173/LinuxWeb/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
