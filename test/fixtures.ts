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

/**
 * Resolve whether this worker should launch Chromium headless.
 *
 * Resolution order (first match wins):
 *   1. process.env.PW_HEADLESS — explicit env override:
 *        PW_HEADLESS=false → headed
 *        PW_HEADLESS=true  → headless
 *   2. workerInfo.project.metadata.headless — per-project setting from
 *        playwright.config.ts (this is how `e2e-headed` opts into headed mode).
 *   3. Default → headless (matches pre-Gap-2 behavior).
 *
 * See playwright.config.ts top comment for the headed/headless lane setup.
 */
function resolveHeadless(metadata: unknown): boolean {
  const envOverride = process.env.PW_HEADLESS;
  if (envOverride === "false") return false;
  if (envOverride === "true") return true;

  const projectHeadless = (metadata as { headless?: boolean } | undefined)
    ?.headless;
  if (typeof projectHeadless === "boolean") return projectHeadless;

  return true;
}

export const test = base.extend<{}, ExtensionWorkerFixtures>({
  extensionContext: [
    async ({}, use, workerInfo) => {
      const headless = resolveHeadless(workerInfo.project.metadata);
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: "chromium",
        headless,
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
