// Vite may copy public/image as a link; replace it with a real copy of image/out
// so preview and GitHub Pages serve the files.
import { cp, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));
await rm(root("dist/image"), { recursive: true, force: true });
try {
  await stat(root("image/out/state.bin.zst"));
} catch {
  console.warn("image/out is missing: dist/ has no Linux image.");
  process.exit(0);
}
await cp(root("image/out"), root("dist/image"), { recursive: true, dereference: true });
console.log("Copied image/out -> dist/image");
