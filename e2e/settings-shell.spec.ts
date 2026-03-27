import { expect, test } from "@playwright/test";
import {
  closeCamera,
  closeMenu,
  openCamera,
  openMenuSection,
  openNewGame,
  shellText,
  switchToEnglish,
  waitForBoot,
} from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("supports stable shell settings flows across sectioned and monolithic menu layouts", async ({ page }) => {
  await page.goto("/");
  await waitForBoot(page);
  await expect(page.getByRole("button", { name: shellText.menu })).toBeVisible();

  const camera = await openCamera(page);
  const cameraPresentation = await camera.getAttribute("data-presentation");
  if (cameraPresentation) {
    expect(cameraPresentation).toMatch(/desktop-popover|mobile-sheet/);
    await expect(page.locator(".overlay-scrim")).toHaveCount(0);
  }

  await camera.getByRole("button", { name: shellText.camera2d }).click();
  await closeCamera(page);

  const reopenedCamera = await openCamera(page);
  await expect(reopenedCamera.getByRole("button", { name: shellText.camera2d })).toHaveClass(/is-selected/);
  await reopenedCamera.getByRole("button", { name: shellText.cameraClassic }).click();

  await switchToEnglish(page);

  const analysisMenu = await openMenuSection(page, "analysis");
  await expect(analysisMenu.getByText("Play some moves to get started")).toBeVisible();

  const visualMenu = await openMenuSection(page, "visual");
  const animationOff = visualMenu.getByRole("button", { name: shellText.animationOff });
  await animationOff.click();
  await expect(animationOff).toHaveAttribute("aria-pressed", "true");

  const emeraldTheme = visualMenu.getByRole("button", { name: shellText.themeEmerald });
  await emeraldTheme.click();
  await expect(emeraldTheme).toHaveClass(/is-selected/);

  const libraryMenu = await openMenuSection(page, "library");
  await expect(libraryMenu.getByRole("button", { name: shellText.importPgn })).toBeVisible();
  await expect(libraryMenu.getByRole("button", { name: shellText.exportPgn })).toBeVisible();

  await closeMenu(page);
  await expect(page.getByRole("button", { name: shellText.camera })).toBeVisible();

  const dialog = await openNewGame(page);
  await expect(dialog.getByText("Club")).toBeVisible();
  await expect(dialog.getByText("Elo", { exact: true })).toBeVisible();

  const eloHelp = dialog.getByRole("button", { name: "What Elo means" });
  await eloHelp.hover();
  await expect(dialog.getByRole("tooltip")).toHaveText("Approximate Stockfish strength band for each level.");
  await expect(dialog.locator(".difficulty-scale__ticks span")).toHaveCount(7);
  await expect(dialog.locator(".difficulty-scale__ticks span.is-active")).toHaveCount(1);

  for (const label of ["1320", "1690", "2060", "2440", "2810", "3190", "MAX"]) {
    await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  }

  for (const label of ["Off", "5", "10", "15", "30", "Custom"]) {
    await expect(dialog.getByRole("button", { name: label, exact: true })).toBeVisible();
  }

  await dialog.getByRole("button", { name: shellText.close }).click();
  await expect(page.getByRole("button", { name: shellText.history })).toBeVisible();
});
