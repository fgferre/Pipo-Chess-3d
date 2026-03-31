import { expect, test } from "@playwright/test";
import { openHistory, shellText, waitForBoot } from "./helpers";

test.describe("Viewport Centering and Axis Stability", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("history opens as a right-side desktop overlay without displacing the board stage", async ({ page }) => {
    await page.goto("/");
    await waitForBoot(page);

    const initialBox = await page.locator(".stage-playfield").boundingBox();
    expect(initialBox).not.toBeNull();
    const initialCenterX = initialBox!.x + initialBox!.width / 2;

    const historySurface = await openHistory(page);
    const historyPanel = page
      .getByTestId("history-panel")
      .or(page.locator('[data-history-panel]'))
      .or(page.locator(".history-panel"))
      .first();

    const historyPresentation = await historySurface.getAttribute("data-presentation");
    if (historyPresentation) {
      expect(historyPresentation).toBe("desktop-side");
    }

    const playfieldBox = await page.locator(".stage-playfield").boundingBox();
    expect(playfieldBox).not.toBeNull();
    expect(Math.abs(playfieldBox!.width - initialBox!.width)).toBeLessThan(8);
    expect(Math.abs(playfieldBox!.x - initialBox!.x)).toBeLessThan(8);
    expect(Math.abs(playfieldBox!.x + playfieldBox!.width / 2 - initialCenterX)).toBeLessThan(8);

    const historyBox = await historySurface.boundingBox();
    expect(historyBox).not.toBeNull();

    const historyTab = page
      .getByTestId("history-handle")
      .or(page.getByTestId("history-toggle"))
      .or(page.locator(".history-tab"))
      .first();
    const historyTabBox = await historyTab.boundingBox();
    expect(historyTabBox).not.toBeNull();

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    const panelCenterX = historyBox!.x + historyBox!.width / 2;
    expect(panelCenterX).toBeGreaterThan(viewport!.width / 2);
    const tabTouchesPanelLeftEdge = Math.abs(historyTabBox!.x + historyTabBox!.width - historyBox!.x) <= 8;
    const tabTouchesPanelRightEdge = Math.abs(historyTabBox!.x - (historyBox!.x + historyBox!.width)) <= 8;
    expect(tabTouchesPanelLeftEdge || tabTouchesPanelRightEdge).toBeTruthy();

    const panelState = await historyPanel.getAttribute("data-state");
    if (panelState !== null) {
      await expect(historyPanel).toHaveAttribute("data-state", "open");
    }
  });

  test("camera affordance remains reachable on desktop", async ({ page }) => {
    await page.goto("/");
    await waitForBoot(page);

    await expect(page.getByRole("button", { name: shellText.camera })).toBeVisible();
  });
});
