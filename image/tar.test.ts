import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listTarGz } from "./tar.ts";

describe("listTarGz", () => {
  it("lists the entries of a gzip-compressed tar archive", () => {
    const dir = mkdtempSync(join(tmpdir(), "linuxweb-tar-"));
    writeFileSync(join(dir, "a.txt"), "hello");
    writeFileSync(join(dir, "b.txt"), "x".repeat(1500));
    execFileSync("tar", ["-czf", join(dir, "out.tar.gz"), "-C", dir, "a.txt", "b.txt"]);
    expect(listTarGz(readFileSync(join(dir, "out.tar.gz")))).toEqual(["a.txt", "b.txt"]);
  });
});
