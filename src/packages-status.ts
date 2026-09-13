// Reads /.linuxweb/packages-status from the helper and turns it into status-line messages
// (network spec section 5).
import { PACKAGES_STATUS } from "./protocol.ts";

export interface PackagesStatus {
  run: number;
  state: "installing" | "done";
  total: number;
  failed: number;
}

export function parsePackagesStatus(text: string): PackagesStatus | null {
  const match = /^(\d+) (installing|done) (\d+) (\d+)$/.exec(text.trim());
  if (!match) return null;
  return { run: Number(match[1]), state: match[2] as PackagesStatus["state"], total: Number(match[3]), failed: Number(match[4]) };
}

const count = (n: number) => `${n} ${n === 1 ? "package" : "packages"}`;

export function packagesMessage(status: PackagesStatus): { text: string; durationMs: number | null } {
  if (status.state === "installing") return { text: `Reinstalling ${count(status.total)}…`, durationMs: null };
  if (status.failed === 0) return { text: `Reinstalled ${count(status.total)}`, durationMs: 5000 };
  return {
    text: `Couldn't reinstall ${status.failed} of ${count(status.total)}. See /var/log/linuxweb-packages.log`,
    durationMs: 10_000,
  };
}

export class PackagesWatcher {
  private readonly readFile: (path: string) => Promise<Uint8Array>;
  private readonly now: () => number;
  private seen = "";
  private message: { text: string; until: number | null } | null = null;

  constructor(deps: { readFile(path: string): Promise<Uint8Array>; now?(): number }) {
    this.readFile = (path) => deps.readFile(path);
    this.now = deps.now ?? (() => Date.now());
  }

  async pollOnce(): Promise<void> {
    let text: string;
    try {
      text = new TextDecoder().decode(await this.readFile(PACKAGES_STATUS));
    } catch {
      return;
    }
    const status = parsePackagesStatus(text);
    if (!status) return;
    const key = `${status.run} ${status.state}`;
    if (key === this.seen) return;
    this.seen = key;
    const { text: messageText, durationMs } = packagesMessage(status);
    this.message = { text: messageText, until: durationMs === null ? null : this.now() + durationMs };
  }

  text(now = this.now()): string {
    if (!this.message) return "";
    if (this.message.until !== null && now >= this.message.until) return "";
    return this.message.text;
  }
}
