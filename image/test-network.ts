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
