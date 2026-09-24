import { chromium } from "playwright";
import { resolve } from "node:path";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";

async function simulateHumanUser() {
  const artifactsDir = resolve(process.cwd(), "artifacts/walkthrough");
  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  const findings = [];
  const consoleErrors = [];
  const consoleWarnings = [];
  const userActions = [];

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(9000);

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
      console.log(`[Browser Console Error]: ${msg.text()}`);
    } else if (msg.type() === "warning") {
      consoleWarnings.push(msg.text());
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(`Uncaught: ${err.message}`);
    console.log(`[Uncaught Page Error]: ${err.message}`);
  });

  console.log("=== Phase 1: Human User Explores App Shell & Navigation ===");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: resolve(artifactsDir, "01-initial-view.png") });
  userActions.push("Opened Living Canvas in browser");

  // 1. Check Top Bar Header & Obsidian Tab
  const header = page.locator('header').first();
  const headerText = await header.textContent();
  console.log("Header text:", headerText.trim().replace(/\s+/g, " "));

  // 2. Test Ribbon Icons
  console.log("--> Testing 40px Activity Ribbon...");
  const ribbonBtns = page.locator('aside[data-lc-ribbon="true"] button, div[data-lc-ribbon="true"] button');
  const ribbonCount = await ribbonBtns.count();
  console.log(`Ribbon buttons count: ${ribbonCount}`);

  for (let i = 0; i < ribbonCount; i++) {
    const btn = ribbonBtns.nth(i);
    const title = await btn.getAttribute("title");
    console.log(`  Clicking ribbon action [${i}]: ${title}`);
    await btn.click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(artifactsDir, `02-ribbon-${i}.png`) });
    userActions.push(`Clicked Ribbon button: ${title}`);

    // If modal opened (e.g. Memory Vault or Settings), close it before clicking next
    const modalBackdrop = page.locator('.fixed.inset-0.z-50').first();
    if (await modalBackdrop.isVisible().catch(() => false)) {
      console.log("    Dismissing open modal via Escape key...");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
    }
  }

  // If settings modal is open, inspect and close it
  const settingsClose = page.locator('button[aria-label="Close"], button:has-text("Close"), button:has-text("Save settings")').first();
  if (await settingsClose.isVisible().catch(() => false)) {
    console.log("  Closing Settings dialog...");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }

  // 3. Test Excalidraw Toolbar
  console.log("=== Phase 2: Testing Excalidraw Toolbar & Drawing ===");
  const toolbarButtons = page.locator('div.anim-pop button, div.select-none.anim-pop button');
  const tbCount = await toolbarButtons.count();
  console.log(`Toolbar buttons count: ${tbCount}`);

  // Test Selection tool (1)
  const selBtn = page.locator('button[title*="Selection pointer"]').first();
  if (await selBtn.isVisible().catch(() => false)) {
    await selBtn.click();
    await page.waitForTimeout(300);
  }

  // Test Hand tool (2)
  const handBtn = page.locator('button[title*="Hand pan"]').first();
  if (await handBtn.isVisible().catch(() => false)) {
    await handBtn.click();
    await page.waitForTimeout(300);
  }

  // Test Drawing / Pen tool (6)
  const penBtn = page.locator('button[title*="Freehand Draw"], button[title*="Pen"]').first();
  if (await penBtn.isVisible().catch(() => false)) {
    console.log("  Engaging Freehand Pen tool (6)...");
    await penBtn.click();
    await page.waitForTimeout(300);

    // Draw a stroke on the canvas
    await page.mouse.move(450, 250);
    await page.mouse.down();
    await page.mouse.move(550, 300, { steps: 6 });
    await page.mouse.move(600, 280, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(400);
    await page.screenshot({ path: resolve(artifactsDir, "03-drawing-stroke.png") });
    userActions.push("Drew a stroke in freehand mode");

    // Exit drawing mode back to selection
    if (await selBtn.isVisible().catch(() => false)) {
      console.log("  Exiting drawing mode back to Selection pointer (1)...");
      await selBtn.click();
      await page.waitForTimeout(300);
    }
  }

  // 4. Test Node Selection & Right Inspector Tabs
  console.log("=== Phase 3: Selecting Canvas Node & Inspecting Tabs ===");
  const nodeTitle = page.locator('.react-flow__node h3').first();
  if (await nodeTitle.isVisible().catch(() => false)) {
    console.log("  Clicking node to inspect...");
    await nodeTitle.click({ force: true });
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(artifactsDir, "04-node-inspector.png") });
    userActions.push("Selected canvas node to inspect");

    // Click through inspector tabs
    const tabs = page.locator('aside button:has-text("Config"), aside button:has-text("Status"), aside button:has-text("Diary"), aside button:has-text("Logs")');
    const tabCount = await tabs.count();
    console.log(`  Found ${tabCount} inspector tabs.`);
    for (let t = 0; t < tabCount; t++) {
      const tab = tabs.nth(t);
      const name = await tab.textContent();
      console.log(`  Opening inspector tab: ${name}`);
      await tab.click().catch(() => {});
      await page.waitForTimeout(300);
    }
  } else {
    findings.push({ area: "Canvas", issue: "No node title visible to click for inspection." });
  }

  // 5. Test Copilot Chat
  console.log("=== Phase 4: Testing Copilot Assistant ===");
  const copilotBtn = page.locator('button:has-text("Copilot")').first();
  if (await copilotBtn.isVisible().catch(() => false)) {
    console.log("  Opening Copilot panel...");
    await copilotBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: resolve(artifactsDir, "05-copilot-open.png") });

    const chatInput = page.locator('input[placeholder*="Ask"], input[placeholder*="Message"], textarea').first();
    if (await chatInput.isVisible().catch(() => false)) {
      console.log("  Sending prompt to Copilot...");
      await chatInput.fill("What is the state of the canvas and how can we search for freelance projects?");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(2000);
      await page.screenshot({ path: resolve(artifactsDir, "06-copilot-replied.png") });
      userActions.push("Interacted with Copilot chat");
    }
  }

  // 6. Programmatically Construct the User's AI Pipeline via App Store
  console.log("=== Phase 5: Building Multi-Agent Project Search & Proposal Pipeline ===");
  const pipelineResult = await page.evaluate(async () => {
    const store = window.__LC_STORE__ || window.useStore;
    if (!store) return { success: false, reason: "Store not globally exposed, using window store" };
    const state = store.getState();
    const actions = state.actions;

    // Reset or clean canvas for fresh 4-agent pipeline
    const scoutId = "agent-scout-01";
    const filterId = "agent-filter-02";
    const proposalId = "agent-proposal-03";
    const alignmentId = "agent-align-04";

    // 1. Scout Agent (Search)
    const scoutNode = {
      id: scoutId,
      type: "lc",
      position: { x: 80, y: 180 },
      data: {
        title: "1. Project Discovery Scout",
        nodeType: "agent",
        shape: "rectangle",
        color: "#e8b04b",
        viewMode: "card",
        content: "Searches for matching freelance projects and contract roles across platforms based on core technical competencies.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lock: { status: "free", locked_by: null, locked_at: null },
        agent: {
          role_id: "understander",
          model: "gemini-3.6-flash",
          system_prompt: "You are the Project Scout. Discover and compile relevant high-value project listings (TypeScript, React, AI, Cloud). List titles, clients, budgets, and core requirements.",
          temperature: 0.7,
          max_tokens: 1200,
          max_steps: 6,
          tools: ["read_memory", "write_memory", "write_output"],
          context_contract: {
            allowed_read_paths: ["canvas-overview.md", "memory/user.md", `memory/agents/${scoutId}.md`],
            allowed_write_paths: [`memory/agents/${scoutId}.md`, `outputs/${scoutId}/summary.md`],
            output_contract: {
              save_to: `outputs/${scoutId}/`,
              format: "json",
              required_fields: ["summary", "problem_statement", "questions_asked"],
            },
          },
          status: "idle",
        },
      },
    };

    // 2. Filter & Ranker Agent
    const filterNode = {
      id: filterId,
      type: "lc",
      position: { x: 420, y: 180 },
      data: {
        title: "2. Project Filter & Ranker",
        nodeType: "agent",
        shape: "diamond",
        color: "#6fb3c7",
        viewMode: "card",
        content: "Filters raw project listings by tech stack match, budget feasibility, and client credibility.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lock: { status: "free", locked_by: null, locked_at: null },
        agent: {
          role_id: "risk-analyst",
          model: "gemini-3.6-flash",
          system_prompt: "You are the Project Evaluation & Filter Agent. Analyze projects found by the Scout. Score suitability from 1 to 10 and select top 3 candidates.",
          temperature: 0.5,
          max_tokens: 1200,
          max_steps: 6,
          tools: ["read_memory", "write_memory", "write_output"],
          context_contract: {
            allowed_read_paths: ["canvas-overview.md", `outputs/${scoutId}/summary.md`, `memory/agents/${filterId}.md`],
            allowed_write_paths: [`memory/agents/${filterId}.md`, `outputs/${filterId}/summary.md`],
            output_contract: {
              save_to: `outputs/${filterId}/`,
              format: "json",
              required_fields: ["summary", "risks", "decision", "risk_score"],
            },
          },
          status: "idle",
        },
      },
    };

    // 3. Tailored Proposal Writer
    const proposalNode = {
      id: proposalId,
      type: "lc",
      position: { x: 760, y: 180 },
      data: {
        title: "3. Proposal Architect",
        nodeType: "agent",
        shape: "rectangle",
        color: "#8fbf7f",
        viewMode: "card",
        content: "Crafts a high-impact, tailored proposal matching the candidate's verified skills to the winning project.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lock: { status: "free", locked_by: null, locked_at: null },
        agent: {
          role_id: "solution-designer",
          model: "gemini-3.6-flash",
          system_prompt: "You are the Proposal Architect. Write a winning technical proposal covering: Solution Architecture, Milestones, and Skill Differentiation.",
          temperature: 0.7,
          max_tokens: 1500,
          max_steps: 6,
          tools: ["read_memory", "write_memory", "write_output"],
          context_contract: {
            allowed_read_paths: ["canvas-overview.md", `outputs/${filterId}/summary.md`, "memory/user.md", `memory/agents/${proposalId}.md`],
            allowed_write_paths: [`memory/agents/${proposalId}.md`, `outputs/${proposalId}/summary.md`],
            output_contract: {
              save_to: `outputs/${proposalId}/`,
              format: "json",
              required_fields: ["summary", "solution", "next_actions"],
            },
          },
          status: "idle",
        },
      },
    };

    // 4. Human Alignment & Clarification Agent
    const alignNode = {
      id: alignmentId,
      type: "lc",
      position: { x: 1100, y: 180 },
      data: {
        title: "4. Human Alignment & Approval",
        nodeType: "agent",
        shape: "rectangle",
        color: "#b98bc2",
        viewMode: "card",
        content: "Engages the developer to ask targeted clarification questions, records answers in memory, and seeks final approval.",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        lock: { status: "free", locked_by: null, locked_at: null },
        agent: {
          role_id: "decision-maker",
          model: "gemini-3.6-flash",
          system_prompt: "You are the Human Alignment Agent. Formulate questions for the developer regarding rate preferences, start dates, and portfolio links. Request human approval.",
          temperature: 0.6,
          max_tokens: 1200,
          max_steps: 6,
          tools: ["read_memory", "write_memory", "chat_with_user", "write_output"],
          context_contract: {
            allowed_read_paths: ["canvas-overview.md", `outputs/${proposalId}/summary.md`, "memory/user.md", `memory/agents/${alignmentId}.md`],
            allowed_write_paths: [`memory/agents/${alignmentId}.md`, `outputs/${alignmentId}/summary.md`, "memory/user.md"],
            output_contract: {
              save_to: `outputs/${alignmentId}/`,
              format: "json",
              required_fields: ["summary", "decision", "approval_request"],
            },
          },
          status: "idle",
        },
      },
    };

    // Edges connecting 1 -> 2 -> 3 -> 4
    const edges = [
      {
        id: `e-${scoutId}-${filterId}`,
        source: scoutId,
        target: filterId,
        data: { edgeType: "flow", label: "raw listings" },
      },
      {
        id: `e-${filterId}-${proposalId}`,
        source: filterId,
        target: proposalId,
        data: { edgeType: "flow", label: "scored & filtered" },
      },
      {
        id: `e-${proposalId}-${alignmentId}`,
        source: proposalId,
        target: alignmentId,
        data: { edgeType: "flow", label: "draft proposal" },
      },
    ];

    // Seed the user memory profile with developer skills!
    const userMemoryProfile = `# User Skills & Preferences Profile\n\n- Name: Senior Fullstack & AI Engineer\n- Core Skills: TypeScript, React 18/19, Node.js, Next.js, Python, Tailwind CSS, Playwright, LLM Agent Workflows, Cloud Deployment\n- Target Roles: High-impact web apps, AI Canvas applications, Architecture consulting\n- Rate Preference: $85 - $120/hr (or fixed milestone equivalents)\n- Availability: Immediate (25-30 hrs/week)\n- Recent Work: Living Canvas dynamic multi-agent system, realtime whiteboards, Obsidian-compatible vaults`;

    // Apply nodes, edges and user memory directly into store
    const nodes = [scoutNode, filterNode, proposalNode, alignNode];
    store.setState((s) => ({
      nodes,
      edges,
      selectedNodeId: scoutId,
      memory: {
        ...s.memory,
        user: {
          path: "memory/user.md",
          title: "Developer Profile & Preferences",
          body: userMemoryProfile,
          updated_at: new Date().toISOString(),
          last_accessed: new Date().toISOString(),
          confidence: 0.95,
          source: "user",
        },
      },
    }));

    return { success: true, count: 4 };
  });

  console.log("Pipeline creation evaluated:", pipelineResult);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: resolve(artifactsDir, "07-pipeline-assembled.png") });
  userActions.push("Created 4-agent Project Search & Proposal pipeline with user skills memory");

  // 7. Trigger Pipeline Execution via Run button
  console.log("=== Phase 6: Running the AI Pipeline ===");
  const runBtn = page.locator('button:has-text("Run")').first();
  if (await runBtn.isVisible().catch(() => false)) {
    console.log("  Clicking TopBar Run button...");
    await runBtn.click();
    console.log("  Waiting for pipeline execution across 4 nodes...");
    await page.waitForTimeout(14000); // Allow nodes to run through pipeline steps
    await page.screenshot({ path: resolve(artifactsDir, "08-pipeline-running.png") });
    userActions.push("Triggered Run execution");
  }

  // Check execution status after running
  const statusSummary = await page.evaluate(() => {
    const store = window.__LC_STORE__ || window.useStore;
    if (!store) return null;
    const st = store.getState();
    return {
      executionStatus: st.execution.status,
      currentNodeId: st.execution.current_node_id,
      outputsCount: Object.keys(st.outputs).length,
      nodeStatuses: st.nodes.map((n) => ({
        id: n.id,
        title: n.data.title,
        agentStatus: n.data.agent?.status,
      })),
      ledgerLength: st.events.length,
    };
  });
  console.log("Execution summary from store:", JSON.stringify(statusSummary, null, 2));

  // 8. Open human alignment agent and test human question interaction
  console.log("=== Phase 7: Testing Human-in-the-Loop Clarification Questions ===");
  const alignNodeTitle = page.locator('text="4. Human Alignment & Approval"').first();
  if (await alignNodeTitle.isVisible().catch(() => false)) {
    console.log("  Selecting Alignment node...");
    await alignNodeTitle.click({ force: true });
    await page.waitForTimeout(500);

    // Open chat tab in right panel
    const chatBtn = page.locator('aside button:has-text("Chat"), button[title*="Chat"]').first();
    if (await chatBtn.isVisible().catch(() => false)) {
      await chatBtn.click();
      await page.waitForTimeout(400);

      const alignInput = page.locator('input[placeholder*="Ask"], input[placeholder*="Message"], textarea').last();
      if (await alignInput.isVisible().catch(() => false)) {
        console.log("  Answering human clarification question...");
        await alignInput.fill("I confirm my rate is $95/hr, available to start immediately with 25 hrs/week. Proposal is approved!");
        await page.keyboard.press("Enter");
        await page.waitForTimeout(2000);
        await page.screenshot({ path: resolve(artifactsDir, "09-human-clarification-answered.png") });
        userActions.push("Answered clarification questions & provided approval");
      }
    }
  }

  await page.screenshot({ path: resolve(artifactsDir, "10-final-pipeline-state.png") });
  await browser.close();

  const report = {
    timestamp: new Date().toISOString(),
    userActions,
    findings,
    consoleErrors,
    consoleWarnings,
    statusSummary,
  };

  writeFileSync(resolve(artifactsDir, "full-walkthrough-report.json"), JSON.stringify(report, null, 2));
  console.log("=== Walkthrough and Pipeline verification complete! ===");
}

simulateHumanUser().catch((err) => {
  console.error("Walkthrough error:", err);
  process.exit(1);
});
