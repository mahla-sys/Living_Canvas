import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

async function run() {
  const outDir = resolve(process.cwd(), "artifacts/screenshots");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  // 1. Default desktop (1920x1080)
  const contextDesktop = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await contextDesktop.newPage();
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: resolve(outDir, "01-default-1080p.png") });
  console.log("Captured 01-default-1080p.png");

  // 2. Click node (use mouse click at coordinate or force: true)
  try {
    const node = page.locator(".react-flow__node").first();
    if (await node.count() > 0) {
      const box = await node.boundingBox();
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(500);
        await page.screenshot({ path: resolve(outDir, "02-node-selected.png") });
        console.log("Captured 02-node-selected.png");
      }
    }
  } catch (e) {
    console.warn("Node click skipped:", e.message);
  }

  // 3. Mobile viewport (375x812)
  const contextMobile = await browser.newContext({
    viewport: { width: 375, height: 812 },
  });
  const mobilePage = await contextMobile.newPage();
  await mobilePage.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await mobilePage.waitForTimeout(1500);
  await mobilePage.screenshot({ path: resolve(outDir, "03-mobile-375px.png") });
  console.log("Captured 03-mobile-375px.png");

  await browser.close();
  console.log("Done capturing screenshots.");
}

run().catch((err) => {
  console.error("Capture states failed:", err);
  process.exit(1);
});
