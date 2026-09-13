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
