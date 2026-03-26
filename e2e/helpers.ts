import { expect, type Page } from "@playwright/test";

export async function waitForBoot(page: Page): Promise<void> {
  await expect(page.getByText("Pipo Chess 3D").first()).toBeVisible();
  await expect(page.locator(".boot-scrim")).toHaveCount(0, { timeout: 20_000 });
}

export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.ready;
    }
  });
}

export async function switchToEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

export async function waitForAutosaveMoveCount(page: Page, moveCount: number): Promise<void> {
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
