# LinuxWeb Network Edition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn LinuxWeb into an almost-full, network-capable Alpine machine: a large toolset, outgoing TCP through a WISP relay, packages that reinstall on the next visit, and apt/pacman/snap commands that translate to apk.

**Architecture:** The Alpine image grows to about 227 packages and is resumed from a snapshot built with a virtio network card and no relay. The page adds the relay address when one is set, tells the guest `online`/`offline` through `/.linuxweb/network`, and reads reinstall progress from `/.linuxweb/packages-status`. A small wisp-js relay server lives in `relay/`, ready to deploy later.

**Tech Stack:** v86 0.5.458 (`net_device` virtio + `wisp://` relay), Alpine 3.21 i386, POSIX sh guest scripts, Vite 8 + TypeScript 7, xterm.js 6, Vitest 5, Playwright 1.63, Node 24, `@mercuryworkshop/wisp-js` 0.5.0.

**Spec:** `docs/superpowers/specs/2026-09-13-linuxweb-network-design.md` (builds on `docs/superpowers/specs/2026-09-13-linuxweb-design.md`).

## Global Constraints

- Memory: 512 MB (`MEMORY_SIZE = 512 * 1024 * 1024`).
- The snapshot is built with `net_device: { type: "virtio" }` and no `relay_url`; the page adds `relay_url` only when a valid relay is set.
- Relay addresses start with `wisp://` or `wisps://` and end with `/`.
- localStorage key for a visitor's relay: `linuxweb-relay`. Site default: `import.meta.env.VITE_RELAY_URL`.
- Relay rules: `port_blacklist: [25, 465, 587]`, `allow_udp_streams: false`, `stream_limit_total: 100`, `allow_private_ips: false`, `allow_loopback_ips: false`. Never set `stream_limit_per_host` (wisp-js 0.5.0 iterates an object there and throws).
- Relay env: `PORT` (default 8080), `ALLOWED_ORIGINS` (default `https://hammadshakeelai.github.io,http://localhost:5173,http://localhost:4173`; `*` disables the check), `TRUSTED_PROXIES` (default `127.0.0.1`).
- Exchange files: `/.linuxweb/network` (`online`/`offline`, page writes), `/.linuxweb/packages-status` (`<run> <state> <total> <failed>`, helper writes), `/root/.config/linuxweb/packages`, `/var/log/linuxweb-packages.log`, `/usr/local/share/linuxweb/base-world`, `/usr/local/share/linuxweb/commands.tsv`.
- The page writes `/.linuxweb/network` only after the home-folder restore has finished or been skipped.
- Offline apk message (exact): `LinuxWeb is offline: set a relay with the Network button to install packages.`
- Missing-command hint (exact): `<cmd>: command not found. Install it with: apk add <pkg>`, plus `(needs the network: set a relay with the Network button)` when offline.
- Network button labels: `Network: Online`, `Network: Offline`, `Network: Unreachable`.
- Status messages: `Reinstalling N packages…` (singular `1 package`), `Reinstalled N packages` for 5 s, `Couldn't reinstall F of N packages. See /var/log/linuxweb-packages.log` for 10 s.
- Every shell prompt stays `localhost:~# ` (tests, e2e and README images depend on it).
- Docker does not work on the development machine: the image is built only in GitHub Actions. Local page testing uses the `linuxweb-image` artifact (`gh run download <run> -R hammadshakeelai/LinuxWeb -n linuxweb-image`, then `tar -xf image-out.tar -C image`).
- `main` is protected: all work goes on branch `feat/network` through a PR. Never commit with failing tests; check exit codes, not grep output.
- Lint: `oxlint --deny-warnings` (correctness errors, suspicious warnings). TypeScript: explicit `.ts` import extensions, `erasableSyntaxOnly`.

## File Map

| File | Task | Responsibility |
| --- | --- | --- |
| `relay/config.ts` | 1 | Env parsing, origin check, wisp-js option values |
| `relay/server.ts` | 1 | HTTP server, Origin gate, WISP routing, `startRelay()` |
| `relay/wisp-js.d.ts` | 1 | Types for the parts of wisp-js we use |
| `relay/relay.test.ts` | 1 | Config, Origin, and port-rule tests (no internet) |
| `relay/package.json`, `relay/package-lock.json`, `relay/Dockerfile` | 1 | Standalone deploy |
| `image/Dockerfile`, `image/rootfs/etc/network/interfaces`, `image/rootfs/etc/profile.d/linuxweb.sh` | 2, 3 | Packages, bash, network config, prompt, command hints |
| `src/vm-config.ts` | 2 | 512 MB, virtio card, optional relay |
| `image/build.sh` | 2 | `version.txt` |
| `image/test-image.ts` | 2, 3 | No-network image checks |
| `image/test-network.ts` | 2, 4 | Networking checks through a local relay |
| `.github/workflows/ci.yml` | 2, 9 | Network job |
| `image/rootfs/usr/local/bin/{apk,apt,apt-get,pacman,snap}` | 3 | Offline guard and translators |
| `image/tools/commands-index.py` | 3 | Builds `commands.tsv` |
| `image/rootfs/usr/local/share/linuxweb/help.txt` | 3 | Help tour |
| `image/rootfs/usr/local/bin/linuxweb-helper` | 4 | DHCP, package tracking, reinstall |
| `src/protocol.ts` | 5 | New exchange file paths |
| `src/network.ts` | 5 | Relay address, validation, probe, `NetworkMonitor` |
| `src/emulator.ts` | 5 | Relay option, `MemoryError` |
| `src/packages-status.ts` | 6 | Parse status, messages with expiry |
| `src/welcome.ts`, `src/home.ts` | 6 | Network line, `flush()` |
| `src/storage.ts`, `src/saves.ts`, `src/ui/saves-dialog.ts` | 7 | Image version on saves |
| `src/ui/network-text.ts`, `src/ui/network-dialog.ts`, `src/ui/window.ts`, `src/main.ts`, `src/ui/theme.css` | 8 | Network UI and wiring |
| `e2e/network.spec.ts`, `playwright.config.ts` | 9 | Network end-to-end test |
| `.github/workflows/deploy.yml`, `README.md`, `relay/README.md`, `THIRD_PARTY_NOTICES.md`, spec | 9 | Deploy setting and docs |

---

### Task 1: The relay server

**Files:**
- Create: `relay/config.ts`, `relay/server.ts`, `relay/wisp-js.d.ts`, `relay/relay.test.ts`, `relay/package.json`, `relay/Dockerfile`
- Generate: `relay/package-lock.json`
- Modify: `package.json` (devDependency, lint path), `vitest.config.ts` (include), `tsconfig.json` (include)

**Interfaces:**
- Produces:
  - `interface RelayConfig { port: number; allowedOrigins: string[] | "*"; trustedProxies: string[] }`
  - `DEFAULT_ORIGINS: string[]`, `WISP_OPTIONS` (the Global Constraints relay rules)
  - `readConfig(env: Record<string, string | undefined>): RelayConfig`
  - `isOriginAllowed(origin: string | undefined, allowed: string[] | "*"): boolean`
  - `interface Relay { port: number; close(): Promise<void> }`
  - `startRelay(config: RelayConfig, overrides?: Record<string, unknown>): Promise<Relay>` (used by Tasks 2, 4, 9)

- [ ] **Step 1: Create the branch and install wisp-js**

```bash
cd C:/Users/HP/Documents/GitHub/LinuxWeb
git switch spec/network && git switch -c feat/network
npm install --save-dev --save-exact @mercuryworkshop/wisp-js@0.5.0
```

In `package.json` change the lint script to:
```json
"lint": "oxlint --deny-warnings src scripts image e2e relay",
```
In `vitest.config.ts` change `include` to:
```ts
include: ["src/**/*.test.ts", "image/**/*.test.ts", "relay/**/*.test.ts"],
```
In `tsconfig.json` change `include` to:
```json
"include": ["src", "scripts", "image", "e2e", "relay", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
```

- [ ] **Step 2: Write the failing tests**

`relay/relay.test.ts`:
```ts
import { request } from "node:http";
import { createServer as createTcpServer, type AddressInfo, type Server } from "node:net";
import { packet } from "@mercuryworkshop/wisp-js/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_ORIGINS, WISP_OPTIONS, isOriginAllowed, readConfig } from "./config.ts";
import { startRelay, type Relay } from "./server.ts";

describe("readConfig", () => {
  it("uses the defaults", () => {
    expect(readConfig({})).toEqual({ port: 8080, allowedOrigins: DEFAULT_ORIGINS, trustedProxies: ["127.0.0.1"] });
  });

  it("reads PORT, ALLOWED_ORIGINS and TRUSTED_PROXIES", () => {
    expect(readConfig({ PORT: "9000", ALLOWED_ORIGINS: "https://a.example, https://b.example", TRUSTED_PROXIES: "10.0.0.1" })).toEqual({
      port: 9000,
      allowedOrigins: ["https://a.example", "https://b.example"],
      trustedProxies: ["10.0.0.1"],
    });
    expect(readConfig({ ALLOWED_ORIGINS: "*" }).allowedOrigins).toBe("*");
  });
});

describe("isOriginAllowed", () => {
  it("allows listed origins only, and everything with *", () => {
    expect(isOriginAllowed("https://hammadshakeelai.github.io", DEFAULT_ORIGINS)).toBe(true);
    expect(isOriginAllowed("https://evil.example", DEFAULT_ORIGINS)).toBe(false);
    expect(isOriginAllowed(undefined, DEFAULT_ORIGINS)).toBe(false);
    expect(isOriginAllowed(undefined, "*")).toBe(true);
  });
});

describe("WISP_OPTIONS", () => {
  it("blocks email ports, UDP, private and loopback addresses, and caps streams", () => {
    expect(WISP_OPTIONS).toEqual({
      port_blacklist: [25, 465, 587],
      allow_udp_streams: false,
      stream_limit_total: 100,
      allow_private_ips: false,
      allow_loopback_ips: false,
    });
  });
});

function upgradeStatus(port: number, origin?: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({
      host: "127.0.0.1",
      port,
      path: "/",
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        ...(origin ? { Origin: origin } : {}),
      },
    });
    req.on("upgrade", (res, socket) => {
      socket.destroy();
      resolve(res.statusCode ?? 0);
    });
    req.on("response", (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", reject);
    req.end();
  });
}

// Minimal WISP v1 client frames: type, stream id (u32 LE), payload.
function connectFrame(streamId: number, port: number, host: string): Uint8Array<ArrayBuffer> {
  const name = new TextEncoder().encode(host);
  const frame = new Uint8Array(8 + name.length);
  const view = new DataView(frame.buffer);
  view.setUint8(0, 0x01);
  view.setUint32(1, streamId, true);
  view.setUint8(5, 0x01); // TCP
  view.setUint16(6, port, true);
  frame.set(name, 8);
  return frame;
}

function dataFrame(streamId: number, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(5 + data.length);
  const view = new DataView(frame.buffer);
  view.setUint8(0, 0x02);
  view.setUint32(1, streamId, true);
  frame.set(data, 5);
  return frame;
}

// Opens one stream through the relay and sends "ping". Resolves "echoed" when data comes back,
// or the CLOSE reason byte when the relay refuses the stream.
function openStream(relayPort: number, targetPort: number): Promise<"echoed" | number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${relayPort}/`);
    ws.binaryType = "arraybuffer";
    ws.addEventListener("error", () => reject(new Error("WebSocket error")));
    ws.addEventListener("open", () => {
      ws.send(connectFrame(1, targetPort, "127.0.0.1"));
      ws.send(dataFrame(1, new TextEncoder().encode("ping")));
    });
    ws.addEventListener("message", (event) => {
      const frame = new Uint8Array(event.data as ArrayBuffer);
      if (frame[0] === 0x02) {
        ws.close();
        resolve("echoed");
      } else if (frame[0] === 0x04) {
        ws.close();
        resolve(frame[5]);
      }
    });
  });
}

describe("startRelay", () => {
  let gated: Relay;
  let open: Relay;
  let echo: Server;

  beforeAll(async () => {
    // Loopback is allowed only here, so the tests need no internet.
    gated = await startRelay({ port: 0, allowedOrigins: DEFAULT_ORIGINS, trustedProxies: ["127.0.0.1"] }, { allow_loopback_ips: true });
    open = await startRelay({ port: 0, allowedOrigins: "*", trustedProxies: ["127.0.0.1"] }, { allow_loopback_ips: true });
    echo = createTcpServer((socket) => socket.pipe(socket));
    await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve));
  });

  afterAll(async () => {
    await gated.close();
    await open.close();
    await new Promise<void>((resolve) => echo.close(() => resolve()));
  });

  it("refuses WebSocket upgrades from other origins or without an origin", async () => {
    expect(await upgradeStatus(gated.port, "https://evil.example")).toBe(403);
    expect(await upgradeStatus(gated.port)).toBe(403);
    expect(await upgradeStatus(gated.port, "https://hammadshakeelai.github.io")).toBe(101);
  });

  it("forwards allowed ports and blocks email ports", async () => {
    expect(await openStream(open.port, (echo.address() as AddressInfo).port)).toBe("echoed");
    expect(await openStream(open.port, 25)).toBe(packet.close_reasons.HostBlocked);
    expect(await openStream(open.port, 587)).toBe(packet.close_reasons.HostBlocked);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run relay`
Expected: FAIL, "Failed to resolve import ./config.ts" (or "Cannot find module").

- [ ] **Step 4: Write the implementation**

`relay/wisp-js.d.ts`:
```ts
// Types for the parts of @mercuryworkshop/wisp-js 0.5.0 that the relay uses (the package ships none).
declare module "@mercuryworkshop/wisp-js/server" {
  import type { IncomingMessage } from "node:http";
  import type { Duplex } from "node:stream";

  export const server: {
    routeRequest(request: IncomingMessage, socket: Duplex, head: Buffer): void;
    options: Record<string, unknown>;
  };
  export const packet: {
    close_reasons: Record<string, number>;
    stream_types: Record<string, number>;
  };
  export const logging: {
    DEBUG: number;
    INFO: number;
    WARN: number;
    ERROR: number;
    NONE: number;
    set_level(level: number): void;
  };
}
```

`relay/config.ts`:
```ts
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
```

`relay/server.ts`:
```ts
// The LinuxWeb relay: forwards v86's WISP connections to the internet (network spec section 4).
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";
import { WISP_OPTIONS, isOriginAllowed, readConfig, type RelayConfig } from "./config.ts";

export interface Relay {
  port: number;
  close(): Promise<void>;
}

export function startRelay(config: RelayConfig, overrides: Record<string, unknown> = {}): Promise<Relay> {
  // WARN keeps visitors' addresses and destinations out of the logs.
  logging.set_level(logging.WARN);
  Object.assign(wisp.options, WISP_OPTIONS, { parse_real_ip_from: config.trustedProxies }, overrides);

  const sockets = new Set<Duplex>();
  const http = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("LinuxWeb relay\n");
  });
  http.on("upgrade", (request, socket, head) => {
    if (!isOriginAllowed(request.headers.origin, config.allowedOrigins)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    wisp.routeRequest(request, socket, head);
  });

  return new Promise((resolve) => {
    http.listen(config.port, () => {
      resolve({
        port: (http.address() as AddressInfo).port,
        close: () =>
          new Promise((done) => {
            for (const socket of sockets) socket.destroy();
            http.closeAllConnections();
            http.close(() => done());
          }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const relay = await startRelay(readConfig(process.env));
  console.log(`LinuxWeb relay listening on port ${relay.port}`);
}
```

`relay/package.json`:
```json
{
  "name": "linuxweb-relay",
  "private": true,
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": { "start": "node server.ts" },
  "dependencies": { "@mercuryworkshop/wisp-js": "0.5.0" }
}
```

`relay/Dockerfile`:
```dockerfile
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY config.ts server.ts ./
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
USER node
CMD ["node", "server.ts"]
```

Generate the relay lockfile: `cd relay && npm install --package-lock-only && cd ..`

- [ ] **Step 5: Run the tests, lint and typecheck**

Run: `npx vitest run relay; npm run lint; npx tsc --noEmit`
Expected: 6 relay tests PASS; lint and tsc exit 0. Then run the full suite: `npx vitest run` (all PASS).

- [ ] **Step 6: Commit**

```bash
git add relay package.json package-lock.json vitest.config.ts tsconfig.json
git commit -m "feat: add the LinuxWeb WISP relay server with origin and port rules"
```

---

### Task 2: Bigger image, virtio network card, and the checks that come first

This task answers the spec's section 8 questions in CI before anything else is built.

**Files:**
- Modify: `image/Dockerfile`, `image/rootfs/etc/profile.d/linuxweb.sh`, `src/vm-config.ts`, `src/vm-config.test.ts`, `image/build.sh`, `image/test-image.ts`, `.github/workflows/ci.yml`
- Create: `image/rootfs/etc/network/interfaces`, `image/test-network.ts`

**Interfaces:**
- Consumes: `startRelay`, `readConfig` (Task 1)
- Produces:
  - `MEMORY_SIZE = 536870912`; `interface VmPaths { ...; relayUrl?: string }`; `vmOptions` sets `net_device`
  - `image/out/version.txt` (12 hex characters)
  - `/usr/local/share/linuxweb/base-world`
  - CI job "Network (uses the internet)"

- [ ] **Step 1: Update the vm-config tests (failing)**

Replace `src/vm-config.test.ts` with:
```ts
import { describe, expect, it } from "vitest";
import { CMDLINE, MEMORY_SIZE, vmOptions } from "./vm-config.ts";

const paths = { bios: "b", vgaBios: "v", baseurl: "rootfs/", basefs: "fs.json" };

describe("vmOptions", () => {
  it("uses 512 MB and the 9P root command line", () => {
    const options = vmOptions(paths);
    expect(MEMORY_SIZE).toBe(536870912);
    expect(options.memory_size).toBe(536870912);
    expect(options.cmdline).toBe(CMDLINE);
    expect(options.filesystem).toEqual({ baseurl: "rootfs/", basefs: "fs.json" });
    expect(options.bzimage_initrd_from_filesystem).toBe(true);
  });

  it("adds the snapshot and wasm path only when given", () => {
    expect(vmOptions(paths).initial_state).toBeUndefined();
    expect(vmOptions(paths).wasm_path).toBeUndefined();
    const options = vmOptions({ ...paths, state: "state.bin.zst", wasm: "v86.wasm" });
    expect(options.initial_state).toEqual({ url: "state.bin.zst" });
    expect(options.wasm_path).toBe("v86.wasm");
  });

  it("always has a virtio network card and adds the relay only when given", () => {
    expect(vmOptions(paths).net_device).toEqual({ type: "virtio" });
    expect(vmOptions({ ...paths, relayUrl: "wisps://relay.example.com/" }).net_device).toEqual({
      type: "virtio",
      relay_url: "wisps://relay.example.com/",
    });
  });
});
```

Run: `npx vitest run src/vm-config.test.ts`
Expected: FAIL (memory is 268435456; `net_device` undefined).

- [ ] **Step 2: Update `src/vm-config.ts`**

```ts
// v86 options shared by image/build-state.ts, image/test-image.ts, image/test-network.ts and the page.
// A snapshot only restores into an emulator created with the same devices and memory size.
import type { V86Options } from "v86";

export const MEMORY_SIZE = 512 * 1024 * 1024;
export const VGA_MEMORY_SIZE = 8 * 1024 * 1024;
export const CMDLINE =
  "rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable init_on_free=on";

export interface VmPaths {
  wasm?: string;
  bios: string;
  vgaBios: string;
  baseurl: string;
  basefs: string;
  state?: string;
  relayUrl?: string;
}

export function vmOptions(paths: VmPaths): V86Options {
  return {
    ...(paths.wasm ? { wasm_path: paths.wasm } : {}),
    memory_size: MEMORY_SIZE,
    vga_memory_size: VGA_MEMORY_SIZE,
    autostart: true,
    bios: { url: paths.bios },
    vga_bios: { url: paths.vgaBios },
    cmdline: CMDLINE,
    bzimage_initrd_from_filesystem: true,
    filesystem: { baseurl: paths.baseurl, basefs: paths.basefs },
    ...(paths.state ? { initial_state: { url: paths.state } } : {}),
    // The card is always present so the snapshot matches with or without a relay.
    net_device: { type: "virtio", ...(paths.relayUrl ? { relay_url: paths.relayUrl } : {}) },
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
  };
}
```

Run: `npx vitest run src/vm-config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Grow the image**

Replace `image/Dockerfile` with:
```dockerfile
# Based on v86's tools/docker/alpine/Dockerfile at d96be77.
FROM docker.io/i386/alpine:3.21

ENV KERNEL=virt

RUN apk add --no-cache openrc alpine-base agetty alpine-conf linux-$KERNEL linux-firmware-none \
      nano vim python3 git mandoc man-pages tree htop

# Network Edition toolset (network spec section 3).
RUN apk add --no-cache \
      bash bash-completion coreutils util-linux findutils gawk less file which btop ncdu lsof strace tmux fastfetch sudo \
      zsh fish neovim micro mc \
      bat ripgrep fd fzf eza \
      curl wget openssh-client-default bind-tools iproute2 iputils traceroute nmap netcat-openbsd whois w3m \
      build-base nasm gdb valgrind cmake meson ninja-build \
      py3-pip nodejs npm lua5.4 sqlite jq postgresql17 \
      zip unzip xz \
      cmatrix sl figlet

RUN sed -i 's/getty 38400 tty1/agetty --autologin root tty1 linux/' /etc/inittab \
 && echo 'ttyS0::respawn:/sbin/agetty --autologin root -s ttyS0 115200 vt100' >> /etc/inittab \
 && echo "root:" | chpasswd \
 && sed -i 's#^root:x:0:0:root:/root:/bin/sh$#root:x:0:0:root:/root:/bin/bash#' /etc/passwd \
 && grep -q '^root:x:0:0:root:/root:/bin/bash$' /etc/passwd \
 && setup-hostname localhost

RUN for i in devfs dmesg mdev hwdrivers; do rc-update add $i sysinit; done \
 && for i in hwclock modules sysctl hostname syslog bootmisc; do rc-update add $i boot; done \
 && rc-update add killprocs shutdown

# The helper subtracts this list from /etc/apk/world to find packages a visitor added.
RUN mkdir -p /usr/local/share/linuxweb && sort -u /etc/apk/world > /usr/local/share/linuxweb/base-world

COPY rootfs/ /
RUN chmod +x /usr/local/bin/linuxweb-helper /usr/local/bin/linuxweb-help /etc/init.d/linuxweb-helper \
 && mkdir -p /.linuxweb \
 && rc-update add linuxweb-helper default

RUN mkinitfs -F "base virtio 9p" $(cat /usr/share/kernel/$KERNEL/kernel.release)
```

Create `image/rootfs/etc/network/interfaces` (LF line endings; `.gitattributes` already covers `image/rootfs/**`):
```
auto lo
iface lo inet loopback

# No "auto eth0": the helper runs DHCP when the page says the network is online.
iface eth0 inet dhcp
```

Replace `image/rootfs/etc/profile.d/linuxweb.sh` with:
```sh
# BusyBox ash and bash both have a built-in "help"; show the LinuxWeb tour instead.
alias help=linuxweb-help
export TERM=xterm-256color
# Keep the v1 prompt (localhost:~# ) for every login shell.
PS1='\h:\w\$ '
```

- [ ] **Step 4: Write the image version in `image/build.sh`**

After the line `zstd -19 --rm -f "$OUT/state.bin" -o "$OUT/state.bin.zst"` add:
```bash
# The page marks machine saves made on a different image as older (network spec section 4).
cat "$OUT/fs.json" "$OUT/state.bin.zst" | sha256sum | cut -c1-12 > "$OUT/version.txt"
```

- [ ] **Step 5: Add the tool checks to `image/test-image.ts`**

Replace the block from `// Spec 9.6: tools run in 256 MB.` through `pass("python3, git and vim run");` with:
```ts
// Tools run in 512 MB. Each command echoes a marker computed by the shell ($((20+22))),
// so the typed command line itself can never match.
await run("python3 -c 'print(40+2)'", "42\r\n");
await run("git --version && vim --version | head -n 1", "VIM - Vi IMproved");
pass("python3, git and vim run");

await run('echo "SHELL-$0"', "SHELL--bash");
pass("bash is the login shell");

await run(
  "printf 'int main(void){return 0;}\\n' > /tmp/h.c && gcc /tmp/h.c -o /tmp/h && /tmp/h && echo GCC-$((20+22))",
  "GCC-42",
  600_000,
);
pass("gcc compiles and runs a program");

await run(
  "printf 'section .text\\nglobal _start\\n_start:\\nmov eax,1\\nxor ebx,ebx\\nint 0x80\\n' > /tmp/a.asm && nasm -f elf32 /tmp/a.asm -o /tmp/a.o && ld -m elf_i386 /tmp/a.o -o /tmp/a && /tmp/a && echo NASM-$((20+22))",
  "NASM-42",
  300_000,
);
pass("nasm assembles and links a program");

await run("valgrind -q true && echo VALGRIND-$((20+22))", "VALGRIND-42", 600_000);
pass("valgrind runs");

await run("node -e 'process.exit(0)' && echo NODE-$((20+22))", "NODE-42", 300_000);
pass("node runs");

await run(
  "mkdir -p /run/postgresql && chown postgres /run/postgresql && su -s /bin/sh postgres -c 'initdb -D /tmp/pg >/dev/null && pg_ctl -D /tmp/pg -l /tmp/pg.log -w start >/dev/null && pg_ctl -D /tmp/pg -w stop >/dev/null' && echo PG-$((20+22))",
  "PG-42",
  900_000,
);
pass("PostgreSQL initializes, starts and stops");

await run("rm -rf /tmp/pg /tmp/pg.log /tmp/h /tmp/h.c /tmp/a /tmp/a.o /tmp/a.asm && echo CLEAN-$((20+22))", "CLEAN-42");
```

In the machine-save block change the assertion to:
```ts
assert.ok(savedMB < 60, "compressed machine save is under 60 MB");
```
In the sizes block change the assertion to:
```ts
assert.ok(treeMB < 850, "file tree is under 850 MB");
```

- [ ] **Step 6: Write the first network checks**

`image/test-network.ts`:
```ts
// Resumes the snapshot with a local relay and checks real networking (network spec sections 7 and 8).
// Uses the internet. Exits non-zero on the first failure.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { V86 } from "v86";
import { readConfig } from "../relay/config.ts";
import { startRelay } from "../relay/server.ts";
import { vmOptions } from "../src/vm-config.ts";
import { collectSerial } from "./serial.ts";

const require = createRequire(import.meta.url);
const file = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const PROMPT = "localhost:~# ";

const relay = await startRelay({ ...readConfig({}), port: 0, allowedOrigins: "*" });
const relayUrl = `wisp://127.0.0.1:${relay.port}/`;

function startEmulator() {
  return new V86(
    vmOptions({
      wasm: require.resolve("v86/build/v86.wasm"),
      bios: file("../public/bios/seabios.bin"),
      vgaBios: file("../public/bios/vgabios.bin"),
      baseurl: file("./out/rootfs/"),
      basefs: file("./out/fs.json"),
      state: file("./out/state.bin.zst"),
      relayUrl,
    }),
  );
}

function pass(message: string) {
  console.log(`PASS ${message}`);
}

const emulator = startEmulator();
const serial = collectSerial(emulator);
await new Promise<void>((resolve) => emulator.add_listener("emulator-loaded", () => resolve()));

async function run(command: string, expect: string, timeoutMs = 120_000) {
  const from = serial.mark();
  emulator.serial0_send(`${command}\n`);
  return serial.until(expect, timeoutMs, from);
}

await run("", PROMPT);
await run("ip link set eth0 up && udhcpc -i eth0 -n -q -t 10 && echo DHCP-$((20+22))", "DHCP-42", 180_000);
await run("ip -4 addr show eth0", "192.168.86.100");
pass("DHCP assigns 192.168.86.100 through the relay's virtual router");

await run("curl -sS -o /dev/null -w 'HTTP-%{http_code}\\n' https://dl-cdn.alpinelinux.org/alpine/", "HTTP-200", 180_000);
pass("curl reaches an HTTPS site");

await run("/sbin/apk add nyancat && echo APK-$((20+22))", "APK-42", 600_000);
pass("apk add installs a package");

await emulator.destroy();
await relay.close();
console.log("All network checks passed.");
process.exit(0);
```

- [ ] **Step 7: Add the network job to `.github/workflows/ci.yml`**

Append under `jobs:` (after the `validate` job):
```yaml
  network:
    name: Network (uses the internet)
    needs: image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      - uses: actions/download-artifact@v8
        with:
          name: linuxweb-image

      - name: Unpack the image
        run: mkdir -p image && tar -xf image-out.tar -C image

      - run: node image/test-network.ts
```

- [ ] **Step 8: Local checks, commit, push, and open a draft PR**

Run: `npm run lint; npx tsc --noEmit; npx vitest run`
Expected: all exit 0.

```bash
git add image src/vm-config.ts src/vm-config.test.ts .github/workflows/ci.yml
git commit -m "feat: grow the image, add a virtio network card and first network checks"
git push -u origin feat/network
gh pr create --draft --base main --head feat/network --title "Network Edition" --body "Work in progress: see docs/superpowers/plans/2026-09-13-linuxweb-network.md"
```

- [ ] **Step 9: Verify the section 8 assumptions in CI**

Run: `gh pr checks --watch` (from the repo directory), then read the logs:
```bash
gh run view <run-id> -R hammadshakeelai/LinuxWeb --log | grep -E "PASS|INFO|FAIL|Error"
```
Expected in "Build and test image": PASS lines for bash, gcc, nasm, valgrind, node, PostgreSQL; `INFO machine save: ... MB gzip` under 60; `INFO file tree ... MB` under 850.
Expected in "Network (uses the internet)": PASS for DHCP, curl, and apk add.

If a check fails, fix the cause (for example a package path or a PostgreSQL command) and push again. Do not start Task 3 until all of these pass. Record the measured save size, tree size, and image job duration in the PR description.

---

### Task 3: Shell experience: offline guard, apt/pacman/snap, command hints, help

**Files:**
- Create: `image/rootfs/usr/local/bin/apk`, `image/rootfs/usr/local/bin/apt`, `image/rootfs/usr/local/bin/apt-get`, `image/rootfs/usr/local/bin/pacman`, `image/rootfs/usr/local/bin/snap`, `image/tools/commands-index.py`
- Modify: `image/Dockerfile`, `image/rootfs/etc/profile.d/linuxweb.sh`, `image/rootfs/usr/local/share/linuxweb/help.txt`, `image/test-image.ts`, `docs/superpowers/specs/2026-09-13-linuxweb-network-design.md`

**Interfaces:**
- Consumes: `/.linuxweb/network` contents (`online` means online; anything else, or a missing file, is offline)
- Produces: `/usr/local/share/linuxweb/commands.tsv` (`command<TAB>package`); the exact messages in Global Constraints

- [ ] **Step 1: Write the failing image checks**

In `image/test-image.ts`, directly after `pass("bash is the login shell");` add:
```ts
await run("nyancat", "(needs the network: set a relay with the Network button)");
assert.ok(serial.text.includes("nyancat: command not found. Install it with: apk add nyancat"), "missing command suggests its package");
pass("a missing command suggests its package and says the network is offline");

const aptOut = await run("apt install build-essential nyancat; echo APT-$((20+22))", "APT-42");
assert.ok(aptOut.includes("apt on LinuxWeb runs Alpine's package manager: apk add build-base nyancat"), "apt translates to apk with Alpine names");
assert.ok(aptOut.includes("LinuxWeb is offline: set a relay with the Network button to install packages."), "apk explains it is offline");
const aptGetOut = await run("apt-get update; echo APTGET-$((20+22))", "APTGET-42");
assert.ok(aptGetOut.includes("apt-get on LinuxWeb runs Alpine's package manager: apk update"), "apt-get translates to apk");
const pacmanOut = await run("pacman -S nyancat; echo PACMAN-$((20+22))", "PACMAN-42");
assert.ok(pacmanOut.includes("pacman on LinuxWeb runs Alpine's package manager: apk add nyancat"), "pacman translates to apk");
const snapOut = await run("snap install nyancat; echo SNAP-$((20+22))", "SNAP-42");
assert.ok(snapOut.includes("Snaps need systemd, which LinuxWeb doesn't have. Trying apk add nyancat instead."), "snap explains and tries apk");
pass("apt, apt-get, pacman and snap translate to apk, and apk explains it is offline");
```

Directly after `pass("PostgreSQL initializes, starts and stops");` add a check of the commands the help tour documents:
```ts
await run(
  "rc-service postgresql setup >/dev/null && rc-service postgresql start >/dev/null && psql -U postgres -tAc 'select 20+22' && rc-service postgresql stop >/dev/null && echo PSQL-$((20+22))",
  "PSQL-42",
  900_000,
);
pass("the help tour's PostgreSQL commands work");
```
In the cleanup command that follows, add `/var/lib/postgresql/17` to the `rm -rf` list.

These checks fail until Steps 2–5 are done; they are verified in CI (Step 7).

- [ ] **Step 2: Write the offline guard and translators**

`image/rootfs/usr/local/bin/apk`:
```sh
#!/bin/sh
# Explains why apk can't download while LinuxWeb is offline, then runs the real apk.
for arg in "$@"; do
  case "$arg" in
    -*) ;;
    *) sub=$arg; break ;;
  esac
done
case "$sub" in
  add|update|upgrade|fetch)
    if [ "$(cat /.linuxweb/network 2>/dev/null)" != online ]; then
      echo "LinuxWeb is offline: set a relay with the Network button to install packages." >&2
      exit 1
    fi
    ;;
esac
exec /sbin/apk "$@"
```

`image/rootfs/usr/local/bin/apt`:
```sh
#!/bin/sh
# apt on LinuxWeb translates to Alpine's apk (network spec section 3).
name=${LINUXWEB_APT_NAME:-apt}

alpine_names() { # Debian names that differ on Alpine; drops options like -y
  for pkg in "$@"; do
    case "$pkg" in
      -*) ;;
      build-essential) echo build-base ;;
      python3-pip) echo py3-pip ;;
      openssh-client) echo openssh-client-default ;;
      neofetch) echo fastfetch ;;
      *) echo "$pkg" ;;
    esac
  done
}

run() {
  echo "$name on LinuxWeb runs Alpine's package manager: $*"
  exec "$@"
}

sub=$1
[ $# -gt 0 ] && shift
case "$sub" in
  install) run apk add $(alpine_names "$@") ;;
  remove|purge|autoremove) run apk del $(alpine_names "$@") ;;
  update) run apk update ;;
  upgrade|full-upgrade|dist-upgrade) run apk upgrade ;;
  search) run apk search "$@" ;;
  show) run apk info -a $(alpine_names "$@") ;;
  list) run apk info ;;
  *)
    echo "$name on LinuxWeb understands: install, remove, purge, autoremove, update, upgrade, full-upgrade, dist-upgrade, search, show, list" >&2
    exit 1
    ;;
esac
```

`image/rootfs/usr/local/bin/apt-get`:
```sh
#!/bin/sh
LINUXWEB_APT_NAME=apt-get exec /usr/local/bin/apt "$@"
```

`image/rootfs/usr/local/bin/pacman`:
```sh
#!/bin/sh
# pacman on LinuxWeb translates to Alpine's apk (network spec section 3).
run() {
  echo "pacman on LinuxWeb runs Alpine's package manager: $*"
  "$@"
}

op=$1
[ $# -gt 0 ] && shift
case "$op" in
  -S) run apk add "$@" ;;
  -Sy) run apk update ;;
  -Syu) run apk update && run apk upgrade ;;
  -R|-Rs) run apk del "$@" ;;
  -Ss) run apk search "$@" ;;
  -Q) run apk info ;;
  -Qi) run apk info -a "$@" ;;
  *)
    echo "pacman on LinuxWeb understands: -S, -Sy, -Syu, -R, -Rs, -Ss, -Q, -Qi" >&2
    exit 1
    ;;
esac
```

`image/rootfs/usr/local/bin/snap`:
```sh
#!/bin/sh
# Snaps need systemd; try the Alpine package with the same name instead.
if [ "$1" = install ] && [ $# -gt 1 ]; then
  shift
  echo "Snaps need systemd, which LinuxWeb doesn't have. Trying apk add $* instead."
  exec apk add "$@"
fi
echo "Snaps need systemd, which LinuxWeb doesn't have. snap install NAME tries apk add NAME instead." >&2
exit 1
```

- [ ] **Step 3: Write the command index generator**

`image/tools/commands-index.py`:
```python
"""Prints "command<TAB>package" for every cmd: provide in Alpine 3.21 x86 main and community.

When several packages provide a command, main wins, then the alphabetically first package.
"""
import io
import tarfile
import urllib.request

best = {}
for repo in ["main", "community"]:
    url = f"https://dl-cdn.alpinelinux.org/alpine/v3.21/{repo}/x86/APKINDEX.tar.gz"
    with urllib.request.urlopen(url, timeout=120) as response:
        data = response.read()
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        text = archive.extractfile("APKINDEX").read().decode("utf-8")
    found = {}
    for block in text.split("\n\n"):
        fields = {}
        for line in block.splitlines():
            if len(line) > 2 and line[1] == ":":
                fields.setdefault(line[0], line[2:])
        name = fields.get("P")
        if not name:
            continue
        for provide in fields.get("p", "").split():
            if provide.startswith("cmd:"):
                command = provide[4:].split("=")[0]
                if command not in found or name < found[command]:
                    found[command] = name
    for command, name in found.items():
        best.setdefault(command, name)

for command in sorted(best):
    print(f"{command}\t{best[command]}")
```

- [ ] **Step 4: Wire them into the image**

In `image/Dockerfile`, directly before `COPY rootfs/ /` add:
```dockerfile
COPY tools/commands-index.py /tmp/commands-index.py
RUN python3 /tmp/commands-index.py > /usr/local/share/linuxweb/commands.tsv \
 && rm /tmp/commands-index.py \
 && test "$(wc -l < /usr/local/share/linuxweb/commands.tsv)" -gt 1000 \
 && grep -qx "$(printf 'nyancat\tnyancat')" /usr/local/share/linuxweb/commands.tsv
```
Replace the `chmod` line after `COPY rootfs/ /` with:
```dockerfile
RUN chmod +x /usr/local/bin/linuxweb-helper /usr/local/bin/linuxweb-help /etc/init.d/linuxweb-helper \
      /usr/local/bin/apk /usr/local/bin/apt /usr/local/bin/apt-get /usr/local/bin/pacman /usr/local/bin/snap \
 && mkdir -p /.linuxweb \
 && rc-update add linuxweb-helper default
```
No `apk` command may run after `COPY rootfs/ /` in the Dockerfile: the offline guard would refuse it.

Replace `image/rootfs/etc/profile.d/linuxweb.sh` with:
```sh
# BusyBox ash and bash both have a built-in "help"; show the LinuxWeb tour instead.
alias help=linuxweb-help
export TERM=xterm-256color
# Keep the v1 prompt (localhost:~# ) for every login shell.
PS1='\h:\w\$ '

# bash: suggest the Alpine package for a missing command (network spec section 3).
if [ -n "$BASH_VERSION" ]; then
  command_not_found_handle() {
    local pkg
    pkg=$(awk -F '\t' -v cmd="$1" '$1 == cmd { print $2; exit }' /usr/local/share/linuxweb/commands.tsv 2>/dev/null)
    if [ -n "$pkg" ]; then
      echo "$1: command not found. Install it with: apk add $pkg" >&2
      if [ "$(cat /.linuxweb/network 2>/dev/null)" != online ]; then
        echo "(needs the network: set a relay with the Network button)" >&2
      fi
    else
      echo "-bash: $1: command not found" >&2
    fi
    return 127
  }
fi
```

- [ ] **Step 5: Rewrite the help tour**

Replace `image/rootfs/usr/local/share/linuxweb/help.txt` with:
```
LinuxWeb tour
=============

Moving around
  pwd              show where you are
  ls               list files here (ls -la shows hidden files too)
  cd /etc          go into a folder; cd on its own takes you home

Editing a file
  nano notes.txt   edit notes.txt (Ctrl+O saves, Ctrl+X quits)
  nvim notes.txt   Neovim, if you know Vim (:wq saves and quits)

Running code
  python3 hi.py    run a Python file
  node app.js      run a JavaScript file
  gcc hi.c -o hi   compile C, then run it with ./hi
  nasm -f elf32 hi.asm && ld -m elf_i386 hi.o -o hi
                   assemble and link 32-bit assembly

PostgreSQL
  rc-service postgresql setup    create the database (once)
  rc-service postgresql start    start it
  psql -U postgres               connect

Networking
  The Network button in the toolbar shows Online or Offline.
  Online, these work: apk add, pip install, npm install, git clone,
  curl https://..., ssh user@host. Nothing can connect in to this machine.

Installing software
  apk add htop     install a package (apt install and pacman -S work too)
  apk search NAME  find a package
  Packages you install come back on your next visit when you're online.

Fun
  cmatrix          falling characters (q quits)
  sl               a steam locomotive
  figlet hello     big letters

Where your files are saved
  Only files in /root, your home folder, are saved in this browser.
  Other changes reset on your next visit, except packages you installed.
  Save machine in the toolbar keeps everything, including open programs.

Compiling and starting databases is slow in a browser: give it a moment.
```

- [ ] **Step 6: Record where the bash hook lives in the spec**

In `docs/superpowers/specs/2026-09-13-linuxweb-network-design.md` replace:
```
  - `/etc/bash/bashrc.d/linuxweb.sh`: `command_not_found_handle` using `commands.tsv`, and the `help` alias for bash.
```
with:
```
  - `/etc/profile.d/linuxweb.sh` (read by bash login shells): `command_not_found_handle` using `commands.tsv`, the `help` alias, and the `localhost:~# ` prompt.
```

- [ ] **Step 7: Commit, push, and verify in CI**

Run: `npm run lint; npx tsc --noEmit; npx vitest run` (all exit 0).
```bash
git add image docs/superpowers/specs/2026-09-13-linuxweb-network-design.md
git commit -m "feat: add apk offline guard, apt/pacman/snap translators, command hints and new help tour"
git push
```
Run: `gh pr checks --watch`, then `gh run view <run-id> -R hammadshakeelai/LinuxWeb --log | grep -E "PASS|FAIL|Error"`
Expected: the new PASS lines for the missing-command hint, the translators, and the PostgreSQL help commands; the network job still passes.

---

### Task 4: Helper: go online, track installed packages, reinstall them

**Files:**
- Modify: `image/rootfs/usr/local/bin/linuxweb-helper`, `src/protocol.ts`, `image/test-image.ts`, `image/test-network.ts`

**Interfaces:**
- Consumes: `startRelay` (Task 1), `vmOptions({ relayUrl })` (Task 2), `listTarGz(bytes: Uint8Array): string[]` (`image/tar.ts`)
- Produces (in `src/protocol.ts`, used by Tasks 5, 6, 8):
  - `NETWORK_STATE = "/.linuxweb/network"`
  - `PACKAGES_STATUS = "/.linuxweb/packages-status"`
  - `PACKAGES_LIST = "/root/.config/linuxweb/packages"`

- [ ] **Step 1: Add the protocol constants**

In `src/protocol.ts`, after `export const TERMINAL_SIZE = ...;` add:
```ts
export const NETWORK_STATE = `${EXCHANGE_DIR}/network`;
export const PACKAGES_STATUS = `${EXCHANGE_DIR}/packages-status`;
export const PACKAGES_LIST = "/root/.config/linuxweb/packages";
```

- [ ] **Step 2: Write the failing checks**

In `image/test-image.ts`, add `NETWORK_STATE, PACKAGES_STATUS` to the `../src/protocol.ts` import, and directly after `pass("helper restores an archive into /root");` add:
```ts
// Offline with a restored package list: the helper must not rewrite or reinstall it.
await emulator.create_file(RESTORED_COUNT, new Uint8Array());
await run(
  "rm -rf /tmp/p && mkdir -p /tmp/p/.config/linuxweb && echo nyancat > /tmp/p/.config/linuxweb/packages && tar -czf /tmp/p.tar.gz -C /tmp/p . && mv /tmp/p.tar.gz /.linuxweb/restore.tar.gz",
  PROMPT,
);
await waitFor(async () => (await readText(RESTORED_COUNT)) === "1", 20_000, "restored package list");
await emulator.create_file(NETWORK_STATE, new TextEncoder().encode("offline"));
await sleep(8_000);
await run("cat /root/.config/linuxweb/packages", "nyancat\r\n");
assert.equal(await readText(PACKAGES_STATUS), "", "no reinstall while offline");
pass("offline, the helper keeps a restored package list and does not reinstall");
```

Replace `image/test-network.ts` with:
```ts
// Resumes the snapshot with a local relay and checks networking and package reinstall
// (network spec sections 7 and 8). Uses the internet. Exits non-zero on the first failure.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { V86 } from "v86";
import { readConfig } from "../relay/config.ts";
import { startRelay } from "../relay/server.ts";
import { HOME_ARCHIVE, NETWORK_STATE, PACKAGES_STATUS, RESTORE_ARCHIVE, RESTORED_COUNT } from "../src/protocol.ts";
import { vmOptions } from "../src/vm-config.ts";
import { collectSerial } from "./serial.ts";
import { listTarGz } from "./tar.ts";

const require = createRequire(import.meta.url);
const file = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const PROMPT = "localhost:~# ";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const encode = (s: string) => new TextEncoder().encode(s);

const relay = await startRelay({ ...readConfig({}), port: 0, allowedOrigins: "*" });
const relayUrl = `wisp://127.0.0.1:${relay.port}/`;

function pass(message: string) {
  console.log(`PASS ${message}`);
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, what: string) {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(1000);
  }
}

async function boot() {
  const emulator = new V86(
    vmOptions({
      wasm: require.resolve("v86/build/v86.wasm"),
      bios: file("../public/bios/seabios.bin"),
      vgaBios: file("../public/bios/vgabios.bin"),
      baseurl: file("./out/rootfs/"),
      basefs: file("./out/fs.json"),
      state: file("./out/state.bin.zst"),
      relayUrl,
    }),
  );
  const serial = collectSerial(emulator);
  await new Promise<void>((resolve) => emulator.add_listener("emulator-loaded", () => resolve()));
  return {
    emulator,
    run(command: string, expect: string, timeoutMs = 120_000) {
      const from = serial.mark();
      emulator.serial0_send(`${command}\n`);
      return serial.until(expect, timeoutMs, from);
    },
    async readText(path: string) {
      try {
        return new TextDecoder().decode(await emulator.read_file(path)).trim();
      } catch {
        return "";
      }
    },
  };
}

// First visit: no saved packages. The page says online; the helper runs DHCP.
const first = await boot();
await first.run("", PROMPT);
await first.emulator.create_file(NETWORK_STATE, encode("online"));
await first.run("while ! ip -4 addr show eth0 | grep -q 192.168.86.100; do sleep 1; done; echo IP-$((20+22))", "IP-42", 180_000);
pass("the helper brings eth0 up with DHCP when the page says online");

await first.run("curl -sS -o /dev/null -w 'HTTP-%{http_code}\\n' https://dl-cdn.alpinelinux.org/alpine/", "HTTP-200", 180_000);
pass("curl reaches an HTTPS site");

await first.run("apk add nyancat && echo APK-$((20+22))", "APK-42", 600_000);
pass("apk add installs a package while online");

await first.run(
  "while ! grep -qx nyancat /root/.config/linuxweb/packages 2>/dev/null; do sleep 1; done; echo TRACK-$((20+22))",
  "TRACK-42",
  60_000,
);
let home: Uint8Array = new Uint8Array();
await waitFor(
  async () => {
    try {
      home = await first.emulator.read_file(HOME_ARCHIVE);
      return listTarGz(home).includes("./.config/linuxweb/packages");
    } catch {
      return false;
    }
  },
  30_000,
  "the home archive to include the package list",
);
pass("the helper records the added package and the home archive includes it");
await first.emulator.destroy();

// Next visit: restore that home folder, then go online; the helper reinstalls nyancat.
const second = await boot();
await second.run("", PROMPT);
await second.emulator.create_file(RESTORED_COUNT, new Uint8Array());
await second.emulator.create_file(RESTORE_ARCHIVE, home);
await waitFor(async () => (await second.readText(RESTORED_COUNT)) !== "", 30_000, "the home folder restore");
await second.emulator.create_file(NETWORK_STATE, encode("online"));
await waitFor(async () => /^\d+ done 1 0$/.test(await second.readText(PACKAGES_STATUS)), 600_000, "the reinstall to finish");
await second.run("apk info -e nyancat && echo REINSTALLED-$((20+22))", "REINSTALLED-42");
assert.match(await second.readText(PACKAGES_STATUS), /^\d+ done 1 0$/);
pass("a restored package list is reinstalled once online");

await second.emulator.destroy();
await relay.close();
console.log("All network checks passed.");
process.exit(0);
```

- [ ] **Step 3: Extend the helper**

Replace `image/rootfs/usr/local/bin/linuxweb-helper` with:
```sh
#!/bin/sh
# Exchanges files with the LinuxWeb page through /.linuxweb
# (v1 spec section 5; network spec section 4).
DIR=/.linuxweb
SHARE=/usr/local/share/linuxweb
PACKAGES=/root/.config/linuxweb/packages
LOG=/var/log/linuxweb-packages.log
mkdir -p "$DIR"
[ -f "$DIR/home.version" ] || echo 0 > "$DIR/home.version"

listing() {
  find /root -exec stat -c '%n|%s|%Y' {} + 2>/dev/null | sort | md5sum
}

write_atomic() { # write_atomic <file> <content>
  printf '%s\n' "$2" > "$1.tmp" && mv "$1.tmp" "$1"
}

# Packages in /etc/apk/world that the image didn't have, plus names that failed to reinstall.
wanted_packages() {
  {
    sort -u /etc/apk/world | grep -vxF -f "$SHARE/base-world"
    printf '%s\n' $failed_names
  } | sed '/^$/d' | sort -u
}

reinstall() {
  missing=""
  for pkg in $(cat "$PACKAGES"); do
    /sbin/apk info -e "$pkg" >/dev/null 2>&1 || missing="$missing $pkg"
  done
  set -- $missing
  [ $# -eq 0 ] && return
  run=$((run + 1))
  total=$#
  write_atomic "$DIR/packages-status" "$run installing $total 0"
  failed=0
  for pkg in "$@"; do
    echo "== apk add $pkg ($(date))" >> "$LOG"
    if ! /sbin/apk add "$pkg" >> "$LOG" 2>&1; then
      failed=$((failed + 1))
      failed_names="$failed_names $pkg"
    fi
  done
  write_atomic "$DIR/packages-status" "$run done $total $failed"
}

track() {
  wanted=$(wanted_packages)
  saved=$(cat "$PACKAGES" 2>/dev/null)
  if [ "$wanted" != "$saved" ]; then
    mkdir -p "$(dirname "$PACKAGES")"
    printf '%s\n' "$wanted" | sed '/^$/d' > "$PACKAGES.tmp" && mv "$PACKAGES.tmp" "$PACKAGES"
  fi
}

last_listing=""
last_size=""
dhcp_done=""
reinstall_done=""
failed_names=""
run=0

while true; do
  if [ -s "$DIR/restore.tar.gz" ]; then
    count=$(tar -tzf "$DIR/restore.tar.gz" 2>/dev/null | grep -vc '/$')
    tar -xzf "$DIR/restore.tar.gz" -C /root 2>/dev/null
    rm -f "$DIR/restore.tar.gz"
    write_atomic "$DIR/restored" "$count"
    last_listing=$(listing)
  fi

  if [ -s "$DIR/size" ]; then
    size=$(cat "$DIR/size")
    if [ "$size" != "$last_size" ]; then
      set -- $size
      stty -F /dev/ttyS0 rows "$1" cols "$2" 2>/dev/null
      last_size="$size"
    fi
  fi

  current=$(listing)
  if [ "$current" != "$last_listing" ]; then
    if tar -czf "$DIR/home.tar.gz.tmp" -C /root . 2>/dev/null; then
      mv "$DIR/home.tar.gz.tmp" "$DIR/home.tar.gz"
      write_atomic "$DIR/home.version" "$(( $(cat "$DIR/home.version") + 1 ))"
    fi
    last_listing="$current"
  fi

  # The page writes network only after the home-folder restore, so a saved
  # package list is always in place before anything below reads or rewrites it.
  if [ -f "$DIR/network" ]; then
    if [ "$(cat "$DIR/network")" = online ] && [ -z "$dhcp_done" ]; then
      ip link set eth0 up 2>/dev/null
      udhcpc -i eth0 -n -q -t 5 >/dev/null 2>&1 && dhcp_done=1
    fi
    if [ -z "$reinstall_done" ]; then
      if [ ! -s "$PACKAGES" ]; then
        reinstall_done=1
      elif [ -n "$dhcp_done" ]; then
        reinstall
        reinstall_done=1
      fi
    fi
    [ -n "$reinstall_done" ] && track
  fi

  sleep 2
done
```

- [ ] **Step 4: Commit, push, and verify in CI**

Run: `npm run lint; npx tsc --noEmit; npx vitest run` (all exit 0).
```bash
git add image src/protocol.ts
git commit -m "feat: helper brings the network up, tracks installed packages and reinstalls them"
git push
```
Run: `gh pr checks --watch`, then read both job logs for `PASS`.
Expected: "Build and test image" includes `PASS offline, the helper keeps a restored package list and does not reinstall`; "Network (uses the internet)" includes all five PASS lines, ending with `PASS a restored package list is reinstalled once online`.

---

### Task 5: Page networking core: relay address, probe, monitor, memory error

**Files:**
- Create: `src/network.ts`, `src/network.test.ts`
- Modify: `src/emulator.ts`, `src/emulator.test.ts`

**Interfaces:**
- Consumes: `NETWORK_STATE` (Task 4), `vmOptions({ relayUrl })` (Task 2)
- Produces:
  - `RELAY_STORAGE_KEY = "linuxweb-relay"`; `type NetworkState = "online" | "offline" | "unreachable"`
  - `isValidRelayUrl(url: string): boolean`
  - `readSavedRelay(storage: RelayStorage | undefined): string | null`; `writeSavedRelay(storage: RelayStorage | undefined, url: string | null): void`
  - `relayUrl(saved: string | null, siteDefault: string | undefined): string | null`
  - `interface ProbeSocket { addEventListener(type: "open" | "error" | "close", listener: () => void): void; close(): void }`
  - `probeRelay(url: string, timeoutMs?: number, createSocket?: (url: string) => ProbeSocket): Promise<"online" | "unreachable">`
  - `class NetworkMonitor { state: NetworkState; constructor(deps: NetworkMonitorDeps); check(): Promise<NetworkState>; publish(state: NetworkState): Promise<void>; refresh(): Promise<NetworkState>; start(): void; stop(): void }`
  - `browserVmOptions(base: string, relayUrl?: string | null): V86Options`
  - `class MemoryError extends Error`; `isMemoryError(reason: unknown): boolean`
  - `startVm(options, { onProgress?, create?, watchErrors? })`, where `watchErrors(onError: (reason: unknown) => void): () => void`

- [ ] **Step 1: Write the failing network tests**

`src/network.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NetworkMonitor,
  RELAY_STORAGE_KEY,
  isValidRelayUrl,
  probeRelay,
  readSavedRelay,
  relayUrl,
  writeSavedRelay,
  type ProbeSocket,
} from "./network.ts";
import { NETWORK_STATE } from "./protocol.ts";

class FakeSocket implements ProbeSocket {
  readonly url: string;
  readonly listeners = new Map<string, () => void>();
  closed = false;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(type: "open" | "error" | "close", listener: () => void) {
    this.listeners.set(type, listener);
  }
  close() {
    this.closed = true;
  }
  fire(type: "open" | "error" | "close") {
    this.listeners.get(type)?.();
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("isValidRelayUrl", () => {
  it("accepts wisp:// and wisps:// addresses that end with /", () => {
    expect(isValidRelayUrl("wisps://relay.example.com/")).toBe(true);
    expect(isValidRelayUrl("wisp://127.0.0.1:8080/")).toBe(true);
    expect(isValidRelayUrl("wisps://relay.example.com")).toBe(false);
    expect(isValidRelayUrl("wss://relay.example.com/")).toBe(false);
    expect(isValidRelayUrl("relay.example.com/")).toBe(false);
    expect(isValidRelayUrl("")).toBe(false);
  });
});

describe("relayUrl", () => {
  it("prefers a valid saved address, then a valid site default", () => {
    expect(relayUrl("wisps://mine.example/", "wisps://site.example/")).toBe("wisps://mine.example/");
    expect(relayUrl(null, "wisps://site.example/")).toBe("wisps://site.example/");
    expect(relayUrl(null, "")).toBeNull();
    expect(relayUrl(null, undefined)).toBeNull();
    expect(relayUrl(null, "not a relay")).toBeNull();
  });

  it("treats an invalid saved address as no relay", () => {
    expect(relayUrl("wss://bad.example/", "wisps://site.example/")).toBeNull();
  });
});

describe("saved relay storage", () => {
  it("reads, writes and clears the saved address", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    };
    expect(readSavedRelay(storage)).toBeNull();
    writeSavedRelay(storage, "wisps://mine.example/");
    expect(map.get(RELAY_STORAGE_KEY)).toBe("wisps://mine.example/");
    expect(readSavedRelay(storage)).toBe("wisps://mine.example/");
    writeSavedRelay(storage, null);
    expect(readSavedRelay(storage)).toBeNull();
  });

  it("survives storage that throws", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readSavedRelay(storage)).toBeNull();
    expect(() => writeSavedRelay(storage, "wisps://x.example/")).not.toThrow();
    expect(readSavedRelay(undefined)).toBeNull();
  });
});

describe("probeRelay", () => {
  it("is online when the WebSocket opens, and closes the test socket", async () => {
    let socket!: FakeSocket;
    const probing = probeRelay("wisps://relay.example.com/", 5000, (url) => (socket = new FakeSocket(url)));
    expect(socket.url).toBe("wss://relay.example.com/");
    socket.fire("open");
    expect(await probing).toBe("online");
    expect(socket.closed).toBe(true);
  });

  it("is unreachable on error, on close, or when the factory throws", async () => {
    let socket!: FakeSocket;
    const erroring = probeRelay("wisp://127.0.0.1:1/", 5000, (url) => (socket = new FakeSocket(url)));
    expect(socket.url).toBe("ws://127.0.0.1:1/");
    socket.fire("error");
    expect(await erroring).toBe("unreachable");

    const closing = probeRelay("wisp://127.0.0.1:1/", 5000, (url) => (socket = new FakeSocket(url)));
    socket.fire("close");
    expect(await closing).toBe("unreachable");

    expect(
      await probeRelay("wisp://127.0.0.1:1/", 5000, () => {
        throw new Error("bad url");
      }),
    ).toBe("unreachable");
  });

  it("is unreachable after the timeout", async () => {
    vi.useFakeTimers();
    const probing = probeRelay("wisps://slow.example/", 5000, (url) => new FakeSocket(url));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await probing).toBe("unreachable");
  });
});

describe("NetworkMonitor", () => {
  function setup(relay: string | null, probeResult: "online" | "unreachable" = "online") {
    const writes: string[] = [];
    const changes: string[] = [];
    const monitor = new NetworkMonitor({
      relay,
      writeGuest: async (path, data) => {
        expect(path).toBe(NETWORK_STATE);
        writes.push(new TextDecoder().decode(data));
      },
      onChange: (state) => changes.push(state),
      probe: vi.fn(async () => probeResult),
    });
    return { monitor, writes, changes };
  }

  it("is offline without a relay and tells the guest once", async () => {
    const { monitor, writes, changes } = setup(null);
    expect(await monitor.refresh()).toBe("offline");
    await monitor.refresh();
    expect(writes).toEqual(["offline"]);
    expect(changes).toEqual(["offline"]);
  });

  it("publishes online, and tells the guest offline when the relay is unreachable", async () => {
    const { monitor, writes, changes } = setup("wisps://relay.example.com/");
    await monitor.publish(await monitor.check());
    expect(monitor.state).toBe("online");
    await monitor.publish("unreachable");
    expect(writes).toEqual(["online", "offline"]);
    expect(changes).toEqual(["online", "unreachable"]);
  });

  it("retries the guest write after a failure", async () => {
    let fail = true;
    const writes: string[] = [];
    const monitor = new NetworkMonitor({
      relay: null,
      writeGuest: async (_path, data) => {
        if (fail) throw new Error("not ready");
        writes.push(new TextDecoder().decode(data));
      },
      onChange: () => {},
    });
    await expect(monitor.publish("offline")).rejects.toThrow("not ready");
    fail = false;
    await monitor.publish("offline");
    expect(writes).toEqual(["offline"]);
  });
});
```

Run: `npx vitest run src/network.test.ts`
Expected: FAIL ("Failed to resolve import ./network.ts").

- [ ] **Step 2: Write `src/network.ts`**

```ts
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
```

Run: `npx vitest run src/network.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 3: Write the failing emulator tests**

In `src/emulator.test.ts` change the import to:
```ts
import { DownloadError, MemoryError, browserVmOptions, isMemoryError, startVm, type V86Like } from "./emulator.ts";
```
Add inside `describe("startVm", ...)`:
```ts
  it("rejects with MemoryError when creating the emulator runs out of memory", async () => {
    const started = startVm(
      {},
      {
        create: () => {
          throw new RangeError("WebAssembly.Memory(): could not allocate memory");
        },
        watchErrors: () => () => {},
      },
    );
    await expect(started).rejects.toBeInstanceOf(MemoryError);
  });

  it("rejects with MemoryError when v86 reports an allocation failure later", async () => {
    const fake = new FakeV86();
    let report: ((reason: unknown) => void) | undefined;
    const unwatch = vi.fn();
    const started = startVm(
      {},
      {
        create: () => fake,
        watchErrors: (onError) => {
          report = onError;
          return unwatch;
        },
      },
    );
    report?.(new Error("some unrelated error"));
    report?.(new RangeError("out of memory"));
    await expect(started).rejects.toBeInstanceOf(MemoryError);
    expect(unwatch).toHaveBeenCalled();
  });
```
Add a new block:
```ts
describe("isMemoryError", () => {
  it("recognizes allocation failures only", () => {
    expect(isMemoryError(new RangeError("anything"))).toBe(true);
    expect(isMemoryError(new Error("Out of memory"))).toBe(true);
    expect(isMemoryError("could not allocate memory")).toBe(true);
    expect(isMemoryError(new Error("memory access out of bounds"))).toBe(false);
  });
});
```
In `describe("browserVmOptions", ...)` add:
```ts
  it("adds the relay only when one is given", () => {
    expect(browserVmOptions("/LinuxWeb/").net_device).toEqual({ type: "virtio" });
    expect(browserVmOptions("/LinuxWeb/", "wisps://relay.example.com/").net_device).toEqual({
      type: "virtio",
      relay_url: "wisps://relay.example.com/",
    });
  });
```

Run: `npx vitest run src/emulator.test.ts`
Expected: FAIL (`MemoryError` and `isMemoryError` are not exported).

- [ ] **Step 4: Update `src/emulator.ts`**

Replace `browserVmOptions` and `startVm` with, and add `MemoryError`, `isMemoryError`, and `browserErrorWatcher`:
```ts
export class MemoryError extends Error {
  constructor() {
    super("This device doesn't have enough free memory to run LinuxWeb (it needs 512 MB).");
    this.name = "MemoryError";
  }
}

export function isMemoryError(reason: unknown): boolean {
  if (reason instanceof RangeError) return true;
  const message = reason instanceof Error ? reason.message : String(reason);
  return /out of memory|could not allocate/i.test(message);
}

function browserErrorWatcher(onError: (reason: unknown) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onRejection = (event: PromiseRejectionEvent) => onError(event.reason);
  const onErrorEvent = (event: ErrorEvent) => onError(event.error ?? event.message);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onErrorEvent);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onErrorEvent);
  };
}

export function browserVmOptions(base: string, relayUrl?: string | null): V86Options {
  return vmOptions({
    wasm: `${base}v86/v86.wasm`,
    bios: `${base}bios/seabios.bin`,
    vgaBios: `${base}bios/vgabios.bin`,
    baseurl: `${base}image/rootfs/`,
    basefs: `${base}image/fs.json`,
    state: `${base}image/state.bin.zst`,
    ...(relayUrl ? { relayUrl } : {}),
  });
}

export function startVm(
  options: V86Options,
  start: {
    onProgress?: (loadedBytes: number, totalBytes: number) => void;
    create?: (options: V86Options) => V86Like;
    watchErrors?: (onError: (reason: unknown) => void) => () => void;
  } = {},
): Promise<Vm> {
  const create = start.create ?? ((o: V86Options) => new V86(o) as unknown as V86Like);
  const watchErrors = start.watchErrors ?? browserErrorWatcher;
  const files = new Map<string, { loaded: number; total: number }>();

  return new Promise((resolve, reject) => {
    // v86 allocates its memory asynchronously, so an allocation failure surfaces as an unhandled error.
    const unwatch = watchErrors((reason) => {
      if (!isMemoryError(reason)) return;
      unwatch();
      reject(new MemoryError());
    });

    let emulator: V86Like;
    try {
      emulator = create(options);
    } catch (error) {
      unwatch();
      reject(isMemoryError(error) ? new MemoryError() : error);
      return;
    }

    emulator.add_listener("download-progress", (argument) => {
      const event = argument as ProgressEvent;
      files.set(event.file_name, { loaded: event.loaded, total: event.lengthComputable ? event.total : event.loaded });
      let loaded = 0;
      let total = 0;
      for (const file of files.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      start.onProgress?.(loaded, total);
    });
    emulator.add_listener("download-error", (argument) => {
      unwatch();
      void emulator.destroy();
      reject(new DownloadError((argument as { file_name: string }).file_name));
    });
    // v86 fires emulator-ready before it restores initial_state; only emulator-loaded is safe.
    emulator.add_listener("emulator-loaded", () => {
      unwatch();
      resolve(wrap(emulator));
    });
  });
}
```
The two existing `startVm` tests pass no `watchErrors`; in Vitest's Node environment `window` is undefined, so `browserErrorWatcher` returns a no-op.

- [ ] **Step 5: Run everything and commit**

Run: `npx vitest run; npm run lint; npx tsc --noEmit`
Expected: all PASS / exit 0.
```bash
git add src/network.ts src/network.test.ts src/emulator.ts src/emulator.test.ts
git commit -m "feat: add relay address handling, reachability probe, network monitor and memory error"
```

---

### Task 6: Reinstall status, status-line priority, welcome network line, home flush

**Files:**
- Create: `src/packages-status.ts`, `src/packages-status.test.ts`
- Modify: `src/ui/status.ts`, `src/ui/status.test.ts`, `src/welcome.ts`, `src/welcome.test.ts`, `src/home.ts`, `src/home.test.ts`

**Interfaces:**
- Consumes: `PACKAGES_STATUS` (Task 4), `HomeStatus`, `statusText` (v1)
- Produces:
  - `interface PackagesStatus { run: number; state: "installing" | "done"; total: number; failed: number }`
  - `parsePackagesStatus(text: string): PackagesStatus | null`
  - `packagesMessage(status: PackagesStatus): { text: string; durationMs: number | null }`
  - `class PackagesWatcher { constructor(deps: { readFile(path: string): Promise<Uint8Array>; now?(): number }); pollOnce(): Promise<void>; text(now?: number): string }`
  - `statusLine(packagesText: string, home: HomeStatus, now: number): string`
  - `welcomeText(restoredCount: number | null, network: "online" | "offline"): string`
  - `HomeSync.flush(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`src/packages-status.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { PackagesWatcher, packagesMessage, parsePackagesStatus } from "./packages-status.ts";
import { PACKAGES_STATUS } from "./protocol.ts";

describe("parsePackagesStatus", () => {
  it("parses run, state, total and failed", () => {
    expect(parsePackagesStatus("3 installing 4 0\n")).toEqual({ run: 3, state: "installing", total: 4, failed: 0 });
    expect(parsePackagesStatus("3 done 4 1")).toEqual({ run: 3, state: "done", total: 4, failed: 1 });
  });

  it("rejects anything else", () => {
    expect(parsePackagesStatus("")).toBeNull();
    expect(parsePackagesStatus("3 finished 4 0")).toBeNull();
    expect(parsePackagesStatus("x done 1 0")).toBeNull();
  });
});

describe("packagesMessage", () => {
  it("uses the spec's wording, durations and singular", () => {
    expect(packagesMessage({ run: 1, state: "installing", total: 1, failed: 0 })).toEqual({ text: "Reinstalling 1 package…", durationMs: null });
    expect(packagesMessage({ run: 1, state: "installing", total: 3, failed: 0 })).toEqual({ text: "Reinstalling 3 packages…", durationMs: null });
    expect(packagesMessage({ run: 1, state: "done", total: 3, failed: 0 })).toEqual({ text: "Reinstalled 3 packages", durationMs: 5000 });
    expect(packagesMessage({ run: 1, state: "done", total: 1, failed: 0 })).toEqual({ text: "Reinstalled 1 package", durationMs: 5000 });
    expect(packagesMessage({ run: 1, state: "done", total: 4, failed: 1 })).toEqual({
      text: "Couldn't reinstall 1 of 4 packages. See /var/log/linuxweb-packages.log",
      durationMs: 10_000,
    });
  });
});

describe("PackagesWatcher", () => {
  function setup() {
    let content: string | null = null;
    let clock = 0;
    const watcher = new PackagesWatcher({
      readFile: async (path) => {
        expect(path).toBe(PACKAGES_STATUS);
        if (content === null) throw new Error("FileNotFoundError");
        return new TextEncoder().encode(content);
      },
      now: () => clock,
    });
    return {
      watcher,
      set: (text: string | null) => (content = text),
      tick: (ms: number) => (clock += ms),
    };
  }

  it("shows nothing without a status file", async () => {
    const { watcher } = setup();
    await watcher.pollOnce();
    expect(watcher.text()).toBe("");
  });

  it("shows installing until done, then done for 5 seconds", async () => {
    const { watcher, set, tick } = setup();
    set("1 installing 2 0");
    await watcher.pollOnce();
    tick(60_000);
    expect(watcher.text()).toBe("Reinstalling 2 packages…");
    set("1 done 2 0");
    await watcher.pollOnce();
    expect(watcher.text()).toBe("Reinstalled 2 packages");
    tick(4999);
    expect(watcher.text()).toBe("Reinstalled 2 packages");
    tick(1);
    expect(watcher.text()).toBe("");
  });

  it("does not repeat a message it already showed", async () => {
    const { watcher, set, tick } = setup();
    set("1 done 1 0");
    await watcher.pollOnce();
    tick(6000);
    await watcher.pollOnce();
    expect(watcher.text()).toBe("");
    set("2 done 1 1");
    await watcher.pollOnce();
    expect(watcher.text()).toBe("Couldn't reinstall 1 of 1 package. See /var/log/linuxweb-packages.log");
  });
});
```

Add to `src/ui/status.test.ts` (and add `statusLine` to its import):
```ts
describe("statusLine", () => {
  it("shows the package message first, otherwise the home-folder status", () => {
    expect(statusLine("Reinstalling 2 packages…", { kind: "saved", savedAt: 0 }, 2000)).toBe("Reinstalling 2 packages…");
    expect(statusLine("", { kind: "saved", savedAt: 0 }, 2000)).toBe("Home folder saved 2s ago");
  });
});
```

Replace `src/welcome.test.ts` with:
```ts
import { describe, expect, it } from "vitest";
import { welcomeText } from "./welcome.ts";

describe("welcomeText", () => {
  it("shows the first-visit welcome with the network line", () => {
    expect(welcomeText(null, "offline")).toBe(
      "Welcome to LinuxWeb: Alpine Linux, running in your browser.\r\n" +
        "Files in /root are saved in this browser automatically.\r\n" +
        "New here? Type help for a two-minute tour.\r\n" +
        "Network is offline: set a relay with the Network button to install software.\r\n",
    );
  });

  it("shows the restored file count on a return visit, then the network line", () => {
    expect(welcomeText(12, "online")).toBe(
      "Welcome to LinuxWeb: Alpine Linux, running in your browser.\r\n" +
        "Welcome back. Restored 12 files in your home folder.\r\n" +
        "Network is online: try apk add, git clone, or curl.\r\n",
    );
  });

  it("uses the singular for one file", () => {
    expect(welcomeText(1, "offline")).toContain("Restored 1 file in your home folder.");
  });
});
```

Add to `src/home.test.ts` inside `describe("HomeSync", ...)`:
```ts
  it("flush waits for a save in progress, then saves the latest change", async () => {
    const guest = fakeGuest({ [HOME_VERSION]: text("1\n"), [HOME_ARCHIVE]: text("a") });
    let release: () => void = () => {};
    const putHome = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const sync = new HomeSync({
      vm: guest.vm,
      store: { getHome: async () => undefined, putHome },
      onStatus: () => {},
      now: () => 1000,
      // A real macrotask, so flush's wait loop lets vi.waitFor's timers run.
      sleep: () => new Promise((resolve) => setTimeout(resolve, 0)),
      persist: async () => true,
    });
    await sync.restore();
    guest.map.set(HOME_VERSION, text("2\n"));
    const first = sync.pollOnce();
    guest.map.set(HOME_VERSION, text("3\n"));
    guest.map.set(HOME_ARCHIVE, text("latest"));
    const flushing = sync.flush();
    await vi.waitFor(() => expect(putHome).toHaveBeenCalledTimes(1));
    release();
    await first;
    await vi.waitFor(() => expect(putHome).toHaveBeenCalledTimes(2));
    release();
    await flushing;
    expect(putHome).toHaveBeenLastCalledWith({ data: text("latest"), bytes: 6, savedAt: 1000 });
  });
```

Run: `npx vitest run src/packages-status.test.ts src/ui/status.test.ts src/welcome.test.ts src/home.test.ts`
Expected: FAIL (missing module `./packages-status.ts`, missing `statusLine`, welcome text mismatch, missing `flush`).

- [ ] **Step 2: Implement**

`src/packages-status.ts`:
```ts
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
```

In `src/ui/status.ts` add:
```ts
export function statusLine(packagesText: string, home: HomeStatus, now: number): string {
  return packagesText || statusText(home, now);
}
```

Replace `src/welcome.ts` with:
```ts
const FIRST_LINE = "Welcome to LinuxWeb: Alpine Linux, running in your browser.";
const NETWORK_LINES = {
  online: "Network is online: try apk add, git clone, or curl.",
  offline: "Network is offline: set a relay with the Network button to install software.",
};

export function welcomeText(restoredCount: number | null, network: "online" | "offline"): string {
  const lines =
    restoredCount === null
      ? [FIRST_LINE, "Files in /root are saved in this browser automatically.", "New here? Type help for a two-minute tour."]
      : [FIRST_LINE, `Welcome back. Restored ${restoredCount} ${restoredCount === 1 ? "file" : "files"} in your home folder.`];
  return [...lines, NETWORK_LINES[network]].map((line) => `${line}\r\n`).join("");
}
```

In `src/home.ts`, add to `HomeSync` after `pollOnce()`:
```ts
  /** Waits for any save in progress, then saves once more if the home folder changed. */
  async flush(): Promise<void> {
    while (this.busy) await this.deps.sleep(100);
    await this.pollOnce();
  }
```

- [ ] **Step 3: Run everything and commit**

Run: `npx vitest run; npm run lint; npx tsc --noEmit`
Expected: `src/main.ts` fails typecheck where it calls `welcomeText(restored)` with one argument. In `src/main.ts` change that call to `welcomeText(restored, "offline")` for now (Task 8 wires the real state). Then all PASS / exit 0.
```bash
git add src
git commit -m "feat: add reinstall status messages, status-line priority, welcome network line and home flush"
```

---

### Task 7: Mark machine saves made on an older image

**Files:**
- Modify: `src/storage.ts`, `src/saves.ts`, `src/saves.test.ts`, `src/ui/saves-dialog.ts`

**Interfaces:**
- Consumes: `image/out/version.txt` (Task 2, loaded by Task 8)
- Produces:
  - `MachineSummary.imageVersion?: string` (and on `MachineRecord`)
  - `MachineSavesDeps.imageVersion?: string | null`
  - `isOlderSave(summary: Pick<MachineSummary, "imageVersion">, current: string | null): boolean`
  - `MachineSaves.isOlder(summary: MachineSummary): boolean`

- [ ] **Step 1: Write the failing tests**

In `src/saves.test.ts` change the import to:
```ts
import { MachineSaves, StorageFullError, TooManySavesError, UnreadableSaveError, defaultSaveName, isOlderSave } from "./saves.ts";
```
Add:
```ts
describe("isOlderSave", () => {
  it("marks saves from another image, or without a version, as older", () => {
    expect(isOlderSave({ imageVersion: "abc" }, "abc")).toBe(false);
    expect(isOlderSave({ imageVersion: "abc" }, "def")).toBe(true);
    expect(isOlderSave({}, "def")).toBe(true);
    expect(isOlderSave({}, null)).toBe(false);
  });
});
```
Inside `describe("MachineSaves", ...)` add:
```ts
  it("records the current image version on new saves", async () => {
    const store = await Store.open(`saves-test-${dbCount++}`);
    const vm = { saveState: vi.fn(async () => new ArrayBuffer(8)), restoreState: vi.fn(async () => {}) };
    const saves = new MachineSaves({ vm, store, imageVersion: "0123456789ab", newId: () => "v" });
    const summary = await saves.save("With version");
    expect(summary.imageVersion).toBe("0123456789ab");
    expect((await saves.list())[0].imageVersion).toBe("0123456789ab");
    expect(saves.isOlder(summary)).toBe(false);
    expect(saves.isOlder({ ...summary, imageVersion: "old" })).toBe(true);
  });
```

Run: `npx vitest run src/saves.test.ts`
Expected: FAIL (`isOlderSave` is not exported).

- [ ] **Step 2: Implement**

In `src/storage.ts` change `MachineSummary` to:
```ts
export interface MachineSummary {
  id: string;
  name: string;
  createdAt: number;
  bytes: number;
  imageVersion?: string;
}
```
and the `listMachines` mapping to:
```ts
      .map(({ id, name, createdAt, bytes, imageVersion }) => ({ id, name, createdAt, bytes, ...(imageVersion ? { imageVersion } : {}) }))
```

In `src/saves.ts`:
- Add after `defaultSaveName`:
```ts
export function isOlderSave(summary: Pick<MachineSummary, "imageVersion">, current: string | null): boolean {
  return current !== null && summary.imageVersion !== current;
}
```
- Add `imageVersion?: string | null;` to `MachineSavesDeps`.
- Change the constructor body to:
```ts
    this.deps = { now: () => Date.now(), newId: () => crypto.randomUUID(), imageVersion: null, ...deps };
```
- In `save()`, change the record to:
```ts
    const record: MachineRecord = {
      id: this.deps.newId(),
      name: name?.trim() || defaultSaveName(createdAt),
      createdAt,
      bytes: data.byteLength,
      data,
      ...(this.deps.imageVersion ? { imageVersion: this.deps.imageVersion } : {}),
    };
```
and its return to:
```ts
    const { data: _data, ...summary } = record;
    return summary;
```
- Add the method:
```ts
  isOlder(summary: MachineSummary): boolean {
    return isOlderSave(summary, this.deps.imageVersion);
  }
```

In `src/ui/saves-dialog.ts`, replace the per-save loop body (from `const li = document.createElement("li");` through `ul.append(li);`) with:
```ts
      const li = document.createElement("li");
      const name = document.createElement("span");
      name.className = "name";
      const older = saves.isOlder(save);
      name.textContent = `${save.name}${older ? " (older LinuxWeb)" : ""} (${(save.bytes / 1e6).toFixed(1)} MB)`;
      li.append(name);
      const actions = older ? ["Download", "Delete"] : ["Restore", "Rename", "Delete", "Download"];
      for (const action of actions) {
        const node = document.createElement("button");
        node.type = "button";
        node.className = "bevel-button";
        node.textContent = action;
        node.addEventListener("click", () => closeWith({ action, id: save.id, name: save.name }));
        li.append(node);
      }
      ul.append(li);
```

- [ ] **Step 3: Run everything and commit**

Run: `npx vitest run; npm run lint; npx tsc --noEmit`
Expected: all PASS / exit 0. If oxlint flags the unused `_data` binding, replace the destructuring with `return { id: record.id, name: record.name, createdAt: record.createdAt, bytes: record.bytes, ...(record.imageVersion ? { imageVersion: record.imageVersion } : {}) };`.
```bash
git add src
git commit -m "feat: record the image version on machine saves and limit older saves to download and delete"
```

---

### Task 8: Network button, Network dialog, and page wiring

**Files:**
- Create: `src/ui/network-text.ts`, `src/ui/network-text.test.ts`, `src/ui/network-dialog.ts`
- Modify: `src/ui/window.ts`, `src/ui/theme.css`, `src/main.ts`

**Interfaces:**
- Consumes: everything from Tasks 5–7; `showDialog`, `showMessage` (v1)
- Produces:
  - `networkButtonLabel(state: NetworkState): string`; `networkStatusText(state: NetworkState, relay: string | null): string`
  - `RELAY_INVALID_MESSAGE`, `RELAY_PRIVACY_NOTE`
  - `openNetworkDialog(options: { state: NetworkState; relay: string | null; saved: string | null; save(url: string | null): Promise<void> }): Promise<void>`
  - `WindowView.buttons.network`; the dialog's field has the accessible name `Relay address` and the button `Save and reload` (used by Task 9)

- [ ] **Step 1: Write the failing text tests**

`src/ui/network-text.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { RELAY_INVALID_MESSAGE, RELAY_PRIVACY_NOTE, networkButtonLabel, networkStatusText } from "./network-text.ts";

describe("network text", () => {
  it("labels the toolbar button", () => {
    expect(networkButtonLabel("online")).toBe("Network: Online");
    expect(networkButtonLabel("offline")).toBe("Network: Offline");
    expect(networkButtonLabel("unreachable")).toBe("Network: Unreachable");
  });

  it("describes the state in the dialog", () => {
    expect(networkStatusText("online", "wisps://relay.example.com/")).toBe("Online through wisps://relay.example.com/");
    expect(networkStatusText("offline", null)).toBe("Offline: no relay is set");
    expect(networkStatusText("unreachable", "wisps://relay.example.com/")).toBe("Can't reach that relay. Check the address or try again later.");
  });

  it("uses the spec's validation message and privacy note", () => {
    expect(RELAY_INVALID_MESSAGE).toBe("Relay addresses start with wisp:// or wisps:// and end with /");
    expect(RELAY_PRIVACY_NOTE).toBe(
      "Linux's internet traffic goes through this relay. HTTPS stays encrypted, but the relay sees which addresses and ports you connect to. DNS lookups go to Cloudflare.",
    );
  });
});
```

Run: `npx vitest run src/ui/network-text.test.ts`
Expected: FAIL ("Failed to resolve import ./network-text.ts").

- [ ] **Step 2: Write the text and the dialog**

`src/ui/network-text.ts`:
```ts
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
```

`src/ui/network-dialog.ts`:
```ts
import { isValidRelayUrl, type NetworkState } from "../network.ts";
import { RELAY_INVALID_MESSAGE, RELAY_PRIVACY_NOTE, networkStatusText } from "./network-text.ts";

export interface NetworkDialogOptions {
  state: NetworkState;
  relay: string | null;
  saved: string | null;
  save(url: string | null): Promise<void>;
}

function button(label: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = "bevel-button";
  node.textContent = label;
  return node;
}

export function openNetworkDialog(options: NetworkDialogOptions): Promise<void> {
  const dialog = document.createElement("dialog");
  const titleBar = document.createElement("div");
  titleBar.className = "title-bar";
  titleBar.textContent = "Network";

  const body = document.createElement("div");
  body.className = "dialog-body";
  const status = document.createElement("p");
  status.className = "network-status";
  status.textContent = networkStatusText(options.state, options.relay);

  const label = document.createElement("label");
  label.textContent = "Relay address";
  const input = document.createElement("input");
  input.className = "text-input";
  input.placeholder = "wisps://relay.example.com/";
  input.value = options.saved ?? options.relay ?? "";
  label.append(document.createElement("br"), input);

  const error = document.createElement("p");
  error.className = "field-error";
  error.setAttribute("role", "alert");
  error.textContent = RELAY_INVALID_MESSAGE;
  error.hidden = !(options.saved !== null && !isValidRelayUrl(options.saved));

  const note = document.createElement("p");
  note.className = "dialog-note";
  note.textContent = RELAY_PRIVACY_NOTE;
  body.append(status, label, error, note);

  const actions = document.createElement("div");
  actions.className = "dialog-actions";
  const cancel = button("Cancel");
  const clear = button("Clear");
  const save = button("Save and reload");
  actions.append(cancel, clear, save);
  dialog.append(titleBar, body, actions);

  return new Promise((resolve) => {
    const close = () => {
      dialog.close();
      dialog.remove();
      resolve();
    };
    const busy = () => {
      for (const node of [cancel, clear, save]) node.disabled = true;
    };
    cancel.addEventListener("click", close);
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    clear.addEventListener("click", () => {
      busy();
      void options.save(null);
    });
    save.addEventListener("click", () => {
      const url = input.value.trim();
      if (!isValidRelayUrl(url)) {
        error.hidden = false;
        input.focus();
        return;
      }
      busy();
      void options.save(url);
    });
    document.body.append(dialog);
    dialog.showModal();
    input.focus();
  });
}
```

Add to `src/ui/theme.css`:
```css
.network-status { margin: 0 0 10px; }
.field-error { color: #8b0000; margin: 6px 0 0; }
.dialog-note { margin: 10px 0 0; max-width: 46ch; color: #3d3a30; }
```

Run: `npx vitest run src/ui/network-text.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 3: Add the Network button to the window**

In `src/ui/window.ts`:
- Change the `buttons` type in `WindowView` to `Record<"save" | "saves" | "reset" | "fullscreen" | "network" | "help" | "exitFullscreen", HTMLButtonElement>`.
- Add `network: button("Network: Offline"),` to the `buttons` object, after `fullscreen`.
- Change the toolbar line to:
```ts
  toolbar.append(buttons.save, buttons.saves, buttons.reset, buttons.fullscreen, buttons.network, buttons.help, status);
```

- [ ] **Step 4: Wire it all up in `src/main.ts`**

Replace `src/main.ts` with:
```ts
import helpText from "../image/rootfs/usr/local/share/linuxweb/help.txt?raw";
import { MemoryError, browserVmOptions, startVm, type Vm } from "./emulator.ts";
import { HomeSync, type HomeStatus } from "./home.ts";
import { NetworkMonitor, readSavedRelay, relayUrl, writeSavedRelay } from "./network.ts";
import { PackagesWatcher } from "./packages-status.ts";
import { POLL_INTERVAL_MS } from "./protocol.ts";
import { MachineSaves } from "./saves.ts";
import { Store } from "./storage.ts";
import { acquireSaveLock } from "./tab-lock.ts";
import { SizeReporter, createTerminal } from "./terminal.ts";
import { showDialog, showMessage } from "./ui/dialogs.ts";
import { openNetworkDialog } from "./ui/network-dialog.ts";
import { networkButtonLabel } from "./ui/network-text.ts";
import { openSavesDialog } from "./ui/saves-dialog.ts";
import { statusLine } from "./ui/status.ts";
import "./ui/theme.css";
import { createTouchKeys } from "./ui/touch-keys.ts";
import { createWindow, type WindowView } from "./ui/window.ts";
import { welcomeText } from "./welcome.ts";

const savingOff = () => showMessage("LinuxWeb", "Saving is off in this browser");

function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

async function loadImageVersion(base: string): Promise<string | null> {
  try {
    const response = await fetch(`${base}image/version.txt`);
    if (!response.ok) return null;
    return (await response.text()).trim() || null;
  } catch {
    return null;
  }
}

async function boot(view: WindowView, relay: string | null): Promise<Vm | null> {
  for (;;) {
    view.showBoot("Starting Linux…");
    try {
      const vm = await startVm(browserVmOptions(import.meta.env.BASE_URL, relay), {
        onProgress: (loaded, total) => view.setProgress(loaded, total),
      });
      view.hideBoot();
      return vm;
    } catch (error) {
      view.hideBoot();
      if (error instanceof MemoryError) {
        await showMessage("LinuxWeb", error.message);
        return null;
      }
      await showDialog("LinuxWeb", "Couldn't download Linux. Check your connection.", [
        { label: "Retry", value: "retry", primary: true },
      ]);
    }
  }
}

async function main() {
  const app = document.querySelector<HTMLElement>("#app")!;
  if (typeof WebAssembly !== "object") {
    app.textContent =
      "LinuxWeb needs WebAssembly, which this browser doesn't support. Try a current version of Chrome, Edge, Firefox, or Safari.";
    return;
  }

  const view = createWindow(app);
  const terminal = createTerminal(view.terminalHost);
  let vm: Vm | undefined;
  const touchKeys = createTouchKeys((data) => vm?.sendSerial(data));
  view.appendTouchKeys(touchKeys);

  const packages = new PackagesWatcher({
    readFile: (path) => (vm ? vm.readFile(path) : Promise.reject(new Error("Linux has not started"))),
  });
  let homeStatus: HomeStatus = { kind: "starting" };
  const renderStatus = () => {
    view.status.textContent = statusLine(packages.text(), homeStatus, Date.now());
  };
  const setStatus = (status: HomeStatus) => {
    homeStatus = status;
    renderStatus();
  };
  setInterval(renderStatus, 1000);

  const storage = browserStorage();
  const savedRelay = readSavedRelay(storage);
  const relay = relayUrl(savedRelay, import.meta.env.VITE_RELAY_URL);
  const imageVersion = loadImageVersion(import.meta.env.BASE_URL);

  let store: Store | undefined;
  try {
    store = await Store.open();
  } catch {
    setStatus({ kind: "off" });
  }

  const booted = await boot(view, relay);
  if (!booted) return;
  vm = booted;
  const running = booted;

  let pending: number[] = [];
  running.onSerialByte((byte) => {
    if (pending.length === 0) {
      requestAnimationFrame(() => {
        terminal.writeBytes(Uint8Array.from(pending));
        pending = [];
      });
    }
    pending.push(byte);
  });
  terminal.onInput((data) => running.sendSerial(touchKeys.transformInput(data)));

  const monitor = new NetworkMonitor({
    relay,
    writeGuest: (path, data) => running.createFile(path, data),
    onChange: (state) => {
      view.buttons.network.textContent = networkButtonLabel(state);
    },
  });
  // Probe while the home folder restores; tell the guest only after the restore.
  const firstCheck = monitor.check();

  let home: HomeSync | undefined;
  let restored: number | null = null;
  if (store && (await acquireSaveLock())) {
    home = new HomeSync({ vm: running, store, onStatus: setStatus });
    try {
      restored = await home.restore();
    } catch {
      restored = null;
    }
    home.start();
  } else if (store) {
    setStatus({ kind: "paused-other-tab" });
  }

  const network = await firstCheck;
  try {
    await monitor.publish(network);
  } catch {
    // The next check writes the state again.
  }
  monitor.start();

  terminal.writeText(welcomeText(restored, network === "online" ? "online" : "offline"));
  running.sendSerial("\n");

  setInterval(() => {
    packages.pollOnce().then(renderStatus, () => {});
  }, POLL_INTERVAL_MS);

  const reporter = new SizeReporter((path, data) => running.createFile(path, data));
  const refit = () => {
    const { rows, cols } = terminal.fit();
    reporter.report(rows, cols);
  };
  new ResizeObserver(refit).observe(view.terminalHost);
  refit();
  terminal.focus();

  const saves = store ? new MachineSaves({ vm: running, store, imageVersion: await imageVersion }) : undefined;

  view.buttons.save.addEventListener("click", async () => {
    if (!saves) return savingOff();
    view.buttons.save.disabled = true;
    try {
      const saved = await saves.save();
      await showMessage("Save machine", `Saved "${saved.name}".`);
    } catch (error) {
      await showMessage("Save machine", error instanceof Error ? error.message : String(error));
    } finally {
      view.buttons.save.disabled = false;
      terminal.focus();
    }
  });

  view.buttons.saves.addEventListener("click", async () => {
    if (!saves) return savingOff();
    await openSavesDialog(saves, () => {
      terminal.writeText("\r\nRestored the saved machine.\r\n");
      running.sendSerial("\n");
    });
    terminal.focus();
  });

  view.buttons.reset.addEventListener("click", async () => {
    const choice = await showDialog("Reset", "Start a fresh machine from the original snapshot?", [
      { label: "Cancel", value: "cancel" },
      { label: "Reset and clear home folder", value: "clear" },
      { label: "Reset, keep home folder", value: "keep", primary: true },
    ]);
    if (choice === "clear") {
      home?.stop();
      await store?.clearHome();
    }
    if (choice === "keep" || choice === "clear") location.reload();
    else terminal.focus();
  });

  view.buttons.network.addEventListener("click", async () => {
    const state = await monitor.refresh().catch(() => monitor.state);
    await openNetworkDialog({
      state,
      relay,
      saved: savedRelay,
      save: async (url) => {
        writeSavedRelay(storage, url);
        await home?.flush();
        location.reload();
      },
    });
    terminal.focus();
  });

  // iPhone Safari has no element full screen; hide the button instead of letting it do nothing.
  view.buttons.fullscreen.hidden = !document.fullscreenEnabled;
  view.buttons.fullscreen.addEventListener("click", () => {
    view.root.requestFullscreen().catch(() => showMessage("Full screen", "This browser didn't allow full screen."));
  });
  view.buttons.exitFullscreen.addEventListener("click", () => {
    document.exitFullscreen().catch(() => {});
  });

  view.buttons.help.addEventListener("click", async () => {
    const pre = document.createElement("pre");
    pre.className = "help-text";
    pre.textContent = helpText;
    await showDialog("Help", pre, [{ label: "OK", value: "ok", primary: true }]);
    terminal.focus();
  });
}

void main();
```

- [ ] **Step 5: Automated checks and commit**

Run: `npx vitest run; npm run lint; npx tsc --noEmit; npm run build`
Expected: all PASS / exit 0.
```bash
git add src
git commit -m "feat: add the Network button and dialog and wire networking, reinstall status and image version into the page"
git push
```

- [ ] **Step 6: Verify in the browser against the CI-built image and a local relay**

After CI's image job finishes for this push:
```bash
rm -rf image/out
gh run download <run-id> -R hammadshakeelai/LinuxWeb -n linuxweb-image -D /tmp/linuxweb-image
tar -xf /tmp/linuxweb-image/image-out.tar -C image
ALLOWED_ORIGINS=http://localhost:5173 PORT=8080 node relay/server.ts   # in a second terminal
npm run dev                                                           # http://localhost:5173/LinuxWeb/
```
Check, in order:
1. The toolbar shows `Network: Offline`; the welcome ends with the offline line; `apk add nyancat` prints the offline message; `nyancat` prints the install hint and the offline line.
2. Open **Network**, type `wisps://bad`, press **Save and reload**: the validation message appears and nothing reloads.
3. Enter `wisp://127.0.0.1:8080/` and press **Save and reload**: after the reload the button shows `Network: Online` and the welcome shows the online line.
4. `apk add nyancat` succeeds, and `curl -sI https://example.com | head -n 1` prints an HTTP status line.
5. Wait for "Home folder saved", then reload: the status line shows `Reinstalling 1 package…` then `Reinstalled 1 package`.
6. Stop the relay and open **Network**: the dialog says it can't reach the relay and the button shows `Network: Unreachable`.
7. Saves made before this image show `(older LinuxWeb)` with only Download and Delete.

Expected: all seven behave as described. Fix anything that doesn't, then commit and push the fix.

---

### Task 9: Network end-to-end test, deploy setting, docs, and launch

**Files:**
- Create: `e2e/network.spec.ts`, `relay/README.md`
- Modify: `playwright.config.ts`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`, `THIRD_PARTY_NOTICES.md`
- Regenerate: `docs/screenshot.png`

**Interfaces:**
- Consumes: `startRelay`, `readConfig` (Task 1); the Network button labels, `Relay address` field, `Save and reload` button, `data-testid="status"` (Task 8)

- [ ] **Step 1: Keep the network test out of the required job**

In `playwright.config.ts`, add inside `defineConfig({ ... })` after `testDir: "e2e",`:
```ts
  // The network test uses the internet; only the "Network (uses the internet)" CI job runs it.
  testIgnore: process.env.LINUXWEB_NETWORK_E2E ? [] : ["**/network.spec.ts"],
```

- [ ] **Step 2: Write the network end-to-end test**

`e2e/network.spec.ts`:
```ts
import { expect, test, type Page } from "@playwright/test";
import { readConfig } from "../relay/config.ts";
import { startRelay, type Relay } from "../relay/server.ts";

const rows = (page: Page) => page.locator(".xterm-rows");
let relay: Relay;

test.beforeAll(async () => {
  // The default allowed origins include the preview server, http://localhost:4173.
  relay = await startRelay({ ...readConfig({}), port: 0 });
});

test.afterAll(async () => {
  await relay.close();
});

async function typeCommand(page: Page, command: string) {
  await page.locator(".xterm-screen").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

function homeSavedAt(): Promise<number> {
  return new Promise((resolve) => {
    const open = indexedDB.open("linuxweb");
    open.addEventListener("error", () => resolve(0));
    open.addEventListener("success", () => {
      const get = open.result.transaction("home").objectStore("home").get("current");
      get.addEventListener("error", () => resolve(0));
      get.addEventListener("success", () => resolve(get.result?.savedAt ?? 0));
    });
  });
}

test("a package installed through the relay is reinstalled after a reload", async ({ page }) => {
  await page.goto("./");
  await expect(rows(page)).toContainText("localhost:~#", { timeout: 10 * 60_000 });

  await page.getByRole("button", { name: "Network: Offline" }).click();
  await page.getByLabel("Relay address").fill(`wisp://127.0.0.1:${relay.port}/`);
  await page.getByRole("button", { name: "Save and reload" }).click();

  await expect(page.getByRole("button", { name: "Network: Online" })).toBeVisible({ timeout: 10 * 60_000 });
  await expect(rows(page)).toContainText("Network is online", { timeout: 10 * 60_000 });

  await typeCommand(page, "apk add nyancat && echo INSTALL-$((20+22))");
  await expect(rows(page)).toContainText("INSTALL-42", { timeout: 10 * 60_000 });
  await typeCommand(page, "while ! grep -qx nyancat /root/.config/linuxweb/packages; do sleep 1; done; echo TRACKED-$((20+22))");
  await expect(rows(page)).toContainText("TRACKED-42", { timeout: 2 * 60_000 });

  // Any home-folder save after the list was written includes it.
  const trackedAt = await page.evaluate(() => Date.now());
  await expect.poll(() => page.evaluate(homeSavedAt), { timeout: 60_000 }).toBeGreaterThan(trackedAt);

  await page.reload();
  await expect(page.getByTestId("status")).toContainText("Reinstalled 1 package", { timeout: 10 * 60_000 });
});
```

- [ ] **Step 3: Run the network end-to-end test in CI**

In `.github/workflows/ci.yml`, append to the `network` job's steps after `- run: node image/test-network.ts`:
```yaml
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test network.spec.ts
        env:
          LINUXWEB_NETWORK_E2E: "1"
```

- [ ] **Step 4: Pass the site default relay to the deploy build**

In `.github/workflows/deploy.yml`, replace `- run: npm run build` with:
```yaml
      - run: npm run build
        env:
          VITE_RELAY_URL: ${{ vars.RELAY_URL }}
```

- [ ] **Step 5: Document the relay**

`relay/README.md`:
````markdown
# LinuxWeb relay

A small [WISP](https://github.com/MercuryWorkshop/wisp-protocol) server that forwards LinuxWeb's outgoing TCP connections to the internet. It uses [`@mercuryworkshop/wisp-js`](https://github.com/MercuryWorkshop/wisp-js).

## Rules

- Every outgoing TCP port except email (25, 465, 587).
- No private or loopback addresses, and no UDP.
- Up to 100 open connections per browser tab.
- Only browsers on allowed origins can connect. This doesn't stop non-browser clients, so watch your bandwidth.
- Logs stay at warning level, so visitors' addresses and destinations aren't written to them.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `ALLOWED_ORIGINS` | `https://hammadshakeelai.github.io,http://localhost:5173,http://localhost:4173` | Comma-separated browser origins; `*` allows any |
| `TRUSTED_PROXIES` | `127.0.0.1` | Proxy IPs whose `X-Forwarded-For` header is trusted |

## Run it

```bash
npm install
node server.ts
```

Or with Docker:

```bash
docker build -t linuxweb-relay .
docker run -p 8080:8080 linuxweb-relay
```

Put it behind HTTPS (most hosts do this for you) so browsers can use `wisps://`. It runs on any host that supports WebSockets, for example Fly.io, Render, Koyeb, or a small VPS with Caddy in front.

## Use it

- **For yourself:** open LinuxWeb, press **Network**, enter `wisps://your-relay.example.com/` (the trailing `/` matters), and press **Save and reload**.
- **For every visitor:** set the repository variable `RELAY_URL` to that address and run the Deploy workflow.
````

Replace `README.md` with:
````markdown
<p align="center"><a href="https://hammadshakeelai.github.io/LinuxWeb/"><img src="docs/banner.png" alt="LinuxWeb: real Alpine Linux in your browser tab" width="100%"></a></p>

**Try it:** https://hammadshakeelai.github.io/LinuxWeb/

LinuxWeb runs real Alpine Linux 3.21 in your browser with the [v86](https://github.com/copy/v86) emulator. Nothing to install, and nothing you do can touch your own computer.

<p align="center"><img src="docs/screenshot.png" alt="LinuxWeb showing the help tour in its terminal" width="100%"></p>

## What you get

- bash, zsh and fish; nano, vim, Neovim, micro and Midnight Commander.
- gcc, g++, make, nasm, gdb, valgrind, cmake, meson and ninja for C, C++ and assembly.
- Python with pip, Node.js with npm, Lua, SQLite, jq and PostgreSQL 17.
- curl, wget, ssh, git, dig, ip, traceroute, nmap, netcat, whois and the w3m text browser.
- btop, bat, ripgrep, fd, fzf, eza, tmux, fastfetch, and cmatrix, sl and figlet for fun.
- `apt`, `apt-get`, `pacman` and `snap` translate to Alpine's `apk`, and a missing command tells you which package provides it.
- Type `help` for a short tour. **Full screen** makes the terminal fill your screen.

## Networking

Linux reaches the internet through a relay, a small server that forwards its connections. Press **Network**, enter a relay address such as `wisps://relay.example.com/`, and press **Save and reload**. Online, `apk add`, `pip install`, `npm install`, `git clone`, `curl` and `ssh` work.

To run your own relay, see [`relay/README.md`](relay/README.md).

Linux's internet traffic goes through the relay you choose. HTTPS stays encrypted, but the relay sees which addresses and ports you connect to. DNS lookups go to Cloudflare.

## What is saved

- **Your home folder (`/root`) is saved in this browser automatically** and restored on your next visit.
- **Packages you install are reinstalled on your next visit** once you're online.
- Other changes outside `/root` reset on your next visit.
- **Save machine** keeps everything, including open programs. You can keep up to 5 saves and download them.
- Saves live in this browser only. Clearing site data removes them.

## Not included

- No incoming connections: servers you start are reachable only from inside the VM.
- No UDP other than DNS, and `ping` only reaches the virtual router.
- No systemd, so no snaps.

## Development

Requires Node 24. Building the Linux image also needs Docker, Python 3 with `zstandard`, and `zstd` (Linux or WSL).

```bash
npm install
npm run image                 # build and test the Linux image into image/out
npm run dev                   # http://localhost:5173/LinuxWeb/
npm test                      # unit tests
npm run build && npm run test:e2e
node relay/server.ts          # a local relay: use wisp://127.0.0.1:8080/ in the Network dialog
```

The designs and the plans they were built from are in `docs/superpowers/`.

## License

MIT. See `THIRD_PARTY_NOTICES.md` for v86, SeaBIOS, xterm.js, Alpine Linux packages, and wisp-js.
````

Append to `THIRD_PARTY_NOTICES.md`:
```markdown

## wisp-js

`@mercuryworkshop/wisp-js` is used, unmodified, by the relay server in `relay/`. It is not part of the published site.
Project: https://github.com/MercuryWorkshop/wisp-js. License: GNU LGPL v3 or later.
```

- [ ] **Step 6: Regenerate the README screenshot**

With the CI-built image in `image/out`:
```bash
npm run build
npm run preview          # in a second terminal
npm run readme-images
```
Open `docs/screenshot.png` and check it shows the new help tour in bash at the `localhost:~#` prompt.

- [ ] **Step 7: Commit, mark the PR ready, and merge**

Run: `npx vitest run; npm run lint; npx tsc --noEmit` (all exit 0).
```bash
git add -A
git commit -m "feat: add the network end-to-end test, deploy relay setting, relay docs and README"
git push
gh pr ready
gh pr checks --watch
```
Expected: "Build and test image", "Lint, test, and build", and "Network (uses the internet)" all pass. Update the PR description with a summary and the measured sizes, then merge from outside the repo directory:
```bash
gh pr merge <number> --squash --delete-branch -R hammadshakeelai/LinuxWeb
gh run watch "$(gh run list -R hammadshakeelai/LinuxWeb --workflow deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')" -R hammadshakeelai/LinuxWeb --exit-status
```
Expected: the Deploy workflow passes, and the "Check site size" step prints a size under 900 MB.

- [ ] **Step 8: Verify the live site against the spec's "Done means"**

Open `https://hammadshakeelai.github.io/LinuxWeb/` (no relay configured) and confirm:
1. It resumes to a bash prompt; `help` shows the new sections.
2. The toolbar shows `Network: Offline`; `apk add nyancat` and `apt install nyancat` print the offline message.
3. `gcc --version`, `nasm -v`, `nvim --version`, `btop --version`, `psql --version`, `figlet hi` and `cmatrix` (q quits) run.
4. `nyancat` prints the install hint.
5. Machine saves made on v1 show `(older LinuxWeb)`.
6. With a local relay (`ALLOWED_ORIGINS=https://hammadshakeelai.github.io node relay/server.ts`) entered as `wisp://127.0.0.1:8080/`, `apk add nyancat`, `git clone https://github.com/copy/v86 --depth 1` and `curl -sI https://example.com` work, and nyancat is reinstalled after a reload.

Expected: all six pass. Record any failure as a GitHub issue before calling the Network Edition done.
