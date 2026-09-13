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
