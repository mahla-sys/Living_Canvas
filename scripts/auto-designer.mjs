import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { GoogleGenAI } from "@google/genai";

async function autoDesigner() {
  const outDir = resolve(process.cwd(), "artifacts");
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  console.log("==> Step 1: Launching Headless Chromium via Playwright...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const targetUrl = "http://localhost:3000";
  console.log(`==> Step 2: Navigating to ${targetUrl} ...`);
  await page.goto(targetUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const screenshotPath = resolve(outDir, "current_ui.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  console.log(`==> Step 3: Screenshot captured and saved to ${screenshotPath}`);
  await browser.close();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARN: GEMINI_API_KEY is not set. Visual audit screenshot saved, but AI analysis skipped.");
    return;
  }

  console.log("==> Step 4: Initializing Google GenAI (Gemini Multimodal Vision)...");
  const ai = new GoogleGenAI({ apiKey });
  const imageBuffer = readFileSync(screenshotPath);
  const base64Image = imageBuffer.toString("base64");

  const prompt = `You are a Principal Product Designer and Visual Systems Architect with expertise in modern, high-end editorial interfaces (such as Linear.app, Raycast, and tldraw).
Analyze this 1920x1080 screenshot of "Living Canvas".

Evaluate and critique the current UI across these 5 pillars:
1. Visual Hierarchy & Clutter (Containeritis, unnecessary borders, competing boxes)
2. Color & Contrast (WCAG AA accessibility, muted vs loud accents, background depth)
3. Node Card Architecture (padding, typography, badge ergonomics, header clarity)
4. Canvas Ambience (spatial feel, dot-grid presence, chrome-to-canvas ratio)
5. Actionable Design Transformations (specific, high-impact refinements to make it feel like a polished market-ready product)

Format your response as a clear, professional design audit report in Markdown with sections:
- Executive Summary
- Diagnostic Findings (Strengths vs Weaknesses)
- Prescribed Design System Rules
- Recommended Layout & Component Upgrades
`;

  console.log("==> Step 5: Sending screenshot to Gemini for visual audit...");
  const candidateModels = ["gemini-3.8-flash", "gemini-3.1-pro-preview", "gemini-flash-latest", "gemini-3.1-flash-lite"];
  let response = null;
  let usedModel = "";

  for (const model of candidateModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Trying model: ${model} (attempt ${attempt})...`);
        response = await ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                mimeType: "image/png",
                data: base64Image,
              },
            },
            prompt,
          ],
        });
        usedModel = model;
        console.log(`Successfully generated audit using ${model}`);
        break;
      } catch (err) {
        console.warn(`Model ${model} attempt ${attempt} failed: ${err?.message || err}.`);
        if (attempt < 2) await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (response) break;
  }

  if (!response) {
    throw new Error("All Gemini models failed to generate audit.");
  }

  const auditReportPath = resolve(process.cwd(), "artifacts/design-audit.md");
  const reportHeader = `# Autonomous Visual Design Audit (Playwright + Gemini Vision)
**Generated:** ${new Date().toISOString()}  
**Model:** ${usedModel}  
**Screenshot:** artifacts/current_ui.png  

---

`;
  writeFileSync(auditReportPath, reportHeader + response.text, "utf8");
  console.log(`==> Step 6: Visual Design Audit report written to ${auditReportPath}`);
  console.log("\n--- AUDIT PREVIEW ---");
  console.log(response.text.slice(0, 500) + "...\n---------------------");
}

autoDesigner().catch((err) => {
  console.error("Auto Designer execution failed:", err);
  process.exit(1);
});
