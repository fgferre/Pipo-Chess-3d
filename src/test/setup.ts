import { beforeAll, vi } from "vitest";
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

beforeAll(() => {
  Object.defineProperty(window, "scrollTo", {
    value: vi.fn(),
    writable: true,
  });
});
