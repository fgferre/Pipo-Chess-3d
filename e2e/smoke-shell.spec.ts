import { expect, test } from "@playwright/test";

test("@smoke loads the shell chrome without runtime failures", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".app-shell")).toBeVisible();
  await expect(page.getByText("Pipo Chess 3D").first()).toBeVisible();
  await expect(page.getByTestId("shell-top-toggle")).toBeVisible();
  await expect(page.getByTestId("shell-bottom-bar")).toBeVisible();
  await expect(page.getByTestId("shell-action-menu")).toBeVisible();
});
