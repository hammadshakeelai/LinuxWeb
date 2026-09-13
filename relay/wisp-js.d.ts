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
