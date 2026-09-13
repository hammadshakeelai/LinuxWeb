import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { Store } from "./storage.ts";

let dbCount = 0;
const openStore = () => Store.open(`linuxweb-test-${dbCount++}`);

describe("Store", () => {
  it("saves, reads and clears the home record", async () => {
    const store = await openStore();
    expect(await store.getHome()).toBeUndefined();
    await store.putHome({ data: new Uint8Array([1, 2, 3]), bytes: 3, savedAt: 100 });
    expect(await store.getHome()).toEqual({ data: new Uint8Array([1, 2, 3]), bytes: 3, savedAt: 100 });
    await store.clearHome();
    expect(await store.getHome()).toBeUndefined();
  });

  it("lists machine saves newest first without their data", async () => {
    const store = await openStore();
    await store.putMachine({ id: "a", name: "Old", createdAt: 1, bytes: 10, data: new Uint8Array(10) });
    await store.putMachine({ id: "b", name: "New", createdAt: 2, bytes: 20, data: new Uint8Array(20) });
    expect(await store.listMachines()).toEqual([
      { id: "b", name: "New", createdAt: 2, bytes: 20 },
      { id: "a", name: "Old", createdAt: 1, bytes: 10 },
    ]);
  });

  it("renames and deletes machine saves", async () => {
    const store = await openStore();
    await store.putMachine({ id: "a", name: "Old", createdAt: 1, bytes: 1, data: new Uint8Array(1) });
    await store.renameMachine("a", "Renamed");
    expect((await store.getMachine("a"))?.name).toBe("Renamed");
    await store.deleteMachine("a");
    expect(await store.getMachine("a")).toBeUndefined();
  });
});
