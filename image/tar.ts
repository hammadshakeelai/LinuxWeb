import { gunzipSync } from "node:zlib";

// Lists entry names in a .tar.gz (ustar headers; enough for BusyBox tar output).
export function listTarGz(bytes: Uint8Array): string[] {
  const tar = gunzipSync(bytes);
  const names: string[] = [];
  const decoder = new TextDecoder();
  for (let offset = 0; offset + 512 <= tar.length; ) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const field = (start: number, length: number) =>
      decoder.decode(header.subarray(start, start + length)).replace(/\0.*$/s, "").trim();
    const prefix = field(345, 155);
    const name = field(0, 100);
    names.push(prefix ? `${prefix}/${name}` : name);
    const size = parseInt(field(124, 12) || "0", 8);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return names;
}
