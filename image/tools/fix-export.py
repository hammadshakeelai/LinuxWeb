#!/usr/bin/env python3
# Rewrites a `docker export` tar for LinuxWeb: drops /.dockerenv, and replaces the files Docker
# blanks in every container (hosts, hostname, resolv.conf) with the copies in image/rootfs.
# Exits non-zero if the export is missing a top-level directory the image needs.
# Usage: fix-export.py <export.tar> <rootfs.tar> <image/rootfs>
import io
import sys
import tarfile
from pathlib import Path

DOCKER_FILES = {"etc/hosts", "etc/hostname", "etc/resolv.conf"}
REQUIRED = ["bin", "etc", "root", "tmp", "usr", "var"]


def main(src_path: str, dst_path: str, rootfs: str) -> None:
    counts: dict[str, int] = {}
    with tarfile.open(src_path) as src, tarfile.open(dst_path, "w", format=tarfile.PAX_FORMAT) as dst:
        for member in src:
            top = member.name.split("/")[0]
            counts[top] = counts.get(top, 0) + 1
            if member.name == ".dockerenv":
                continue
            if member.name in DOCKER_FILES:
                data = (Path(rootfs) / member.name).read_bytes()
                member.size = len(data)
                member.mode = 0o644
                dst.addfile(member, io.BytesIO(data))
                continue
            dst.addfile(member, src.extractfile(member) if member.isreg() else None)

    print("INFO entries per top-level directory: " + ", ".join(f"{name} {n}" for name, n in sorted(counts.items())))
    missing = [name for name in REQUIRED if name not in counts]
    if missing:
        sys.exit(f"The export is missing: {', '.join(missing)}")


if __name__ == "__main__":
    main(*sys.argv[1:4])
