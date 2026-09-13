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
docker export linuxweb-export -o "$OUT/export.tar"
docker rm linuxweb-export >/dev/null
docker run --rm --platform linux/386 linuxweb-image apk list --installed | sort > "$OUT/packages.txt"

# fix-export.py drops .dockerenv, restores the files Docker blanks (hosts, hostname,
# resolv.conf), and fails if the export is missing /var or another needed directory.
echo "INFO /var entries in the export: $(tar -tf "$OUT/export.tar" | grep -c '^var/' || true)"
python3 tools/fix-export.py "$OUT/export.tar" "$OUT/rootfs.tar" rootfs
rm "$OUT/export.tar"
python3 tools/fs2json.py --zstd --out "$OUT/fs.json" "$OUT/rootfs.tar"
mkdir -p "$OUT/rootfs"   # copy-to-sha256.py expects the folder to exist
python3 tools/copy-to-sha256.py --zstd "$OUT/rootfs.tar" "$OUT/rootfs"
rm "$OUT/rootfs.tar"

node build-state.ts
zstd -19 --rm -f "$OUT/state.bin" -o "$OUT/state.bin.zst"
# The page marks machine saves made on a different image as older (network spec section 4).
cat "$OUT/fs.json" "$OUT/state.bin.zst" | sha256sum | cut -c1-12 > "$OUT/version.txt"

node test-image.ts
du -sh "$OUT" "$OUT/rootfs" "$OUT/state.bin.zst"
