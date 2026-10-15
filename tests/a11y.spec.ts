import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

test("accessibility audit with axe-core", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const baselinePath = resolve(process.cwd(), "artifacts/a11y-baseline.json");
  writeFileSync(baselinePath, JSON.stringify(accessibilityScanResults, null, 2), "utf-8");

  console.log(`Found ${accessibilityScanResults.violations.length} accessibility violations.`);
  expect(accessibilityScanResults.violations).toBeDefined();
});
