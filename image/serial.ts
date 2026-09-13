import type { V86 } from "v86";

export function collectSerial(emulator: V86) {
  let text = "";
  emulator.add_listener("serial0-output-byte", (byte) => {
    text += String.fromCharCode(byte);
  });
  return {
    get text() {
      return text;
    },
    mark() {
      return text.length;
    },
    async until(needle: string, timeoutMs: number, from = 0): Promise<string> {
      const started = Date.now();
      while (!text.slice(from).includes(needle)) {
        if (Date.now() - started > timeoutMs) {
          throw new Error(`Timed out waiting for ${JSON.stringify(needle)}. Last output:\n${text.slice(-800)}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      return text.slice(from);
    },
  };
}
