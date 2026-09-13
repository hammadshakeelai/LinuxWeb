import { describe, expect, it } from "vitest";
import { PackagesWatcher, packagesMessage, parsePackagesStatus } from "./packages-status.ts";
import { PACKAGES_STATUS } from "./protocol.ts";

describe("parsePackagesStatus", () => {
  it("parses run, state, total and failed", () => {
    expect(parsePackagesStatus("3 installing 4 0\n")).toEqual({ run: 3, state: "installing", total: 4, failed: 0 });
    expect(parsePackagesStatus("3 done 4 1")).toEqual({ run: 3, state: "done", total: 4, failed: 1 });
  });

  it("rejects anything else", () => {
    expect(parsePackagesStatus("")).toBeNull();
    expect(parsePackagesStatus("3 finished 4 0")).toBeNull();
    expect(parsePackagesStatus("x done 1 0")).toBeNull();
  });
});

describe("packagesMessage", () => {
  it("uses the spec's wording, durations and singular", () => {
    expect(packagesMessage({ run: 1, state: "installing", total: 1, failed: 0 })).toEqual({ text: "Reinstalling 1 package…", durationMs: null });
    expect(packagesMessage({ run: 1, state: "installing", total: 3, failed: 0 })).toEqual({ text: "Reinstalling 3 packages…", durationMs: null });
    expect(packagesMessage({ run: 1, state: "done", total: 3, failed: 0 })).toEqual({ text: "Reinstalled 3 packages", durationMs: 5000 });
    expect(packagesMessage({ run: 1, state: "done", total: 1, failed: 0 })).toEqual({ text: "Reinstalled 1 package", durationMs: 5000 });
    expect(packagesMessage({ run: 1, state: "done", total: 4, failed: 1 })).toEqual({
      text: "Couldn't reinstall 1 of 4 packages. See /var/log/linuxweb-packages.log",
      durationMs: 10_000,
    });
  });
});

function setupWatcher() {
  let content: string | null = null;
  let clock = 0;
  const watcher = new PackagesWatcher({
    readFile: async (path) => {
      expect(path).toBe(PACKAGES_STATUS);
      if (content === null) throw new Error("FileNotFoundError");
      return new TextEncoder().encode(content);
    },
    now: () => clock,
  });
  return {
    watcher,
    set: (text: string | null) => (content = text),
    tick: (ms: number) => (clock += ms),
  };
}

describe("PackagesWatcher", () => {
  it("shows nothing without a status file", async () => {
    const { watcher } = setupWatcher();
    await watcher.pollOnce();
    expect(watcher.text()).toBe("");
  });

  it("shows installing until done, then done for 5 seconds", async () => {
    const { watcher, set, tick } = setupWatcher();
    set("1 installing 2 0");
    await watcher.pollOnce();
    tick(60_000);
    expect(watcher.text()).toBe("Reinstalling 2 packages…");
    set("1 done 2 0");
    await watcher.pollOnce();
    expect(watcher.text()).toBe("Reinstalled 2 packages");
    tick(4999);
    expect(watcher.text()).toBe("Reinstalled 2 packages");
    tick(1);
    expect(watcher.text()).toBe("");
  });

  it("does not repeat a message it already showed", async () => {
    const { watcher, set, tick } = setupWatcher();
    set("1 done 1 0");
    await watcher.pollOnce();
    tick(6000);
    await watcher.pollOnce();
    expect(watcher.text()).toBe("");
    set("2 done 1 1");
    await watcher.pollOnce();
    expect(watcher.text()).toBe("Couldn't reinstall 1 of 1 package. See /var/log/linuxweb-packages.log");
  });
});
