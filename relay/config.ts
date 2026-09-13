// Settings for the LinuxWeb relay (network spec section 4).
export interface RelayConfig {
  port: number;
  allowedOrigins: string[] | "*";
  trustedProxies: string[];
}

export const DEFAULT_ORIGINS = ["https://hammadshakeelai.github.io", "http://localhost:5173", "http://localhost:4173"];

// Never add stream_limit_per_host: wisp-js 0.5.0 iterates an object there and throws.
export const WISP_OPTIONS = {
  port_blacklist: [25, 465, 587],
  allow_udp_streams: false,
  stream_limit_total: 100,
  allow_private_ips: false,
  allow_loopback_ips: false,
};

function list(value: string | undefined, fallback: string[]): string[] {
  const items = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

export function readConfig(env: Record<string, string | undefined>): RelayConfig {
  return {
    port: Number(env.PORT || 8080),
    allowedOrigins: env.ALLOWED_ORIGINS?.trim() === "*" ? "*" : list(env.ALLOWED_ORIGINS, DEFAULT_ORIGINS),
    trustedProxies: list(env.TRUSTED_PROXIES, ["127.0.0.1"]),
  };
}

export function isOriginAllowed(origin: string | undefined, allowed: string[] | "*"): boolean {
  return allowed === "*" || (origin !== undefined && allowed.includes(origin));
}
