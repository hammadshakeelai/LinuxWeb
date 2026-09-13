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

interface ProgressEvent {
  file_name: string;
  loaded: number;
  total: number;
  lengthComputable: boolean;
}

export function browserVmOptions(base: string): V86Options {
  return vmOptions({
    wasm: `${base}v86/v86.wasm`,
    bios: `${base}bios/seabios.bin`,
    vgaBios: `${base}bios/vgabios.bin`,
    baseurl: `${base}image/rootfs/`,
    basefs: `${base}image/fs.json`,
    state: `${base}image/state.bin.zst`,
  });
}

export function startVm(
  options: V86Options,
  start: {
    onProgress?: (loadedBytes: number, totalBytes: number) => void;
    create?: (options: V86Options) => V86Like;
  } = {},
): Promise<Vm> {
  const create = start.create ?? ((o: V86Options) => new V86(o) as unknown as V86Like);
  const emulator = create(options);
  const files = new Map<string, { loaded: number; total: number }>();

  return new Promise((resolve, reject) => {
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
      void emulator.destroy();
      reject(new DownloadError((argument as { file_name: string }).file_name));
    });
    // v86 fires emulator-ready before it restores initial_state; only emulator-loaded is safe.
    emulator.add_listener("emulator-loaded", () => resolve(wrap(emulator)));
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
