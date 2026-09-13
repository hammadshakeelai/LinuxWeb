#!/usr/bin/env bash
# Builds the LinuxWeb image into image/out/.
# Needs: Docker, Python 3 with the zstandard package, zstd, Node 24.
set -euo pipefail
cd "$(dirname "$0")"

OUT=out
rm -rf "$OUT"
mkdir -p "$OUT"

docker build --platform linux/386 --tag linuxweb-image .
docker rm -f linuxweb-export >/dev/null 2>&1 || true
docker create --platform linux/386 --name linuxweb-export linuxweb-image >/dev/null
docker export linuxweb-export -o "$OUT/rootfs.tar"
docker rm linuxweb-export >/dev/null
docker run --rm --platform linux/386 linuxweb-image apk list --installed | sort > "$OUT/packages.txt"

tar -f "$OUT/rootfs.tar" --delete ".dockerenv" 2>/dev/null || true
python3 tools/fs2json.py --zstd --out "$OUT/fs.json" "$OUT/rootfs.tar"
python3 tools/copy-to-sha256.py --zstd "$OUT/rootfs.tar" "$OUT/rootfs"
rm "$OUT/rootfs.tar"

node build-state.ts
zstd -19 --rm -f "$OUT/state.bin" -o "$OUT/state.bin.zst"

node test-image.ts
du -sh "$OUT" "$OUT/rootfs" "$OUT/state.bin.zst"
