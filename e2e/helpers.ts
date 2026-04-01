import { expect, type Locator, type Page } from "@playwright/test";

type MenuSection = "analysis" | "visual" | "library";

const TEXT = {
  analysis: /^(Análise|Analysis)$/i,
  camera: /^(Câmera|Camera)$/i,
  camera2d: /^(Modo 2D|2D mode)$/i,
  cameraClassic: /^(Clássica|Classic)$/i,
  close: /^(Fechar|Close)$/i,
  english: /^English$/i,
  exportPgn: /^(Exportar PGN|Export PGN)$/i,
  history: /^(Abrir histórico|Open history)$/i,
  importPgn: /^(Importar PGN|Import PGN)$/i,
  library: /^(Biblioteca|Library)$/i,
  menu: /^Menu$/i,
  newGame: /^(Nova partida|New game)$/i,
  settings: /^(Configurações|Settings|Visual)$/i,
  themeEmerald: /^Emerald$/i,
  animationOff: /^(Desligado|Off)$/i,
};

function orLocators(...locators: Locator[]): Locator {
  const [first, ...rest] = locators;
  return rest.reduce((current, locator) => current.or(locator), first).first();
}

async function isVisible(locator: Locator): Promise<boolean> {
  return (await locator.count()) > 0 && (await locator.first().isVisible().catch(() => false));
}

function getMenuSurface(page: Page): Locator {
  return orLocators(
    page.getByTestId("shell-menu"),
    page.getByTestId("menu-surface"),
    page.locator('[data-menu-view]'),
    page.locator(".menu-drawer"),
  );
}

function getCameraSurface(page: Page): Locator {
  return orLocators(
    page.getByTestId("camera-panel"),
    page.getByTestId("camera-surface"),
    page.locator('[data-camera-surface]'),
    page.locator(".camera-picker"),
  );
}

function getHistoryPanel(page: Page): Locator {
  return orLocators(
    page.getByTestId("history-panel"),
    page.locator('[data-history-panel]'),
    page.locator(".history-panel"),
  );
}

function getHistorySurface(page: Page): Locator {
  return orLocators(
    page.getByTestId("history-panel-shell"),
    page.getByTestId("history-surface"),
    page.locator('[data-history-surface]'),
    page.locator(".history-panel__shell"),
  );
}

function getMenuButton(page: Page): Locator {
  return orLocators(
    page.getByTestId("shell-action-menu"),
    page.getByTestId("shell-menu"),
    page.locator('[data-shell-action="menu"]'),
    page.getByRole("button", { name: TEXT.menu }),
  );
}

function getCameraButton(page: Page): Locator {
  return orLocators(
    page.getByTestId("shell-action-camera"),
    page.getByTestId("shell-camera"),
    page.locator('[data-shell-action="camera"]'),
    page.getByRole("button", { name: TEXT.camera }),
  );
}

function getHistoryToggle(page: Page): Locator {
  return orLocators(
    page.getByTestId("history-trigger"),
    page.getByTestId("history-handle"),
    page.getByTestId("history-toggle"),
    page.locator('button[aria-controls="history-panel-shell"]'),
    page.getByRole("button", { name: TEXT.history }),
  );
}

function getNewGameButton(page: Page): Locator {
  return orLocators(
    page.getByTestId("shell-action-new-game"),
    page.getByTestId("shell-new-game"),
    page.locator('[data-shell-action="new-game"]'),
    page.getByRole("button", { name: TEXT.newGame }),
  );
}

function getCloseButton(scope: Page | Locator): Locator {
  return orLocators(
    scope.getByTestId("shell-menu-close"),
    scope.getByTestId("panel-close"),
    scope.locator('[data-close-panel]'),
    scope.getByRole("button", { name: TEXT.close }),
  );
}

function getNewGameSurface(page: Page): Locator {
  return orLocators(
    page.getByTestId("new-game-sheet"),
    page.getByTestId("new-game-surface"),
    page.locator('[data-new-game-surface]'),
    page.getByRole("dialog", { name: /^(Iniciar nova partida|Start a new game)$/i }),
  );
}

function getMenuSectionView(menu: Locator, section: MenuSection): Locator {
  if (section === "analysis") {
    return orLocators(
      menu.getByTestId("shell-menu-view-analysis"),
      menu.getByTestId("menu-view-analysis"),
      menu.locator('[data-menu-view="analysis"]'),
      menu.getByRole("heading", { name: TEXT.analysis }),
    );
  }

  if (section === "visual") {
    return orLocators(
      menu.getByTestId("shell-menu-view-visual"),
      menu.getByTestId("menu-view-visual"),
      menu.locator('[data-menu-view="visual"]'),
      menu.getByRole("heading", { name: TEXT.settings }),
    );
  }

  return orLocators(
    menu.getByTestId("shell-menu-view-library"),
    menu.getByTestId("menu-view-library"),
    menu.locator('[data-menu-view="library"]'),
    menu.getByRole("heading", { name: TEXT.library }),
  );
}

function getMenuSectionTrigger(menu: Locator, section: MenuSection): Locator {
  if (section === "analysis") {
    return orLocators(
      menu.getByTestId("shell-menu-nav-analysis"),
      menu.getByTestId("menu-nav-analysis"),
      menu.locator('[data-menu-target="analysis"]'),
      menu.getByRole("button", { name: TEXT.analysis }),
      menu.getByRole("link", { name: TEXT.analysis }),
    );
  }

  if (section === "visual") {
    return orLocators(
      menu.getByTestId("shell-menu-nav-visual"),
      menu.getByTestId("menu-nav-visual"),
      menu.locator('[data-menu-target="visual"]'),
      menu.getByRole("button", { name: TEXT.settings }),
      menu.getByRole("link", { name: TEXT.settings }),
    );
  }

  return orLocators(
    menu.getByTestId("shell-menu-nav-library"),
    menu.getByTestId("menu-nav-library"),
    menu.locator('[data-menu-target="library"]'),
    menu.getByRole("button", { name: TEXT.library }),
    menu.getByRole("link", { name: TEXT.library }),
  );
}

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

async function waitForStableBoundingBox(locator: Locator, timeout = 3_000): Promise<void> {
  let previous: string | null = null;

  await expect(locator).toBeVisible();
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        if (!box) {
          return null;
        }

        const current = [box.x, box.y, box.width, box.height].map((value) => Math.round(value)).join(":");
        const stable = current === previous ? current : null;
        previous = current;
        return stable;
      },
      { timeout },
    )
    .not.toBeNull();
}

async function openMenu(page: Page): Promise<Locator> {
  const menu = getMenuSurface(page);
  if (!(await isVisible(menu))) {
    await getMenuButton(page).click();
  }
  await expect(menu).toBeVisible();
  return menu;
}

export async function closeMenu(page: Page): Promise<void> {
  const menu = getMenuSurface(page);
  if (await isVisible(menu)) {
    const closeButton = getCloseButton(menu);
    if (await isVisible(closeButton)) {
      await closeButton.click();
    } else {
      await getMenuButton(page).click();
    }
  }

  await expect(menu).toBeHidden();
}

export async function openMenuSection(page: Page, section: MenuSection): Promise<Locator> {
  const menu = await openMenu(page);
  const view = getMenuSectionView(menu, section);

  if (!(await isVisible(view))) {
    const trigger = getMenuSectionTrigger(menu, section);
    if (await isVisible(trigger)) {
      await trigger.click();
    }
  }

  if ((await view.count()) > 0) {
    await expect(view).toBeVisible();
  }
  return menu;
}

export async function switchToEnglish(page: Page): Promise<void> {
  const menu = await openMenuSection(page, "visual");
  const englishButton = menu.getByRole("button", { name: TEXT.english });

  await englishButton.click();
  await expect(englishButton).toHaveAttribute("aria-pressed", "true");
}

export async function openCamera(page: Page): Promise<Locator> {
  const surface = getCameraSurface(page);
  const overlay = page.getByTestId("camera-overlay");
  if ((await overlay.count()) > 0) {
    await expect(overlay).toHaveCount(0);
  }
  if (!(await isVisible(surface))) {
    await getCameraButton(page).click();
  }
  await expect(surface).toBeVisible();
  await waitForStableBoundingBox(surface);
  return surface;
}

export async function closeCamera(page: Page): Promise<void> {
  const surface = getCameraSurface(page);
  const overlay = page.getByTestId("camera-overlay");
  if (await isVisible(surface)) {
    const closeButton = getCloseButton(surface);
    if (await isVisible(closeButton)) {
      await closeButton.click();
    } else {
      if ((await overlay.count()) > 0) {
        await page.mouse.click(8, 8);
      } else {
        await page.keyboard.press("Escape");
      }
    }
  }

  await expect(surface).toBeHidden();
  await expect(overlay).toHaveCount(0);
}

export async function openHistory(page: Page): Promise<Locator> {
  const panel = getHistoryPanel(page);
  const surface = getHistorySurface(page);
  const panelState = await panel.getAttribute("data-state");

  if (panelState !== "open") {
    await getHistoryToggle(page).click();
  }

  if (panelState !== null) {
    await expect(panel).toHaveAttribute("data-state", "open");
  }
  await expect(surface).toBeVisible();
  await waitForStableBoundingBox(surface);
  return surface;
}

export async function openNewGame(page: Page): Promise<Locator> {
  const surface = getNewGameSurface(page);
  if (!(await isVisible(surface))) {
    await getNewGameButton(page).click();
  }
  await expect(surface).toBeVisible();
  return surface;
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

export const shellText = TEXT;
