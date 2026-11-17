// Takes demo-mode screenshots at phone width.
// Start the app first:  npm run demo   (then: npm run screenshots)

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const OUT_DIR = process.env.OUT_DIR || "docs/screenshots";

/** Saves a full-page screenshot and logs its path. */
async function shot(page, name) {
  const path = `${OUT_DIR}/${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log(`saved ${path}`);
  return path;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await shot(page, "1-sign-in");

  await page.getByRole("link", { name: /enter demo|connect with strava/i }).click();
  await page.waitForSelector(".week");
  await shot(page, "2-current-week");

  await page.getByRole("button", { name: "Previous week" }).click();
  await page.waitForSelector("text=Week 1");
  await shot(page, "3-past-week");

  await page.locator(".session-main", { hasText: "@ 4:40" }).first().click();
  await page.waitForSelector(".sheet");
  await page.screenshot({ path: `${OUT_DIR}/4-run-sheet.png` });
  console.log(`saved ${OUT_DIR}/4-run-sheet.png`);
  await page.getByRole("button", { name: "Close" }).click();

  await page.locator(".session-main", { hasText: "Strength - main" }).first().click();
  await page.waitForSelector(".sheet");
  await page.screenshot({ path: `${OUT_DIR}/5-strength-sheet.png` });
  console.log(`saved ${OUT_DIR}/5-strength-sheet.png`);

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
