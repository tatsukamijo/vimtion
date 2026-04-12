import { test, expect } from "../fixtures";
import { navigateToTestPage, getVimState, waitForMode, getModeText } from "../helpers";

test.describe("Smoke test", () => {
  test("extension loads and enters normal mode", async ({ page }) => {
    await navigateToTestPage(page);
    await waitForMode(page, "normal");

    const rawText = await getModeText(page);
    console.log("Status bar text:", JSON.stringify(rawText));

    const state = await getVimState(page);
    console.log("Parsed state:", JSON.stringify(state));

    expect(state.mode).toBe("normal");
    expect(state.lineCount).toBeGreaterThan(0);
  });
});
