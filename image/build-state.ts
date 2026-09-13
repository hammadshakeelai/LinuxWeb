// Boots image/out in Node and saves the running machine to image/out/state.bin.
import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { V86 } from "v86";
import { vmOptions } from "../src/vm-config.ts";
import { collectSerial } from "./serial.ts";

const require = createRequire(import.meta.url);
const file = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const emulator = new V86(
  vmOptions({
    wasm: require.resolve("v86/build/v86.wasm"),
    bios: file("../public/bios/seabios.bin"),
    vgaBios: file("../public/bios/vgabios.bin"),
    baseurl: file("./out/rootfs/"),
    basefs: file("./out/fs.json"),
  }),
);
const serial = collectSerial(emulator);

console.log("Booting the image (a few minutes)...");
await serial.until("localhost:~# ", 15 * 60_000);
emulator.serial0_send("sync; echo 3 > /proc/sys/vm/drop_caches\n");
await new Promise((resolve) => setTimeout(resolve, 10_000));

const state = await emulator.save_state();
await writeFile(file("./out/state.bin"), new Uint8Array(state));
await emulator.destroy();
console.log(`Saved image/out/state.bin (${Math.round(state.byteLength / 1e6)} MB before compression)`);
