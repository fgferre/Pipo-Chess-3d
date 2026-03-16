import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

test("supports the final shell flows, export, and offline restore", async ({ page, context }, testInfo) => {
  await page.goto("/");
  await expect(page.getByText("Pipo Chess 3D")).toBeVisible();
  await expect(page.locator(".boot-scrim")).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();

  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      await navigator.serviceWorker.ready;
    }
  });

  await page.getByRole("button", { name: "Câmera" }).click();
  await page.getByRole("button", { name: "Modo 2D" }).click();
  await page.getByRole("button", { name: "Câmera" }).click();
  await expect(page.getByRole("button", { name: "Modo 2D" })).toHaveClass(/is-selected/);
  await page.getByRole("button", { name: /Clássica/i }).click();

  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("button", { name: "Analyze game" })).toBeVisible();
  await page.getByRole("button", { name: "Off" }).click();
  await expect(page.getByRole("button", { name: "Off" })).toHaveClass(/is-active/);
  await page.getByRole("button", { name: "Emerald" }).click();
  await expect(page.getByRole("button", { name: "Emerald" })).toHaveClass(/is-selected/);

  const pgnPath = testInfo.outputPath("sample-game.pgn");
  await writeFile(pgnPath, "1. e4 e5 2. Nf3 Nc6");
  await page.locator('input[type="file"]').setInputFiles(pgnPath);
  await expect(page.locator(".move-list")).toContainText("e4");
  await expect(page.locator(".eval-bar")).toBeVisible();
  await waitForAutosaveMoveCount(page, 4);

  await page.getByRole("button", { name: "Return" }).click();
  await page.getByRole("button", { name: "Menu" }).click();
  await page.getByRole("button", { name: "Generate analysis" }).click();
  await expect(page.getByText("Critical moments")).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    (
      window as Window & {
        __downloadCapture?: { download: string; href: string };
      }
    ).__downloadCapture = undefined;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      (
        window as Window & {
          __downloadCapture?: { download: string; href: string };
        }
      ).__downloadCapture = {
        download: this.download,
        href: this.href,
      };
    };
  });
  await page.evaluate(() => {
    const exportButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Export PGN",
    );

    if (!(exportButton instanceof HTMLButtonElement)) {
      throw new Error("Export PGN button not found.");
    }

    exportButton.click();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __downloadCapture?: { download: string; href: string };
            }
          ).__downloadCapture ?? null,
      ),
    )
    .toMatchObject({
      download: expect.stringMatching(/^pipo-chess-.*\.pgn$/),
      href: expect.stringContaining("blob:"),
    });

  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Pipo Chess 3D")).toBeVisible();
  await expect(page.getByText("Ongoing game restored.")).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByText("Recover autosave")).toBeVisible();
  await page.getByRole("button", { name: "Resume autosave" }).click();
  await page.getByRole("button", { name: "Open history" }).click();
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
