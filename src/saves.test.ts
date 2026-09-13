import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { MachineSaves, StorageFullError, TooManySavesError, UnreadableSaveError, defaultSaveName } from "./saves.ts";
import { Store } from "./storage.ts";

let dbCount = 0;

async function setup() {
  const store = await Store.open(`saves-test-${dbCount++}`);
  const state = new Uint8Array(10_000).fill(9);
  const vm = {
    saveState: vi.fn(async () => state.slice().buffer),
    restoreState: vi.fn(async (_state: ArrayBuffer) => {}),
  };
  let id = 0;
  const saves = new MachineSaves({ vm, store, now: () => new Date(2026, 8, 13, 14, 5).getTime(), newId: () => `id-${id++}` });
  return { store, state, vm, saves };
}

describe("defaultSaveName", () => {
  it("formats local date and time", () => {
    expect(defaultSaveName(new Date(2026, 0, 2, 3, 4).getTime())).toBe("2026-01-02 03:04");
  });
});

describe("MachineSaves", () => {
  it("saves a compressed machine with a default name", async () => {
    const { saves } = await setup();
    const summary = await saves.save();
    expect(summary).toMatchObject({ id: "id-0", name: "2026-09-13 14:05" });
    expect(summary.bytes).toBeLessThan(10_000);
    expect(await saves.list()).toHaveLength(1);
  });

  it("restores the exact state that was saved", async () => {
    const { saves, vm, state } = await setup();
    const { id } = await saves.save("Before rm -rf");
    await saves.restore(id);
    expect(new Uint8Array(vm.restoreState.mock.calls[0][0])).toEqual(state);
  });

  it("refuses a sixth save", async () => {
    const { saves } = await setup();
    for (let i = 0; i < 5; i++) await saves.save();
    await expect(saves.save()).rejects.toBeInstanceOf(TooManySavesError);
  });

  it("reports a full browser storage with the needed size", async () => {
    const { vm } = await setup();
    const store = {
      listMachines: async () => [],
      getMachine: async () => undefined,
      putMachine: async () => {
        throw new DOMException("full", "QuotaExceededError");
      },
      renameMachine: async () => {},
      deleteMachine: async () => {},
    };
    const saves = new MachineSaves({ vm, store });
    const error = await saves.save().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageFullError);
    expect((error as StorageFullError).neededMB).toBeGreaterThanOrEqual(1);
  });

  it("reports an unreadable save", async () => {
    const { saves, store } = await setup();
    await store.putMachine({ id: "bad", name: "Bad", createdAt: 1, bytes: 3, data: new Uint8Array([1, 2, 3]) });
    await expect(saves.restore("bad")).rejects.toBeInstanceOf(UnreadableSaveError);
    await expect(saves.restore("missing")).rejects.toBeInstanceOf(UnreadableSaveError);
  });

  it("renames, deletes and exports with a safe filename", async () => {
    const { saves } = await setup();
    const { id } = await saves.save();
    await saves.rename(id, "  My setup / v2 ");
    expect((await saves.list())[0].name).toBe("My setup / v2");
    expect((await saves.exportFile(id)).filename).toBe("linuxweb-My-setup-v2.bin.gz");
    await saves.delete(id);
    expect(await saves.list()).toEqual([]);
  });
});
