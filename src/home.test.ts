import { describe, expect, it, vi } from "vitest";
import { HomeSync, type HomeStatus } from "./home.ts";
import { HOME_ARCHIVE, HOME_SIZE_LIMIT_BYTES, HOME_VERSION, RESTORE_ARCHIVE, RESTORED_COUNT } from "./protocol.ts";
import type { HomeRecord } from "./storage.ts";

const text = (s: string) => new TextEncoder().encode(s);

// Simulates the guest: files live in a map; writing restore.tar.gz makes the "helper"
// report a restored count.
function fakeGuest(files: Record<string, Uint8Array>, restoredCount = "3") {
  const map = new Map(Object.entries(files));
  return {
    map,
    vm: {
      readFile: vi.fn(async (path: string) => {
        const data = map.get(path);
        if (!data) throw new Error("FileNotFoundError");
        return data;
      }),
      createFile: vi.fn(async (path: string, data: Uint8Array) => {
        map.set(path, data);
        if (path === RESTORE_ARCHIVE) map.set(RESTORED_COUNT, text(restoredCount));
      }),
    },
  };
}

function setup(files: Record<string, Uint8Array>, saved?: HomeRecord) {
  const guest = fakeGuest(files);
  const store = { getHome: vi.fn(async () => saved), putHome: vi.fn(async () => {}) };
  const statuses: HomeStatus[] = [];
  const persist = vi.fn(async () => true);
  const sync = new HomeSync({
    vm: guest.vm,
    store,
    onStatus: (s) => statuses.push(s),
    now: () => 1000,
    sleep: async () => {},
    persist,
  });
  return { guest, store, statuses, persist, sync };
}

describe("HomeSync", () => {
  it("returns null and takes the current version as baseline when nothing is saved", async () => {
    const { store, sync } = setup({ [HOME_VERSION]: text("1\n"), [HOME_ARCHIVE]: text("a") });
    expect(await sync.restore()).toBeNull();
    await sync.pollOnce();
    expect(store.putHome).not.toHaveBeenCalled();
  });

  it("restores a saved home folder and returns the count", async () => {
    const saved = { data: text("archive"), bytes: 7, savedAt: 1 };
    const { guest, sync } = setup({ [HOME_VERSION]: text("1\n"), [RESTORED_COUNT]: text("9") }, saved);
    expect(await sync.restore()).toBe(3);
    expect(guest.vm.createFile).toHaveBeenNthCalledWith(1, RESTORED_COUNT, new Uint8Array());
    expect(guest.vm.createFile).toHaveBeenNthCalledWith(2, RESTORE_ARCHIVE, text("archive"));
  });

  it("saves when the version changes, reports status, and asks for persistence once", async () => {
    const { guest, store, statuses, persist, sync } = setup({ [HOME_VERSION]: text("1\n"), [HOME_ARCHIVE]: text("a") });
    await sync.restore();
    guest.map.set(HOME_VERSION, text("2\n"));
    guest.map.set(HOME_ARCHIVE, text("bb"));
    await sync.pollOnce();
    expect(store.putHome).toHaveBeenCalledWith({ data: text("bb"), bytes: 2, savedAt: 1000 });
    expect(statuses).toEqual([{ kind: "saving" }, { kind: "saved", savedAt: 1000 }]);
    guest.map.set(HOME_VERSION, text("3\n"));
    await sync.pollOnce();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("does not save a home folder over 50 MB", async () => {
    const { guest, store, statuses, sync } = setup({ [HOME_VERSION]: text("1\n") });
    await sync.restore();
    guest.map.set(HOME_VERSION, text("2\n"));
    guest.map.set(HOME_ARCHIVE, new Uint8Array(HOME_SIZE_LIMIT_BYTES + 1));
    await sync.pollOnce();
    expect(store.putHome).not.toHaveBeenCalled();
    expect(statuses.at(-1)).toEqual({ kind: "too-big" });
  });

  it("gives up restoring after the timeout", async () => {
    const saved = { data: text("x"), bytes: 1, savedAt: 1 };
    const guest = fakeGuest({ [HOME_VERSION]: text("1\n") }, "");
    let clock = 0;
    const sync = new HomeSync({
      vm: guest.vm,
      store: { getHome: async () => saved, putHome: async () => {} },
      onStatus: () => {},
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    await expect(sync.restore(2000)).rejects.toThrow("Timed out restoring the home folder");
  });
});
