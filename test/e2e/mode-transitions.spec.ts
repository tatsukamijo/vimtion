import { test, expect } from "../fixtures";
import {
  navigateToTestPage,
  waitForMode,
  waitForBodyClass,
  pressKeys,
  getModeText,
} from "../helpers";

test.describe.serial("Mode transitions", () => {
  let initialized = false;

  test.beforeEach(async ({ extensionPage: page }) => {
    if (!initialized) {
      await navigateToTestPage(page);
      initialized = true;
    }
    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
  });

  test("Normal → Insert (i)", async ({ extensionPage: page }) => {
    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    const text = await getModeText(page);
    expect(text).toContain("-- INSERT --");
    await waitForBodyClass(page, "vim-insert-mode");
  });

  test("Insert → Normal (Escape)", async ({ extensionPage: page }) => {
    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await waitForBodyClass(page, "vim-normal-mode");
  });

  test.skip("Insert → Normal (jk escape sequence)", async ({ extensionPage: page }) => {
    await pressKeys(page, "i");
    await waitForMode(page, "insert");

    await page.keyboard.press("j");
    await page.waitForTimeout(10);
    await page.keyboard.press("k");
    await waitForMode(page, "normal", 3_000);
  });

  test("Normal → Visual (v)", async ({ extensionPage: page }) => {
    await pressKeys(page, "v");
    await waitForMode(page, "visual");

    const text = await getModeText(page);
    expect(text).toContain("-- VISUAL --");
    await waitForBodyClass(page, "vim-visual-mode");
  });

  test("Visual → Normal (Escape)", async ({ extensionPage: page }) => {
    await pressKeys(page, "v");
    await waitForMode(page, "visual");

    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await waitForBodyClass(page, "vim-normal-mode");
  });

  test("Normal → Visual Line (V)", async ({ extensionPage: page }) => {
    await pressKeys(page, "Shift+V");
    await waitForMode(page, "visual-line");

    const text = await getModeText(page);
    expect(text).toContain("-- VISUAL-LINE --");
    await waitForBodyClass(page, "vim-visual-line-mode");
  });

  test("Visual Line → Normal (Escape)", async ({ extensionPage: page }) => {
    await pressKeys(page, "Shift+V");
    await waitForMode(page, "visual-line");

    await pressKeys(page, "Escape");
    await waitForMode(page, "normal");
    await waitForBodyClass(page, "vim-normal-mode");
  });
});
