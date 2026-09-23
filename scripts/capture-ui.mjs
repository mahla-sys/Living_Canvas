import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function run() {
  const outDir = resolve(process.cwd(), "artifacts");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  console.log("Navigating to http://localhost:3000 ...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const screenshotPath = resolve(outDir, "current_ui.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log("Screenshot successfully saved to:", screenshotPath);

  await browser.close();
}

run().catch((err) => {
  console.error("Capture failed:", err);
  process.exit(1);
});
