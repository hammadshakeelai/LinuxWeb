import { describe, expect, it } from "vitest";
import { welcomeText } from "./welcome.ts";

describe("welcomeText", () => {
  it("shows the first-visit welcome with the network line", () => {
    expect(welcomeText(null, "offline")).toBe(
      "Welcome to LinuxWeb: Alpine Linux, running in your browser.\r\n" +
        "Files in /root are saved in this browser automatically.\r\n" +
        "New here? Type help for a two-minute tour.\r\n" +
        "Network is offline: set a relay with the Network button to install software.\r\n",
    );
  });

  it("shows the restored file count on a return visit, then the network line", () => {
    expect(welcomeText(12, "online")).toBe(
      "Welcome to LinuxWeb: Alpine Linux, running in your browser.\r\n" +
        "Welcome back. Restored 12 files in your home folder.\r\n" +
        "Network is online: try apk add, git clone, or curl.\r\n",
    );
  });

  it("uses the singular for one file", () => {
    expect(welcomeText(1, "offline")).toContain("Restored 1 file in your home folder.");
  });
});
