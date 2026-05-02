import { test as setup, chromium } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";
import { createTestPage, deleteTestPage } from "./setup-test-page";

const distPath = path.resolve(__dirname, "..", "dist");
const userDataDir = path.resolve(__dirname, "auth", ".user-data");
const envPath = path.resolve(__dirname, ".env");

function loadEnv() {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex);
        const value = trimmed.slice(eqIndex + 1);
        process.env[key] = value;
      }
    }
  }
}

function saveEnvVar(key: string, value: string) {
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf-8");
    const regex = new RegExp(`^${key}=.*$`, "m");
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content = content.trimEnd() + `\n${key}=${value}\n`;
    }
  } else {
    content = `${key}=${value}\n`;
  }
  fs.writeFileSync(envPath, content);
  process.env[key] = value;
}

setup("authenticate with Notion", async () => {
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Setup runs in headless mode by default. Set PW_HEADLESS=false when
  // first-time manual login is required (the auth project pauses for the
  // user to complete login in a real window). See playwright.config.ts.
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: process.env.PW_HEADLESS !== "false",
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

setup("create test page via Notion API", async () => {
  loadEnv();

  const apiKey = process.env.NOTION_API_KEY;
  const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

  if (!apiKey || !parentPageId) {
    console.log("Skipping test page creation: NOTION_API_KEY or NOTION_PARENT_PAGE_ID not set in test/.env");
    return;
  }

  // Delete previous test page if it exists
  const prevPageId = process.env.NOTION_TEST_PAGE_ID;
  if (prevPageId) {
    try {
      await deleteTestPage(apiKey, prevPageId);
      console.log(`Deleted previous test page: ${prevPageId}`);
    } catch (e) {
      console.log(`Could not delete previous test page: ${e}`);
    }
  }

  // Create fresh test page
  const { pageId, url } = await createTestPage(apiKey, parentPageId);

  // Convert app.notion.com URL to www.notion.so URL for browser access
  const browserUrl = url.replace("https://app.notion.com/", "https://www.notion.so/");

  saveEnvVar("NOTION_TEST_PAGE_ID", pageId);
  saveEnvVar("NOTION_TEST_PAGE_URL", browserUrl);

  console.log(`Created test page: ${browserUrl}`);
  console.log(`Page ID: ${pageId}`);
});
