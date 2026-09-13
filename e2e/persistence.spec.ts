import { expect, test, type Page } from "@playwright/test";

const rows = (page: Page) => page.locator(".xterm-rows");

async function waitForPrompt(page: Page) {
  await expect(rows(page)).toContainText("localhost:~#", { timeout: 10 * 60_000 });
}

async function typeCommand(page: Page, command: string) {
  await page.locator(".xterm-screen").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

test("a file in /root survives a reload", async ({ page }) => {
  await page.goto("./");
  await waitForPrompt(page);

  await typeCommand(page, "echo hi > /root/note.txt");
  await expect(page.getByTestId("status")).toContainText("Home folder saved", { timeout: 60_000 });

  await page.reload();
  await expect(rows(page)).toContainText("Welcome back.", { timeout: 10 * 60_000 });
  await waitForPrompt(page);

  await typeCommand(page, "cat /root/note.txt");
  await expect(rows(page).locator(":scope > div").filter({ hasText: /^hi\s*$/ })).toHaveCount(1, { timeout: 60_000 });
});
