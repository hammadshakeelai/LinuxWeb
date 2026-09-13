import type { Vm } from "./emulator.ts";
import { gunzip, gzip } from "./gzip.ts";
import { MAX_MACHINE_SAVES } from "./protocol.ts";
import type { MachineRecord, MachineSummary, Store } from "./storage.ts";

export class TooManySavesError extends Error {
  constructor() {
    super(`You already have ${MAX_MACHINE_SAVES} saves. Delete one first.`);
    this.name = "TooManySavesError";
  }
}

export class StorageFullError extends Error {
  readonly neededMB: number;

  constructor(neededMB: number) {
    super(`Not enough browser storage for this save (needs about ${neededMB} MB). Delete an older save.`);
    this.name = "StorageFullError";
    this.neededMB = neededMB;
  }
}

export class UnreadableSaveError extends Error {
  constructor() {
    super("This save can't be read");
    this.name = "UnreadableSaveError";
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

export function defaultSaveName(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface MachineSavesDeps {
  vm: Pick<Vm, "saveState" | "restoreState">;
  store: Pick<Store, "listMachines" | "getMachine" | "putMachine" | "renameMachine" | "deleteMachine">;
  now?(): number;
  newId?(): string;
}

export class MachineSaves {
  private readonly deps: Required<MachineSavesDeps>;

  constructor(deps: MachineSavesDeps) {
    this.deps = { now: () => Date.now(), newId: () => crypto.randomUUID(), ...deps };
  }

  list(): Promise<MachineSummary[]> {
    return this.deps.store.listMachines();
  }

  async save(name?: string): Promise<MachineSummary> {
    if ((await this.list()).length >= MAX_MACHINE_SAVES) throw new TooManySavesError();
    const data = await gzip(new Uint8Array(await this.deps.vm.saveState()));
    const createdAt = this.deps.now();
    const record: MachineRecord = {
      id: this.deps.newId(),
      name: name?.trim() || defaultSaveName(createdAt),
      createdAt,
      bytes: data.byteLength,
      data,
    };
    try {
      await this.deps.store.putMachine(record);
    } catch (error) {
      if (error instanceof DOMException && error.name === "QuotaExceededError") {
        throw new StorageFullError(Math.max(1, Math.ceil(data.byteLength / 1e6)));
      }
      throw error;
    }
    return { id: record.id, name: record.name, createdAt: record.createdAt, bytes: record.bytes };
  }

  async restore(id: string): Promise<void> {
    const record = await this.deps.store.getMachine(id);
    if (!record) throw new UnreadableSaveError();
    try {
      const state = await gunzip(record.data);
      await this.deps.vm.restoreState(state.slice().buffer);
    } catch {
      throw new UnreadableSaveError();
    }
  }

  rename(id: string, name: string): Promise<void> {
    return this.deps.store.renameMachine(id, name.trim());
  }

  delete(id: string): Promise<void> {
    return this.deps.store.deleteMachine(id);
  }

  async exportFile(id: string): Promise<{ filename: string; data: Uint8Array }> {
    const record = await this.deps.store.getMachine(id);
    if (!record) throw new UnreadableSaveError();
    const safeName = record.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return { filename: `linuxweb-${safeName}.bin.gz`, data: record.data };
  }
}
