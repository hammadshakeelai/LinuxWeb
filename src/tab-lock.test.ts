import { describe, expect, it } from "vitest";
import { acquireSaveLock } from "./tab-lock.ts";

function fakeLocks(available: boolean) {
  const requested: string[] = [];
  const locks = {
    request: (name: string, _options: unknown, callback: (lock: unknown) => unknown) => {
      requested.push(name);
      void callback(available ? { name } : null);
      return new Promise(() => {});
    },
  } as unknown as LockManager;
  return { locks, requested };
}

describe("acquireSaveLock", () => {
  it("returns true when this tab gets the lock", async () => {
    const { locks, requested } = fakeLocks(true);
    expect(await acquireSaveLock(locks)).toBe(true);
    expect(requested).toEqual(["linuxweb-save"]);
  });

  it("returns false when another tab holds it", async () => {
    expect(await acquireSaveLock(fakeLocks(false).locks)).toBe(false);
  });

  it("returns true when the browser has no Web Locks", async () => {
    expect(await acquireSaveLock(undefined)).toBe(true);
  });
});
