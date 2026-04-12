import { test as setup, chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const distPath = path.resolve(__dirname, "..", "dist");
const userDataDir = path.resolve(__dirname, "auth", ".user-data");

setup("authenticate with Notion", async () => {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: false,
    args: [
      `--disable-extensions-except=${distPath}`,
      `--load-extension=${distPath}`,
      "--no-first-run",
    ],
    ignoreDefaultArgs: [
      "--disable-component-extensions-with-background-pages",
    ],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto("https://www.notion.so");

  const isLoggedIn = await Promise.race([
    page
      .waitForURL(/notion\.so\/(?!login)/, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false),
    page
      .waitForURL("**/login**", { timeout: 5_000 })
      .then(() => false)
      .catch(() => true),
  ]);

  if (!isLoggedIn) {
    console.log("\n========================================");
    console.log("Manual login required.");
    console.log("Log in to Notion in the browser window.");
    console.log("Then close Playwright Inspector to continue.");
    console.log("========================================\n");

    await page.pause();
  }

  const url = page.url();
  const loggedIn =
    url.includes("notion.so") && !url.includes("/login");

  if (!loggedIn) {
    await page.waitForURL(/notion\.so\/(?!login)/, { timeout: 30_000 });
  }

  console.log("Notion authentication successful. Session saved.");
  await context.close();
});
