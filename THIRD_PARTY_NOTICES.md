# Third-Party Notices

LinuxWeb's own code is MIT-licensed (see `LICENSE`). It redistributes the following, each under its own license.

## v86

`v86.wasm` (copied from the npm `v86` package at build time) and the emulator code bundled into the page.
Project: https://github.com/copy/v86. License: BSD-2-Clause. Copyright (c) 2012, The v86 contributors.

## SeaBIOS and SeaVGABIOS

`public/bios/seabios.bin` and `public/bios/vgabios.bin`, from v86 commit `d96be774e549a83371b038b86e819804c96b921f`.
Project: https://www.seabios.org/. License: GNU LGPL v3. Source: https://review.coreboot.org/seabios.git.

## xterm.js

Bundled into the page. Project: https://github.com/xtermjs/xterm.js. License: MIT.

## Alpine Linux packages

The Linux image published under `/LinuxWeb/image/` is built from `image/Dockerfile` using Alpine Linux 3.21 packages, which are under their own licenses, including the GNU GPL. The exact package list for each build is published at `/LinuxWeb/image/packages.txt`. The corresponding sources are in Alpine's `aports` repository for the 3.21 branch (https://gitlab.alpinelinux.org/alpine/aports/-/tree/3.21-stable) and at https://dl-cdn.alpinelinux.org/alpine/v3.21/. Anyone can rebuild the exact image with `npm run image`.
