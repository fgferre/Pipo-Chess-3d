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
  await expect(page.getByRole("button", { name: "Open history" })).toBeVisible();
});
