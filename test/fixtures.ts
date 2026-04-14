import {
  test as base,
  chromium,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import * as path from "path";

const distPath = path.resolve(__dirname, "..", "dist");
const userDataDir = path.resolve(__dirname, "auth", ".user-data");

type ExtensionWorkerFixtures = {
  extensionContext: BrowserContext;
  extensionId: string;
  extensionPage: Page;
};

export const test = base.extend<{}, ExtensionWorkerFixtures>({
  extensionContext: [
    async ({}, use) => {
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: "chromium",
        headless: !process.env.HEADED,
        args: [
          `--disable-extensions-except=${distPath}`,
          `--load-extension=${distPath}`,
          "--no-first-run",
          "--disable-blink-features=AutomationControlled",
        ],
        ignoreDefaultArgs: [
          "--disable-component-extensions-with-background-pages",
        ],
      });
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],

  extensionId: [
    async ({ extensionContext }, use) => {
      let [background] = extensionContext.serviceWorkers();
      if (!background) {
        background = await extensionContext.waitForEvent("serviceworker");
      }
      const extensionId = background.url().split("/")[2];
      await use(extensionId);
    },
    { scope: "worker" },
  ],

  extensionPage: [
    async ({ extensionContext }, use) => {
      const page = await extensionContext.newPage();
      await use(page);
      await page.close();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
