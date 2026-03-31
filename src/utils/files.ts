export type ExportTextResult = "shared" | "copied" | "downloaded" | "cancelled";

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportTextContent(filename: string, content: string, title = filename): Promise<ExportTextResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ title, text: content });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return "cancelled";
      }
    }
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return "copied";
    } catch {
      // Fall through to download if clipboard access is unavailable.
    }
  }

  downloadTextFile(filename, content);
  return "downloaded";
}

export async function readTextFile(file: File): Promise<string> {
  return file.text();
}
