import { describe, expect, it } from "vitest";
import { CMDLINE, MEMORY_SIZE, vmOptions } from "./vm-config.ts";

const paths = { bios: "b", vgaBios: "v", baseurl: "rootfs/", basefs: "fs.json" };

describe("vmOptions", () => {
  it("uses 256 MB and the 9P root command line", () => {
    const options = vmOptions(paths);
    expect(MEMORY_SIZE).toBe(268435456);
    expect(options.memory_size).toBe(268435456);
    expect(options.cmdline).toBe(CMDLINE);
    expect(options.filesystem).toEqual({ baseurl: "rootfs/", basefs: "fs.json" });
    expect(options.bzimage_initrd_from_filesystem).toBe(true);
  });

  it("adds the snapshot and wasm path only when given", () => {
    expect(vmOptions(paths).initial_state).toBeUndefined();
    expect(vmOptions(paths).wasm_path).toBeUndefined();
    const options = vmOptions({ ...paths, state: "state.bin.zst", wasm: "v86.wasm" });
    expect(options.initial_state).toEqual({ url: "state.bin.zst" });
    expect(options.wasm_path).toBe("v86.wasm");
  });
});
