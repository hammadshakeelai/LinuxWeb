// Resumes image/out/state.bin.zst in Node and checks the things the design relies on
// (spec section 9). Exits non-zero on the first failure.
import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { V86 } from "v86";
import { HOME_ARCHIVE, HOME_VERSION, RESTORED_COUNT, TERMINAL_SIZE } from "../src/protocol.ts";
import { vmOptions } from "../src/vm-config.ts";
import { collectSerial } from "./serial.ts";
import { listTarGz } from "./tar.ts";

const require = createRequire(import.meta.url);
const file = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const PROMPT = "localhost:~# ";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function folderBytes(dir: string): Promise<number> {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await folderBytes(path) : (await stat(path)).size;
  }
  return total;
}

const emulator = new V86(
  vmOptions({
    wasm: require.resolve("v86/build/v86.wasm"),
    bios: file("../public/bios/seabios.bin"),
    vgaBios: file("../public/bios/vgabios.bin"),
    baseurl: file("./out/rootfs/"),
    basefs: file("./out/fs.json"),
    state: file("./out/state.bin.zst"),
  }),
);
const serial = collectSerial(emulator);
await new Promise<void>((resolve) => emulator.add_listener("emulator-loaded", () => resolve()));

async function run(command: string, expect: string, timeoutMs = 120_000) {
  const from = serial.mark();
  emulator.serial0_send(`${command}\n`);
  return serial.until(expect, timeoutMs, from);
}

async function readText(path: string): Promise<string> {
  try {
    return new TextDecoder().decode(await emulator.read_file(path)).trim();
  } catch {
    return "";
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, what: string) {
  const started = Date.now();
  while (!(await check())) {
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(500);
  }
}

function pass(message: string) {
  console.log(`PASS ${message}`);
}

// Spec 9.2: a newline after resume produces a fresh prompt.
await run("", PROMPT);
pass("newline after resume prints a prompt");

await run("help", "LinuxWeb tour");
pass("help prints the tour");

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

// Spec 9.1: guest writes to the 9P root are readable from the host.
const versionBefore = await readText(HOME_VERSION);
await run("echo probe > /root/probe.txt", PROMPT);
await waitFor(async () => (await readText(HOME_VERSION)) !== versionBefore, 20_000, "home.version to change");
assert.ok(listTarGz(await emulator.read_file(HOME_ARCHIVE)).includes("./probe.txt"), "home.tar.gz contains probe.txt");
pass("helper bundles /root and the host can read it");

// Restore: the helper unpacks restore.tar.gz into /root and reports the count.
await run(
  "mkdir -p /tmp/r && echo restored > /tmp/r/restored.txt && tar -czf /tmp/restore.tar.gz -C /tmp/r restored.txt && mv /tmp/restore.tar.gz /.linuxweb/restore.tar.gz",
  PROMPT,
);
await waitFor(async () => (await readText(RESTORED_COUNT)) === "1", 20_000, "restored count 1");
await run("cat /root/restored.txt", "restored\r\n");
pass("helper restores an archive into /root");

// Spec 9.3: a size written by the host is applied to the serial terminal.
await emulator.create_file(TERMINAL_SIZE, new TextEncoder().encode("40 100"));
await sleep(5_000);
await run("stty size", "40 100");
pass("host-written terminal size is applied with stty");

// Spec 9.4: a machine save compresses to a size that fits in IndexedDB.
const saved = await emulator.save_state();
const savedMB = gzipSync(new Uint8Array(saved)).byteLength / 1e6;
console.log(`INFO machine save: ${Math.round(saved.byteLength / 1e6)} MB raw, ${savedMB.toFixed(1)} MB gzip`);
assert.ok(savedMB < 60, "compressed machine save is under 60 MB");
pass("machine save size");

// Spec 9.5: sizes.
const treeMB = (await folderBytes(file("./out/rootfs/"))) / 1e6;
const stateMB = (await stat(file("./out/state.bin.zst"))).size / 1e6;
console.log(`INFO file tree ${treeMB.toFixed(0)} MB, snapshot ${stateMB.toFixed(1)} MB`);
assert.ok(treeMB < 850, "file tree is under 850 MB");
pass("image sizes");

await emulator.destroy();
console.log("All image checks passed.");
