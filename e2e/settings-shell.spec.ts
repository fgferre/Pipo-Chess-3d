import { expect, test } from "@playwright/test";
import { switchToEnglish, waitForBoot } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("supports stable shell settings flows", async ({ page }) => {
  await page.goto("/");
  await waitForBoot(page);
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();

  await page.getByRole("button", { name: "Câmera" }).click();
  await page.getByRole("button", { name: "Modo 2D" }).click();
  await page.getByRole("button", { name: "Câmera" }).click();
  await expect(page.getByRole("button", { name: "Modo 2D" })).toHaveClass(/is-selected/);
  await page.getByRole("button", { name: /Clássica/i }).click();

  await switchToEnglish(page);
  await expect(page.getByText("Play some moves to get started")).toBeVisible();

  await page.getByRole("button", { name: "Off" }).click();
  await expect(page.getByRole("button", { name: "Off" })).toHaveClass(/is-active/);

  await page.getByRole("button", { name: "Emerald" }).click();
  await expect(page.getByRole("button", { name: "Emerald" })).toHaveClass(/is-selected/);

  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Camera" })).toBeVisible();
  await page.getByRole("button", { name: "New game" }).click();

  const dialog = page.getByRole("dialog", { name: "Start a new game" });
  await expect(dialog).toBeVisible();
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

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Open history" })).toBeVisible();
});
