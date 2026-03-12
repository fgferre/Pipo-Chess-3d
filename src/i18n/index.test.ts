import { describe, expect, it } from "vitest";
import { getLocaleLabel, t } from "./index";

describe("i18n helpers", () => {
  it("returns translated copy and locale labels", () => {
    expect(t("pt-BR", "status.ready")).toBe("Pronto para jogar");
    expect(t("en", "status.ready")).toBe("Ready to play");
    expect(getLocaleLabel("en")).toBe("English");
  });
});
