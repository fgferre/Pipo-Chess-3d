import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const PREVIEW_URL = "http://127.0.0.1:4173";

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code) => {
      resolve(code ?? 1);
    });
  });
}

async function waitForPreview(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Ignore until the preview server is ready.
    }

    await delay(400);
  }

  throw new Error(`Preview server did not become ready at ${url} within ${timeoutMs}ms.`);
}

function stopPreviewServer(previewProcess) {
  if (!previewProcess.pid) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(previewProcess.pid), "/T", "/F"], {
      stdio: "ignore",
      shell: true,
    });
    return;
  }

  try {
    process.kill(previewProcess.pid, "SIGTERM");
  } catch {
    // Process already exited.
  }
}

async function main() {
  const playwrightArgs = process.argv.slice(2);
  const buildCode = await runCommand("npm", ["run", "build"]);
  if (buildCode !== 0) {
    process.exit(buildCode);
  }

  const previewProcess = spawn("npm", ["run", "preview", "--", "--host", "127.0.0.1", "--port", "4173"], {
    stdio: "ignore",
    shell: true,
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    stopPreviewServer(previewProcess);
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  try {
    await waitForPreview(PREVIEW_URL);
    const testCode = await runCommand("npx", ["playwright", "test", ...playwrightArgs]);
    cleanup();
    process.exit(testCode);
  } catch (error) {
    cleanup();
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

await main();
