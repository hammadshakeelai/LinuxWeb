import type { Vm } from "./emulator.ts";
import {
  HOME_ARCHIVE,
  HOME_SIZE_LIMIT_BYTES,
  HOME_VERSION,
  POLL_INTERVAL_MS,
  RESTORE_ARCHIVE,
  RESTORED_COUNT,
} from "./protocol.ts";
import type { HomeRecord } from "./storage.ts";

export type HomeStatus =
  | { kind: "starting" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: number }
  | { kind: "too-big" }
  | { kind: "off" }
  | { kind: "paused-other-tab" };

export interface HomeSyncDeps {
  vm: Pick<Vm, "readFile" | "createFile">;
  store: { getHome(): Promise<HomeRecord | undefined>; putHome(record: HomeRecord): Promise<void> };
  onStatus(status: HomeStatus): void;
  now?(): number;
  sleep?(ms: number): Promise<void>;
  persist?(): Promise<unknown>;
}

export class HomeSync {
  private readonly deps: Required<HomeSyncDeps>;
  private baseline = "";
  private persisted = false;
  private busy = false;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(deps: HomeSyncDeps) {
    this.deps = {
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      persist: () => globalThis.navigator?.storage?.persist?.() ?? Promise.resolve(false),
      ...deps,
    };
  }

  private async readText(path: string): Promise<string> {
    try {
      return new TextDecoder().decode(await this.deps.vm.readFile(path)).trim();
    } catch {
      return "";
    }
  }

  /** Restores the saved home folder. Returns the restored file count, or null when nothing was saved. */
  async restore(timeoutMs = 60_000): Promise<number | null> {
    const record = await this.deps.store.getHome();
    if (record) {
      await this.deps.vm.createFile(RESTORED_COUNT, new Uint8Array());
      await this.deps.vm.createFile(RESTORE_ARCHIVE, record.data);
      const started = this.deps.now();
      let count = await this.readText(RESTORED_COUNT);
      while (!count) {
        if (this.deps.now() - started > timeoutMs) throw new Error("Timed out restoring the home folder");
        await this.deps.sleep(500);
        count = await this.readText(RESTORED_COUNT);
      }
      this.baseline = await this.readText(HOME_VERSION);
      return Number(count);
    }
    this.baseline = await this.readText(HOME_VERSION);
    return null;
  }

  async pollOnce(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const version = await this.readText(HOME_VERSION);
      if (!version || version === this.baseline) return;
      this.deps.onStatus({ kind: "saving" });
      const data = await this.deps.vm.readFile(HOME_ARCHIVE);
      this.baseline = version;
      if (data.byteLength > HOME_SIZE_LIMIT_BYTES) {
        this.deps.onStatus({ kind: "too-big" });
        return;
      }
      const savedAt = this.deps.now();
      await this.deps.store.putHome({ data, bytes: data.byteLength, savedAt });
      this.deps.onStatus({ kind: "saved", savedAt });
      if (!this.persisted) {
        this.persisted = true;
        void this.deps.persist();
      }
    } finally {
      this.busy = false;
    }
  }

  start(): void {
    this.timer = setInterval(() => {
      this.pollOnce().catch(() => this.deps.onStatus({ kind: "off" }));
    }, POLL_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
