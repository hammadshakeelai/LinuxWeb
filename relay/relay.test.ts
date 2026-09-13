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
