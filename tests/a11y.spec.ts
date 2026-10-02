import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("accessibility audit with axe-core", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    () => (window as unknown as { useStore?: { getState: () => { booted: boolean } } }).useStore?.getState().booted === true,
    undefined,
    { timeout: 15_000 },
  );

  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();

  const summary = violations
    .map((violation) => `${violation.id} (${violation.impact ?? "unknown impact"}): ${violation.help} — ${violation.nodes.length} affected element(s)`)
    .join("\n");
  expect(violations, summary || "axe-core found no WCAG 2.1 A/AA violations").toHaveLength(0);
});
