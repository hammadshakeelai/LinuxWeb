import { describe, expect, it } from "vitest";
import { TOUCH_KEYS, applyCtrl } from "./touch-keys.ts";

describe("touch keys", () => {
  it("offers Esc, Tab, Ctrl and the four arrows", () => {
    expect(TOUCH_KEYS.map((k) => k.label)).toEqual(["Esc", "Tab", "Ctrl", "←", "↑", "↓", "→"]);
    expect(TOUCH_KEYS.find((k) => k.label === "↑")?.sequence).toBe("\x1b[A");
  });

  it("turns a letter into its control character", () => {
    expect(applyCtrl("c")).toBe("\x03");
    expect(applyCtrl("D")).toBe("\x04");
    expect(applyCtrl("1")).toBe("1");
  });
});
