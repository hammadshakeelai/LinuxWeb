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

function setupMonitor(relay: string | null, probeResult: "online" | "unreachable" = "online") {
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

describe("NetworkMonitor", () => {
  const setup = setupMonitor;

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
