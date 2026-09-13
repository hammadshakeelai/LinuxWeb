// Relay address, reachability probe, and the online/offline signal to the guest (network spec section 4).
import { NETWORK_STATE } from "./protocol.ts";

export const RELAY_STORAGE_KEY = "linuxweb-relay";
export type NetworkState = "online" | "offline" | "unreachable";
export type RelayStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function isValidRelayUrl(url: string): boolean {
  return /^wisps?:\/\//.test(url) && url.endsWith("/") && URL.canParse(url);
}

export function readSavedRelay(storage: RelayStorage | undefined): string | null {
  try {
    return storage?.getItem(RELAY_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeSavedRelay(storage: RelayStorage | undefined, url: string | null): void {
  try {
    if (url === null) storage?.removeItem(RELAY_STORAGE_KEY);
    else storage?.setItem(RELAY_STORAGE_KEY, url);
  } catch {
    // Storage is blocked in this browser; the choice lasts until reload only.
  }
}

export function relayUrl(saved: string | null, siteDefault: string | undefined): string | null {
  if (saved !== null) return isValidRelayUrl(saved) ? saved : null;
  return siteDefault && isValidRelayUrl(siteDefault) ? siteDefault : null;
}

export interface ProbeSocket {
  addEventListener(type: "open" | "error" | "close", listener: () => void): void;
  close(): void;
}

export function probeRelay(
  url: string,
  timeoutMs = 5000,
  createSocket: (url: string) => ProbeSocket = (u) => new WebSocket(u),
): Promise<"online" | "unreachable"> {
  return new Promise((resolve) => {
    let settled = false;
    let socket: ProbeSocket | undefined;
    const finish = (result: "online" | "unreachable") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket?.close();
      } catch {
        // Already closed.
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish("unreachable"), timeoutMs);
    try {
      socket = createSocket(url.replace(/^wisp/, "ws"));
    } catch {
      finish("unreachable");
      return;
    }
    socket.addEventListener("open", () => finish("online"));
    socket.addEventListener("error", () => finish("unreachable"));
    socket.addEventListener("close", () => finish("unreachable"));
  });
}

export interface NetworkMonitorDeps {
  relay: string | null;
  writeGuest(path: string, data: Uint8Array): Promise<void>;
  onChange(state: NetworkState): void;
  probe?(url: string): Promise<"online" | "unreachable">;
  intervalMs?: number;
}

export class NetworkMonitor {
  state: NetworkState = "offline";
  private readonly deps: Required<NetworkMonitorDeps>;
  private published: NetworkState | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(deps: NetworkMonitorDeps) {
    this.deps = { probe: (url) => probeRelay(url), intervalMs: 60_000, ...deps };
  }

  check(): Promise<NetworkState> {
    return this.deps.relay ? this.deps.probe(this.deps.relay) : Promise.resolve("offline");
  }

  async publish(state: NetworkState): Promise<void> {
    this.state = state;
    if (state === this.published) return;
    this.deps.onChange(state);
    await this.deps.writeGuest(NETWORK_STATE, new TextEncoder().encode(state === "online" ? "online" : "offline"));
    this.published = state;
  }

  async refresh(): Promise<NetworkState> {
    await this.publish(await this.check());
    return this.state;
  }

  start(): void {
    if (!this.deps.relay) return;
    this.timer = setInterval(() => {
      this.refresh().catch(() => {});
    }, this.deps.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
  }
}
