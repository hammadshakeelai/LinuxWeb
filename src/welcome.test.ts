import { describe, expect, it } from "vitest";
import { welcomeText } from "./welcome.ts";

describe("welcomeText", () => {
  it("shows the first-visit welcome", () => {
    expect(welcomeText(null)).toBe(
      "Welcome to LinuxWeb: Alpine Linux, running in your browser.\r\n" +
        "Files in /root are saved in this browser automatically.\r\n" +
        "New here? Type help for a two-minute tour.\r\n",
    );
  });

  it("shows the restored file count on a return visit", () => {
    expect(welcomeText(12)).toBe(
      "Welcome to LinuxWeb: Alpine Linux, running in your browser.\r\n" +
        "Welcome back. Restored 12 files in your home folder.\r\n",
    );
  });

  it("uses the singular for one file", () => {
    expect(welcomeText(1)).toContain("Restored 1 file in your home folder.");
  });
});
