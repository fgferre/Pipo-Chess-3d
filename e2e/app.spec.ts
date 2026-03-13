import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("boots offline, imports a PGN, switches language, and exports PGN", async ({ page, context }, testInfo) => {
  await page.goto("/");
  await expect(page.getByText("Pipo Chess 3D")).toBeVisible();
  await expect(page.getByText("Pronto para jogar")).toBeVisible({ timeout: 20_000 });

  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.ready;
    }
  });

  await page.getByRole("button", { name: /Partida/i }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Ready to play")).toBeVisible();

  await page.getByRole("button", { name: /Library/i }).click();
  const pgnPath = testInfo.outputPath("sample-game.pgn");
  await writeFile(pgnPath, "1. e4 e5 2. Nf3 Nc6");
  await page.locator('input[type="file"]').setInputFiles(pgnPath);
  await expect(page.locator(".move-list")).toContainText("e4");
  await waitForAutosaveMoveCount(page, 4);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Library/i }).click();
  await page.getByRole("button", { name: "Export PGN" }).click();
  const download = await downloadPromise;
  expect(await download.path()).toBeTruthy();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Pipo Chess 3D")).toBeVisible();
  await expect(page.locator(".move-list")).toContainText("e4");

  await page.getByRole("button", { name: /Library/i }).click();
  await expect(page.getByText("Recover autosave")).toBeVisible();
  await page.getByRole("button", { name: "Resume autosave" }).click();
  await page.getByRole("button", { name: /Moves/i }).click();
  await expect(page.locator(".move-list")).toContainText("e4");
});

async function waitForAutosaveMoveCount(page: Page, moveCount: number): Promise<void> {
  await page.waitForFunction(async (expectedMoveCount) => {
    return new Promise<boolean>((resolve) => {
      const request = indexedDB.open("pipo-chess-3d");

      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction("autosave", "readonly");
        const store = transaction.objectStore("autosave");
        const getRequest = store.get("autosave");

        getRequest.onerror = () => {
          db.close();
          resolve(false);
        };

        getRequest.onsuccess = () => {
          const persistedMoveCount = getRequest.result?.value?.snapshot?.moveList?.length ?? 0;
          db.close();
          resolve(persistedMoveCount === expectedMoveCount);
        };
      };
    });
  }, moveCount);
}
