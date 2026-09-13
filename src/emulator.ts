import { V86, type V86Options } from "v86";
import { vmOptions } from "./vm-config.ts";

export interface V86Like {
  add_listener(event: string, listener: (argument: unknown) => void): void;
  serial_send_bytes(serial: number, data: Uint8Array): void;
  read_file(path: string): Promise<Uint8Array>;
  create_file(path: string, data: Uint8Array): Promise<void>;
  save_state(): Promise<ArrayBuffer>;
  restore_state(state: ArrayBuffer): Promise<void>;
  destroy(): Promise<void>;
}

export interface Vm {
  onSerialByte(listener: (byte: number) => void): void;
  sendSerial(text: string): void;
  readFile(path: string): Promise<Uint8Array>;
  createFile(path: string, data: Uint8Array): Promise<void>;
  saveState(): Promise<ArrayBuffer>;
  restoreState(state: ArrayBuffer): Promise<void>;
  destroy(): Promise<void>;
}

export class DownloadError extends Error {
  readonly fileName: string;

  constructor(fileName: string) {
    super(`Couldn't download ${fileName}`);
    this.name = "DownloadError";
    this.fileName = fileName;
  }
}

export class MemoryError extends Error {
  constructor() {
    super("This device doesn't have enough free memory to run LinuxWeb (it needs 512 MB).");
    this.name = "MemoryError";
  }
}

export function isMemoryError(reason: unknown): boolean {
  if (reason instanceof RangeError) return true;
  const message = reason instanceof Error ? reason.message : String(reason);
  return /out of memory|could not allocate/i.test(message);
}

interface ProgressEvent {
  file_name: string;
  loaded: number;
  total: number;
  lengthComputable: boolean;
}

function browserErrorWatcher(onError: (reason: unknown) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onRejection = (event: PromiseRejectionEvent) => onError(event.reason);
  const onErrorEvent = (event: ErrorEvent) => onError(event.error ?? event.message);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("error", onErrorEvent);
  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onErrorEvent);
  };
}

export function browserVmOptions(base: string, relayUrl?: string | null): V86Options {
  return vmOptions({
    wasm: `${base}v86/v86.wasm`,
    bios: `${base}bios/seabios.bin`,
    vgaBios: `${base}bios/vgabios.bin`,
    baseurl: `${base}image/rootfs/`,
    basefs: `${base}image/fs.json`,
    state: `${base}image/state.bin.zst`,
    ...(relayUrl ? { relayUrl } : {}),
  });
}

export function startVm(
  options: V86Options,
  start: {
    onProgress?: (loadedBytes: number, totalBytes: number) => void;
    create?: (options: V86Options) => V86Like;
    watchErrors?: (onError: (reason: unknown) => void) => () => void;
  } = {},
): Promise<Vm> {
  const create = start.create ?? ((o: V86Options) => new V86(o) as unknown as V86Like);
  const watchErrors = start.watchErrors ?? browserErrorWatcher;
  const files = new Map<string, { loaded: number; total: number }>();

  return new Promise((resolve, reject) => {
    // v86 allocates its memory asynchronously, so an allocation failure surfaces as an unhandled error.
    const unwatch = watchErrors((reason) => {
      if (!isMemoryError(reason)) return;
      unwatch();
      reject(new MemoryError());
    });

    let emulator: V86Like;
    try {
      emulator = create(options);
    } catch (error) {
      unwatch();
      reject(isMemoryError(error) ? new MemoryError() : error);
      return;
    }

    emulator.add_listener("download-progress", (argument) => {
      const event = argument as ProgressEvent;
      files.set(event.file_name, { loaded: event.loaded, total: event.lengthComputable ? event.total : event.loaded });
      let loaded = 0;
      let total = 0;
      for (const file of files.values()) {
        loaded += file.loaded;
        total += file.total;
      }
      start.onProgress?.(loaded, total);
    });
    emulator.add_listener("download-error", (argument) => {
      unwatch();
      void emulator.destroy();
      reject(new DownloadError((argument as { file_name: string }).file_name));
    });
    // v86 fires emulator-ready before it restores initial_state; only emulator-loaded is safe.
    emulator.add_listener("emulator-loaded", () => {
      unwatch();
      resolve(wrap(emulator));
    });
  });
}

function wrap(emulator: V86Like): Vm {
  return {
    onSerialByte: (listener) => emulator.add_listener("serial0-output-byte", (byte) => listener(byte as number)),
    // serial0_send would mangle non-ASCII text; send UTF-8 bytes instead.
    sendSerial: (text) => emulator.serial_send_bytes(0, new TextEncoder().encode(text)),
    readFile: (path) => emulator.read_file(path),
    createFile: (path, data) => emulator.create_file(path, data),
    saveState: () => emulator.save_state(),
    restoreState: (state) => emulator.restore_state(state),
    destroy: () => emulator.destroy(),
  };
}
