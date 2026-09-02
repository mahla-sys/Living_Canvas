import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import http from "node:http";

describe("laptop viewport geometry and scroll contracts (Playwright)", () => {
  let browser: Browser;
  let server: ViteDevServer | null = null;
  let baseUrl: string;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Determine whether port 3000 is listening or if we should boot an inline server
    const isPort3000Up = await new Promise<boolean>((resolve) => {
      const req = http.get("http://127.0.0.1:3000", (res) => {
        res.resume();
        resolve(res.statusCode !== undefined);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(500, () => {
        req.destroy();
        resolve(false);
      });
    });

    if (isPort3000Up) {
      baseUrl = "http://127.0.0.1:3000";
    } else {
      server = await createServer({
        server: { port: 3008, host: "127.0.0.1" },
        configFile: "./vite.config.js",
      });
      await server.listen();
      baseUrl = "http://127.0.0.1:3008";
    }
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
    if (server) await server.close();
  });

  const testViewports = [
    { name: "Standard Laptop (1366x768)", width: 1366, height: 768 },
    { name: "HD Laptop (1280x720)", width: 1280, height: 720 },
    { name: "Small Laptop (1024x600)", width: 1024, height: 600 },
  ];

  for (const vp of testViewports) {
    it(`never overflows viewport bounds on ${vp.name}`, async () => {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      await page.goto(baseUrl, { waitUntil: "networkidle" });
      await page.waitForTimeout(300);

      const metrics = await page.evaluate(() => {
        const doc = document.scrollingElement!;
        const body = document.body;
        const root = document.getElementById("root")!;
        const mounted = document.querySelector("[data-lc-mounted]")!;
        const statusBar = document.querySelector("[data-lc-statusbar]")!;
        const sbRect = statusBar.getBoundingClientRect();

        return {
          windowInnerWidth: window.innerWidth,
          windowInnerHeight: window.innerHeight,
          docScrollWidth: doc.scrollWidth,
          docScrollHeight: doc.scrollHeight,
          bodyStyle: {
            position: getComputedStyle(body).position,
            overflow: getComputedStyle(body).overflow,
          },
          rootStyle: {
            position: getComputedStyle(root).position,
            overflow: getComputedStyle(root).overflow,
            height: getComputedStyle(root).height,
          },
          mountedStyle: {
            overflow: getComputedStyle(mounted).overflow,
            height: getComputedStyle(mounted).height,
          },
          statusBarRect: {
            top: sbRect.top,
            bottom: sbRect.bottom,
            height: sbRect.height,
          },
        };
      });

      // 1. Whole page must never have an outer scrollbar or overflow
      expect(metrics.docScrollHeight).toBeLessThanOrEqual(vp.height);
      expect(metrics.docScrollWidth).toBeLessThanOrEqual(vp.width);

      // 2. body & root must be fixed with overflow: hidden
      expect(metrics.bodyStyle.position).toBe("fixed");
      expect(metrics.bodyStyle.overflow).toBe("hidden");
      expect(metrics.rootStyle.position).toBe("fixed");
      expect(metrics.rootStyle.overflow).toBe("hidden");

      // 3. Status bar must be fully visible within the viewport
      expect(metrics.statusBarRect.bottom).toBeLessThanOrEqual(vp.height + 1);
      expect(metrics.statusBarRect.top).toBeGreaterThanOrEqual(0);

      await page.close();
    });
  }

  it("engages internal scrolling in side panels when content exceeds panel height", async () => {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);

    // Switch to Files tab on the left panel (has many items exceeding 768px height)
    const filesTab = page.locator("aside button:has-text('Files')");
    await filesTab.click();
    await page.waitForTimeout(200);

    const scrollMetrics = await page.evaluate(() => {
      const leftScroller = document.querySelector<HTMLElement>("[data-lc-panel-scroller='left']")!;
      const rightScroller = document.querySelector<HTMLElement>("[data-lc-panel-scroller='right']")!;

      return {
        left: {
          scrollHeight: leftScroller.scrollHeight,
          clientHeight: leftScroller.clientHeight,
          overflowY: getComputedStyle(leftScroller).overflowY,
        },
        right: {
          scrollHeight: rightScroller.scrollHeight,
          clientHeight: rightScroller.clientHeight,
          overflowY: getComputedStyle(rightScroller).overflowY,
        },
      };
    });

    // Both panels have overflow-y: auto
    expect(scrollMetrics.left.overflowY).toBe("auto");
    expect(scrollMetrics.right.overflowY).toBe("auto");

    // When content is tall, scrollHeight > clientHeight (internal scroll engaged)
    expect(scrollMetrics.left.scrollHeight).toBeGreaterThan(scrollMetrics.left.clientHeight);
    expect(scrollMetrics.right.scrollHeight).toBeGreaterThanOrEqual(scrollMetrics.right.clientHeight);

    await page.close();
  });
});
