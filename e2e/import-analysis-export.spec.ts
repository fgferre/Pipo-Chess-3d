import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { switchToEnglish, waitForBoot } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90_000);

test("imports a PGN, exposes analysis mode, and exports the current session", async ({ page }, testInfo) => {
  await page.goto("/");
  await waitForBoot(page);
  await switchToEnglish(page);
  await page.getByRole("button", { name: "Close" }).click();

  const pgnPath = testInfo.outputPath("sample-game.pgn");
  await writeFile(pgnPath, "1. e4 e5 2. Nf3 Nc6");
  await page.locator('input[type="file"]').setInputFiles(pgnPath);

  await expect(page.locator(".move-list")).toContainText("e4");
  await expect(page.getByRole("button", { name: "Return" })).toBeVisible();
  await expect(page.locator(".eval-bar")).toBeVisible();

  await page.getByRole("button", { name: "Menu" }).click();
  await expect(page.getByRole("button", { name: "Analyze game" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Critical moments" })).toBeVisible({ timeout: 30_000 });

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

  await page.locator(".inline-actions--library").getByRole("button", { name: "Export PGN" }).click();

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
});
