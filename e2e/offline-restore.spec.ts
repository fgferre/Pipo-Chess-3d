import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import {
  switchToEnglish,
  waitForAutosaveMoveCount,
  waitForBoot,
  waitForServiceWorker,
} from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

test("restores the autosaved session after an offline reload", async ({ page, context }, testInfo) => {
  await page.goto("/");
  await waitForBoot(page);
  await switchToEnglish(page);
  await page.getByRole("button", { name: "Close" }).click();
  await waitForServiceWorker(page);

  const pgnPath = testInfo.outputPath("offline-session.pgn");
  await writeFile(pgnPath, "1. e4 e5 2. Nf3 Nc6");
  await page.locator('input[type="file"]').setInputFiles(pgnPath);

  await expect(page.locator(".move-list")).toContainText("e4");
  await waitForAutosaveMoveCount(page, 4);

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await waitForBoot(page);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByText("Recover autosave")).toBeVisible();
  await page.getByRole("button", { name: /Resume autosave/ }).click();
  await page.getByRole("button", { name: "Open history" }).click();
  await expect(page.locator(".move-list")).toContainText("e4");
});
