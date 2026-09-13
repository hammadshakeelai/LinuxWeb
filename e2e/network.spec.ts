import { expect, test, type Page } from "@playwright/test";
import { readConfig } from "../relay/config.ts";
import { startRelay, type Relay } from "../relay/server.ts";

const rows = (page: Page) => page.locator(".xterm-rows");
let relay: Relay;

test.beforeAll(async () => {
  // The default allowed origins include the preview server, http://localhost:4173.
  relay = await startRelay({ ...readConfig({}), port: 0 });
});

test.afterAll(async () => {
  await relay.close();
});

async function typeCommand(page: Page, command: string) {
  await page.locator(".xterm-screen").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

function homeSavedAt(): Promise<number> {
  return new Promise((resolve) => {
    const open = indexedDB.open("linuxweb");
    open.addEventListener("error", () => resolve(0));
    open.addEventListener("success", () => {
      const get = open.result.transaction("home").objectStore("home").get("current");
      get.addEventListener("error", () => resolve(0));
      get.addEventListener("success", () => resolve(get.result?.savedAt ?? 0));
    });
  });
}

test("a package installed through the relay is reinstalled after a reload", async ({ page }) => {
  await page.goto("./");
  await expect(rows(page)).toContainText("localhost:~#", { timeout: 10 * 60_000 });

  await page.getByRole("button", { name: "Network: Offline" }).click();
  await page.getByLabel("Relay address").fill(`wisp://127.0.0.1:${relay.port}/`);
  await page.getByRole("button", { name: "Save and reload" }).click();

  await expect(page.getByRole("button", { name: "Network: Online" })).toBeVisible({ timeout: 10 * 60_000 });
  await expect(rows(page)).toContainText("Network is online", { timeout: 10 * 60_000 });

  await typeCommand(page, "apk add nyancat && echo INSTALL-$((20+22))");
  await expect(rows(page)).toContainText("INSTALL-42", { timeout: 10 * 60_000 });
  await typeCommand(page, "while ! grep -qx nyancat /root/.config/linuxweb/packages; do sleep 1; done; echo TRACKED-$((20+22))");
  await expect(rows(page)).toContainText("TRACKED-42", { timeout: 2 * 60_000 });

  // Any home-folder save after the list was written includes it.
  const trackedAt = await page.evaluate(() => Date.now());
  await expect.poll(() => page.evaluate(homeSavedAt), { timeout: 60_000 }).toBeGreaterThan(trackedAt);

  await page.reload();
  await expect(page.getByTestId("status")).toContainText("Reinstalled 1 package", { timeout: 10 * 60_000 });
});
