import { describe, expect, it } from "vitest";
import { gunzip, gzip } from "./gzip.ts";

describe("gzip", () => {
  it("round-trips bytes and shrinks repetitive data", async () => {
    const input = new Uint8Array(100_000).fill(7);
    const compressed = await gzip(input);
    expect(compressed.byteLength).toBeLessThan(1_000);
    expect(await gunzip(compressed)).toEqual(input);
  });

  it("rejects data that is not gzip", async () => {
    await expect(gunzip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});
