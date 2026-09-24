import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

async function simulateRealUser() {
  const screenshotDir = resolve(process.cwd(), "artifacts/user-testing-screenshots");
  if (!existsSync(screenshotDir)) {
    mkdirSync(screenshotDir, { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    steps: [],
    consoleMessages: [],
    errors: [],
    networkRequests: [],
    findings: [],
  };

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(6000); // 6s max timeout for any action

  page.on("console", (msg) => {
    report.consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === "error") {
      report.errors.push(`Console Error: ${msg.text()}`);
      console.error(`[Browser Console Error]: ${msg.text()}`);
    }
  });

  page.on("pageerror", (err) => {
    report.errors.push(`Page Uncaught: ${err.message}`);
    console.error(`[Browser Page Error]: ${err.message}`);
  });

  page.on("requestfailed", (req) => {
    report.networkRequests.push({ url: req.url(), failure: req.failure()?.errorText });
  });

  page.on("response", (res) => {
    if (res.url().includes("completions") || res.url().includes("api.") || res.status() >= 400) {
      report.networkRequests.push({ url: res.url(), status: res.status() });
      console.log(`[Network]: ${res.status()} ${res.url()}`);
    }
  });

  console.log("=== Step 1: Initial App Load ===");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(screenshotDir, "01-initial-app.png") });
  report.steps.push({ step: 1, name: "Initial Load", success: true });

  const initialNodes = await page.locator(".react-flow__node").count();
  console.log(`Initial node count on canvas: ${initialNodes}`);

  console.log("=== Step 2: Open Palette / Library & Add Nodes ===");
  // Activity bar buttons
  const libraryTab = page.locator('button:has-text("Library"), button:has-text("Palette"), button[title*="Library"]').first();
  if (await libraryTab.isVisible().catch(() => false)) {
    await libraryTab.click();
    await page.waitForTimeout(400);
  }

  // Click 'Agent' to add an agent node
  const agentPaletteItem = page.locator('div:has-text("Agent")').last();
  if (await agentPaletteItem.isVisible().catch(() => false)) {
    console.log("Clicking 'Agent' in palette to add agent node...");
    await agentPaletteItem.click();
    await page.waitForTimeout(500);
  }

  // Click 'Note' to add a note
  const notePaletteItem = page.locator('div:has-text("Note")').last();
  if (await notePaletteItem.isVisible().catch(() => false)) {
    console.log("Clicking 'Note' in palette to add note node...");
    await notePaletteItem.click();
    await page.waitForTimeout(500);
  }

  await page.screenshot({ path: resolve(screenshotDir, "02-nodes-added.png") });
  const postAddNodes = await page.locator(".react-flow__node").count();
  console.log(`Node count after adding: ${postAddNodes}`);
  report.steps.push({ step: 2, name: "Add Nodes from Palette", count: postAddNodes });

  console.log("=== Step 3: Inspect Node & Check Tabs ===");
  const nodes = page.locator(".react-flow__node");
  if (await nodes.count() > 0) {
    const targetNode = nodes.first();
    await targetNode.click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(screenshotDir, "03-inspector-open.png") });

    // Try clicking inspector tabs (Agent Config, Logs, Run Info, etc.)
    const configTab = page.locator('button:has-text("Config"), button:has-text("Agent Config")').first();
    if (await configTab.isVisible().catch(() => false)) {
      await configTab.click();
      await page.waitForTimeout(300);
    }

    const logsTab = page.locator('button:has-text("Logs")').first();
    if (await logsTab.isVisible().catch(() => false)) {
      await logsTab.click();
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(screenshotDir, "04-inspector-logs.png") });
    }
    report.steps.push({ step: 3, name: "Inspect Node", success: true });
  }

  console.log("=== Step 4: Test Chat with Agent ===");
  // Check if chat panel or chat tab is open
  const chatTab = page.locator('button:has-text("Chat"), button[title*="Chat"]').first();
  if (await chatTab.isVisible().catch(() => false)) {
    await chatTab.click();
    await page.waitForTimeout(500);
  }

  const chatInput = page.locator('input[placeholder*="Ask"], input[placeholder*="Message"], textarea').first();
  if (await chatInput.isVisible().catch(() => false)) {
    console.log("Typing question to agent...");
    await chatInput.fill("Please analyze what tasks we should execute next.");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve(screenshotDir, "05-chat-response.png") });
    report.steps.push({ step: 4, name: "Chat Interaction", success: true });
  }

  console.log("=== Step 5: Test Execution (Run Button) ===");
  const runBtn = page.locator('button:has-text("Run"), button[title*="Run"]').first();
  if (await runBtn.isVisible().catch(() => false)) {
    console.log("Triggering Run execution...");
    await runBtn.click();
    await page.waitForTimeout(4000); // Wait for pipeline steps
    await page.screenshot({ path: resolve(screenshotDir, "06-after-run.png") });
    report.steps.push({ step: 5, name: "Execution Run", success: true });
  }

  console.log("=== Step 6: Test Settings Modal & Model Providers ===");
  const settingsBtn = page.locator('button[title*="Settings"], button:has-text("Settings")').first();
  if (await settingsBtn.isVisible().catch(() => false)) {
    await settingsBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(screenshotDir, "07-settings-modal.png") });

    // Select Gemini provider
    const geminiBtn = page.locator('button:has-text("Gemini")').first();
    if (await geminiBtn.isVisible().catch(() => false)) {
      console.log("Selecting Gemini provider in Settings...");
      await geminiBtn.click();
      await page.waitForTimeout(300);
    }

    const saveBtn = page.locator('button:has-text("Save settings")').first();
    if (await saveBtn.isVisible().catch(() => false)) {
      console.log("Saving settings and closing modal...");
      await saveBtn.click();
      await page.waitForTimeout(500);
    } else {
      const closeBtn = page.locator('button:has-text("Close"), button[aria-label="Close"]').first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click();
        await page.waitForTimeout(300);
      }
    }
    report.steps.push({ step: 6, name: "Settings & Gemini Provider", success: true });
  }

  console.log("=== Step 7: Drawing / Pen Tools ===");
  await page.keyboard.press("Escape").catch(() => {});
  const penBtn = page.locator('button[title*="Pen"], button:has-text("Draw"), button[title*="Draw"]').first();
  if (await penBtn.isVisible().catch(() => false)) {
    console.log("Toggling Pen mode...");
    await penBtn.click({ force: true });
    await page.waitForTimeout(400);

    // Draw a stroke on canvas
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(400, 350, { steps: 5 });
    await page.mouse.move(500, 320, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(screenshotDir, "08-drawing-test.png") });
    report.steps.push({ step: 7, name: "Drawing Mode", success: true });
  }

  // Done
  await page.screenshot({ path: resolve(screenshotDir, "09-final-overview.png") });
  await browser.close();

  const reportPath = resolve(process.cwd(), "artifacts/user-testing-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log("=== Simulation Complete! Report written to artifacts/user-testing-report.json ===");
}

simulateRealUser().catch((err) => {
  console.error("Simulation failed:", err);
  process.exit(1);
});
