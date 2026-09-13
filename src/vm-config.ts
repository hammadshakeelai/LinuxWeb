// v86 options shared by image/build-state.ts, image/test-image.ts and the page.
// A snapshot only restores into an emulator created with the same options.
import type { V86Options } from "v86";

export const MEMORY_SIZE = 256 * 1024 * 1024;
export const VGA_MEMORY_SIZE = 8 * 1024 * 1024;
export const CMDLINE =
  "rw root=host9p rootfstype=9p rootflags=trans=virtio,cache=loose modules=virtio_pci tsc=reliable init_on_free=on";

export interface VmPaths {
  wasm?: string;
  bios: string;
  vgaBios: string;
  baseurl: string;
  basefs: string;
  state?: string;
}

export function vmOptions(paths: VmPaths): V86Options {
  return {
    ...(paths.wasm ? { wasm_path: paths.wasm } : {}),
    memory_size: MEMORY_SIZE,
    vga_memory_size: VGA_MEMORY_SIZE,
    autostart: true,
    bios: { url: paths.bios },
    vga_bios: { url: paths.vgaBios },
    cmdline: CMDLINE,
    bzimage_initrd_from_filesystem: true,
    filesystem: { baseurl: paths.baseurl, basefs: paths.basefs },
    ...(paths.state ? { initial_state: { url: paths.state } } : {}),
    disable_keyboard: true,
    disable_mouse: true,
    disable_speaker: true,
  };
}
