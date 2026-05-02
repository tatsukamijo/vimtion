/**
 * Playwright config for the Vimtion E2E suite.
 *
 * --------------------------------------------------------------------------
 * Headless / headed lanes (Gap 2 from docs/test-overhaul/env-gaps.md)
 * --------------------------------------------------------------------------
 *
 * Default: only the `e2e-headless` lane runs (`npm test`).
 *
 * Opt-in headed parity lane: set RUN_HEADED=1 to additionally run the
 * `e2e-headed` lane against the same specs in a real-window Chromium.
 * BUG-008/009/011 fail only headless; the moment a future bug fails only
 * headed — or vice versa — the divergence will be visible by comparing
 * the two lanes.
 *
 *     npm test                   # headless only (default; CI-cheap)
 *     RUN_HEADED=1 npm test      # both lanes (~2× runtime)
 *
 * The setup project respects PW_HEADLESS:
 *
 *     PW_HEADLESS=false npm run test:setup-auth   # headed for manual login
 *
 * Per-project headedness is communicated to the worker fixture via
 * `metadata.headless`; see test/fixtures.ts for the resolution order.
 * --------------------------------------------------------------------------
 */

import { defineConfig } from "@playwright/test";
import * as path from "path";
import * as fs from "fs";

const envPath = path.resolve(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex > 0) {
        const key = trimmed.slice(0, eqIndex);
        const value = trimmed.slice(eqIndex + 1);
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

const RUN_HEADED =
  process.env.RUN_HEADED === "1" || process.env.RUN_HEADED === "true";

const e2eProjects = [
  {
    name: "e2e-headless",
    dependencies: ["setup"],
    testDir: "./e2e",
    metadata: { headless: true },
  },
];

if (RUN_HEADED) {
  e2eProjects.push({
    name: "e2e-headed",
    dependencies: ["setup"],
    testDir: "./e2e",
    metadata: { headless: false },
  });
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  // workers: 1 keeps the headed and headless lanes from racing for the
  // shared `auth/.user-data` profile. Don't bump without addressing that.
  workers: 1,
  reporter: "html",
  outputDir: "./test-results",

  use: {
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /global-setup\.ts/,
      testDir: ".",
    },
    ...e2eProjects,
  ],
});
