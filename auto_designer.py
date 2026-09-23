#!/usr/bin/env python3
"""
Living Canvas — Autonomous Visual Designer Loop (Playwright + Gemini Vision)
100% Free local execution using Google AI Studio API and Playwright.
"""

import os
import sys
import time
from pathlib import Path

try:
    from google import genai
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Please install dependencies: pip install playwright google-genai && playwright install chromium")
    sys.exit(1)

def run_visual_audit():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable is not set.")
        print("Please export GEMINI_API_KEY='your-free-key' from Google AI Studio.")
        sys.exit(1)

    artifacts_dir = Path("artifacts")
    artifacts_dir.mkdir(exist_ok=True)
    screenshot_path = artifacts_dir / "current_ui.png"

    print("==> 1. Launching headless browser via Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-setuid-sandbox"])
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        
        target_url = os.environ.get("APP_URL", "http://localhost:3000")
        print(f"==> 2. Navigating to {target_url}...")
        page.goto(target_url, wait_until="networkidle")
        time.sleep(2)
        
        print(f"==> 3. Capturing 1080p screenshot to {screenshot_path}...")
        page.screenshot(path=str(screenshot_path))
        browser.close()

    print("==> 4. Connecting to Google AI Studio (Gemini 2.5 Flash)...")
    client = genai.Client(api_key=api_key)

    with open(screenshot_path, "rb") as f:
        image_bytes = f.read()

    prompt = """
    You are a Principal Product Designer & Design Architect (Linear / Raycast / tldraw aesthetic).
    Analyze this 1920x1080 screenshot of "Living Canvas".
    
    Provide an actionable, brutal, and constructive visual audit:
    1. Containeritis & Boxed Perimeters: Identify where borders constrain the canvas.
    2. Color & Hierarchy: Note where loud colors clash and where contrast fails.
    3. Node Cards: Critique padding, typography, tags, and micro-badges.
    4. Exact Tailwind / CSS modifications: Give exact CSS class updates to make the UI look like a production-grade product.
    """

    print("==> 5. Analyzing screenshot via Gemini Vision...")
    response = client.models.generate_content(
        model="gemini-3.8-flash",
        contents=[
            genai.types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
            prompt
        ]
    )

    report_file = Path("artifacts/design-audit.md")
    with open(report_file, "w", encoding="utf-8") as f:
        f.write(response.text)

    print(f"\n==> 6. Complete! Audit report saved to {report_file}")
    print("\n--- Summary ---")
    print(response.text[:600] + "...")

if __name__ == "__main__":
    run_visual_audit()
