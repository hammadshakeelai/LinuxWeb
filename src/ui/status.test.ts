import { describe, expect, it } from "vitest";
import { statusText } from "./status.ts";

describe("statusText", () => {
  it("shows how long ago the home folder was saved", () => {
    expect(statusText({ kind: "saved", savedAt: 10_000 }, 12_400)).toBe("Home folder saved 2s ago");
    expect(statusText({ kind: "saved", savedAt: 0 }, 5 * 60_000)).toBe("Home folder saved 5 min ago");
    expect(statusText({ kind: "saved", savedAt: 0 }, 3 * 3_600_000)).toBe("Home folder saved 3 h ago");
  });

  it("uses the spec's wording for every other state", () => {
    expect(statusText({ kind: "starting" }, 0)).toBe("");
    expect(statusText({ kind: "saving" }, 0)).toBe("Saving…");
    expect(statusText({ kind: "too-big" }, 0)).toBe("Home folder too big to save (over 50 MB)");
    expect(statusText({ kind: "off" }, 0)).toBe("Saving is off in this browser");
    expect(statusText({ kind: "paused-other-tab" }, 0)).toBe("Saving paused: LinuxWeb is open in another tab");
  });
});
