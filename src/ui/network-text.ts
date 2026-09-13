import type { NetworkState } from "../network.ts";

const LABELS: Record<NetworkState, string> = {
  online: "Network: Online",
  offline: "Network: Offline",
  unreachable: "Network: Unreachable",
};

export const RELAY_INVALID_MESSAGE = "Relay addresses start with wisp:// or wisps:// and end with /";
export const RELAY_PRIVACY_NOTE =
  "Linux's internet traffic goes through this relay. HTTPS stays encrypted, but the relay sees which addresses and ports you connect to. DNS lookups go to Cloudflare.";

export function networkButtonLabel(state: NetworkState): string {
  return LABELS[state];
}

export function networkStatusText(state: NetworkState, relay: string | null): string {
  if (state === "online") return `Online through ${relay}`;
  if (state === "unreachable") return "Can't reach that relay. Check the address or try again later.";
  return "Offline: no relay is set";
}
