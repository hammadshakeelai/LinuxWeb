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
