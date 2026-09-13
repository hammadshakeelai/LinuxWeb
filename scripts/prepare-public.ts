// Copies the v86 WebAssembly file into public/ and links the built image
// (image/out) at public/image so dev, preview and build can serve it.
import { copyFile, mkdir, rm, stat, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

await mkdir(root("public/v86"), { recursive: true });
await copyFile(require.resolve("v86/build/v86.wasm"), root("public/v86/v86.wasm"));

const imageOut = root("image/out");
const publicImage = root("public/image");
await rm(publicImage, { recursive: true, force: true });
try {
  await stat(imageOut);
  await symlink(imageOut, publicImage, "junction");
  console.log("Linked image/out -> public/image");
} catch {
  console.warn("image/out not found: the page will build, but Linux won't boot until you run `npm run image`.");
}
