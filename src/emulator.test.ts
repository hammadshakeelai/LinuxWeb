import { describe, expect, it, vi } from "vitest";
import { DownloadError, MemoryError, browserVmOptions, isMemoryError, startVm, type V86Like } from "./emulator.ts";

class FakeV86 implements V86Like {
  listeners = new Map<string, Array<(argument: unknown) => void>>();
  add_listener(event: string, listener: (argument: unknown) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  emit(event: string, argument?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(argument);
  }
  serial_send_bytes = vi.fn();
  read_file = vi.fn(async () => new Uint8Array([1]));
  create_file = vi.fn(async () => {});
  save_state = vi.fn(async () => new ArrayBuffer(4));
  restore_state = vi.fn(async () => {});
  destroy = vi.fn(async () => {});
}

describe("startVm", () => {
  it("reports summed download progress and resolves when loaded", async () => {
    const fake = new FakeV86();
    const onProgress = vi.fn();
    const started = startVm({}, { onProgress, create: () => fake });
    fake.emit("download-progress", { file_name: "state", loaded: 5, total: 10, lengthComputable: true });
    fake.emit("download-progress", { file_name: "fs", loaded: 2, total: 4, lengthComputable: true });
    expect(onProgress).toHaveBeenLastCalledWith(7, 14);
    fake.emit("emulator-loaded");
    const vm = await started;

    const bytes: number[] = [];
    vm.onSerialByte((byte) => bytes.push(byte));
    fake.emit("serial0-output-byte", 65);
    expect(bytes).toEqual([65]);
    vm.sendSerial("ls\n");
    expect(fake.serial_send_bytes).toHaveBeenCalledWith(0, new TextEncoder().encode("ls\n"));
    await vm.createFile("/x", new Uint8Array([2]));
    expect(fake.create_file).toHaveBeenCalledWith("/x", new Uint8Array([2]));
  });

  it("rejects with DownloadError and destroys the emulator when a download fails", async () => {
    const fake = new FakeV86();
    const started = startVm({}, { create: () => fake });
    fake.emit("download-error", { file_name: "state.bin.zst" });
    await expect(started).rejects.toBeInstanceOf(DownloadError);
    expect(fake.destroy).toHaveBeenCalled();
  });

  it("rejects with MemoryError when creating the emulator runs out of memory", async () => {
    const started = startVm(
      {},
      {
        create: () => {
          throw new RangeError("WebAssembly.Memory(): could not allocate memory");
        },
        watchErrors: () => () => {},
      },
    );
    await expect(started).rejects.toBeInstanceOf(MemoryError);
  });

  it("rejects with MemoryError when v86 reports an allocation failure later", async () => {
    const fake = new FakeV86();
    let report: ((reason: unknown) => void) | undefined;
    const unwatch = vi.fn();
    const started = startVm(
      {},
      {
        create: () => fake,
        watchErrors: (onError) => {
          report = onError;
          return unwatch;
        },
      },
    );
    report?.(new Error("some unrelated error"));
    report?.(new RangeError("out of memory"));
    await expect(started).rejects.toBeInstanceOf(MemoryError);
    expect(unwatch).toHaveBeenCalled();
  });
});

describe("isMemoryError", () => {
  it("recognizes allocation failures only", () => {
    expect(isMemoryError(new RangeError("anything"))).toBe(true);
    expect(isMemoryError(new Error("Out of memory"))).toBe(true);
    expect(isMemoryError("could not allocate memory")).toBe(true);
    expect(isMemoryError(new Error("memory access out of bounds"))).toBe(false);
  });
});

describe("browserVmOptions", () => {
  it("points every file at the site base path", () => {
    const options = browserVmOptions("/LinuxWeb/");
    expect(options.wasm_path).toBe("/LinuxWeb/v86/v86.wasm");
    expect(options.bios).toEqual({ url: "/LinuxWeb/bios/seabios.bin" });
    expect(options.initial_state).toEqual({ url: "/LinuxWeb/image/state.bin.zst" });
    expect(options.filesystem).toEqual({ baseurl: "/LinuxWeb/image/rootfs/", basefs: "/LinuxWeb/image/fs.json" });
  });

  it("adds the relay only when one is given", () => {
    expect(browserVmOptions("/LinuxWeb/").net_device).toEqual({ type: "virtio" });
    expect(browserVmOptions("/LinuxWeb/", "wisps://relay.example.com/").net_device).toEqual({
      type: "virtio",
      relay_url: "wisps://relay.example.com/",
    });
  });
});
