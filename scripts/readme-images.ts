// Renders docs/banner.png from docs/banner.html and captures docs/screenshot.png
// from a running preview (start `npm run preview` first).
import { chromium } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const browser = await chromium.launch();

const banner = await browser.newPage({ viewport: { width: 1280, height: 320 }, deviceScaleFactor: 2 });
await banner.goto(pathToFileURL(root("docs/banner.html")).href);
await banner.screenshot({ path: root("docs/banner.png") });

const app = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await app.goto("http://localhost:4173/LinuxWeb/");
await app.locator(".xterm-rows").getByText("localhost:~#").first().waitFor({ timeout: 10 * 60_000 });
await app.locator(".xterm-screen").click();
await app.keyboard.type("help");
await app.keyboard.press("Enter");
// The tour is taller than the window, so wait for its last line rather than its heading.
await app.locator(".xterm-rows").getByText("Compiling and starting databases is slow").waitFor({ timeout: 60_000 });
await app.screenshot({ path: root("docs/screenshot.png") });

await browser.close();
console.log("Wrote docs/banner.png and docs/screenshot.png");
