# LinuxWeb: Design Spec

| | |
| --- | --- |
| **Status** | Approved design, awaiting spec review |
| **Date** | 2026-09-13 |
| **Repo** | `hammadshakeelai/LinuxWeb` (new, default branch `main`) |
| **Live site** | `https://hammadshakeelai.github.io/LinuxWeb/` |
| **Sister project** | RetroMuseum (see `2026-09-13-retromuseum-design.md`) |

## 1. What it is

LinuxWeb is one real, current Linux (Alpine Linux 3.21, 32-bit) running in a browser tab. You open the page, get a real shell, and your home folder is still there next time.

**Audience:** people learning Linux who want to practice without risking their own computer, and portfolio visitors who should see a polished, reliable demo.

**What matters most:** a friendly first screen, files that survive between visits, reliability, and a great README.

### Goals

- On a return visit, reach a working prompt within about 10 seconds on a typical laptop.
- Keep the user's home folder (`/root`) automatically between visits.
- Let the user save and restore the whole machine on demand.
- Ship a Linux we build ourselves from a committed Dockerfile, so it is reproducible and GPL-clean.
- Work at desktop and phone widths.

### Non-goals (v1)

- Internet access from inside Linux. v86's `fetch` backend only reaches HTTP servers that allow cross-origin requests, and Alpine's package mirror does not, so `apk add` could not work without a proxy server.
- More than one distro, a graphical desktop, or multiple VMs.
- Accounts, cloud sync, or sharing environments by link.

## 2. Decisions made during brainstorming

| Topic | Decision |
| --- | --- |
| Core idea | One great Linux in a tab (not a multi-profile lab) |
| Audience | Learners practicing Linux, and a portfolio showpiece |
| First screen | A full-screen terminal (xterm.js), not a desktop |
| Look | RetroMuseum's "machine room" style: putty-beige window, bevelled buttons, blue title bar |
| Full screen | A toggle that hides the window chrome and runs the terminal edge to edge |
| Saving | Home folder autosaves; "Save machine" stores full snapshots on demand |
| Approach | Alpine built in CI and resumed from a prebuilt snapshot (not a fresh boot each visit, not Buildroot) |
| Stack | Vite + TypeScript + xterm.js, no UI framework |
| Old WebOS repo | Rebuilt separately as RetroMuseum |

## 3. Architecture

One repo with two parts:

```
LinuxWeb/
├── image/                  # The Linux build (runs in GitHub Actions)
│   ├── Dockerfile          # Alpine 3.21 i386 + tools + LinuxWeb helper
│   ├── rootfs/             # Files copied into the image (helper, help, motd)
│   ├── tools/              # fs2json.py, copy-to-sha256.py from v86 @ d96be77
│   ├── build-state.mjs     # Boots the image in Node and saves the snapshot
│   └── test-image.mjs      # Resumes the snapshot in Node and runs checks
├── public/
│   └── bios/               # seabios.bin, vgabios.bin from v86 @ d96be77 (committed)
├── src/                    # The web page
│   ├── main.ts
│   ├── emulator.ts         # Resume v86, wire serial console <-> terminal
│   ├── terminal.ts         # xterm.js, fit to window, report size to guest
│   ├── home.ts             # Home folder autosave and restore
│   ├── saves.ts            # Save machine: create, list, restore, delete
│   ├── storage.ts          # Small IndexedDB wrapper
│   └── ui/                 # Window, toolbar, dialogs, touch keys, theme.css
├── e2e/                    # Playwright end-to-end test
└── .github/workflows/      # image.yml, ci.yml, deploy.yml
```

### The image

- **Base:** `i386/alpine:3.21` with the `linux-virt` kernel, OpenRC, and an initramfs that includes the `virtio` and `9p` modules, following v86's `tools/docker/alpine` Dockerfile.
- **Login:** root is logged in automatically on the serial console (`ttyS0`).
- **Preinstalled tools:** `nano`, `vim`, `python3`, `git`, `mandoc` with `man-pages`, `tree`, `htop`.
- **Root filesystem:** served over v86's 9P filesystem, so files download only when Linux reads them.
- **Memory:** 256 MB.
- **Files added by us:**
  - `/usr/local/bin/linuxweb-helper`, started as an OpenRC service (sections 4 and 5).
  - `/usr/local/bin/help`, a short tour (section 4).
  - `/.linuxweb/`, the folder the page and the helper use to exchange files.

### The build pipeline (`image.yml`)

1. Build the container with `docker build --platform linux/386`. GitHub's x86-64 runners run 32-bit containers natively.
2. Export the root filesystem and convert it with `fs2json.py --zstd` and `copy-to-sha256.py --zstd`. Both are committed in `image/tools/`, copied from v86 at commit `d96be77`, the commit behind npm `v86@0.5.458`. Python needs the `zstandard` package.
3. Boot the result in Node using `build/libv86.mjs` from the npm `v86` package. Wait for `localhost:~# ` on the serial console, run `sync; echo 3 > /proc/sys/vm/drop_caches`, wait 10 seconds, save the state, and compress it with zstd.
4. Run `test-image.mjs` (section 8).
5. Record the installed package list (`apk list --installed`) as `packages.txt`.
6. Outputs: `fs.json`, the content-addressed file tree, `state.bin.zst`, and `packages.txt`. They are cached with `actions/cache`, keyed on a hash of `image/**`, so the image is rebuilt only when `image/` changes.

### The page

- Served from `/LinuxWeb/`. The image files are published under `/LinuxWeb/image/`.
- The v86 runtime (`libv86.js`, `v86.wasm`) is copied from the npm `v86` package into the build output. The BIOS files come from the committed `public/bios/`.
- No screen is shown for the emulated VGA card. The only display is the xterm.js terminal on the serial console.

## 4. Boot and terminal experience

### Opening the page

1. The beige window appears at once with "Starting Linux…" and a progress bar showing megabytes of the snapshot downloaded, driven by v86's `download-progress` event. Return visits are fast because the browser caches the snapshot.
2. v86 resumes the snapshot. Anything sent before v86 fires `emulator-loaded` is discarded by the restore (a lesson from the old WebOS repo), so all post-resume actions wait for that event.
3. After `emulator-loaded`, the page:
   - writes the welcome text into the terminal itself, because a resumed machine has no screen history;
   - sends a newline over the serial console so Linux prints a fresh prompt;
   - restores the home folder if one is saved (section 5).

Welcome text on a first visit:

```
Welcome to LinuxWeb: Alpine Linux, running in your browser.
Files in /root are saved in this browser automatically.
New here? Type help for a two-minute tour.
```

On a return visit with a restored home folder, the last two lines are replaced by one line: `Welcome back. Restored 12 files in your home folder.` (with the real count).

### The window

- Title bar: "LinuxWeb: Alpine Linux 3.21".
- Toolbar: **Save machine**, **Saves**, **Reset**, **Full screen**, **Help**.
- Status text at the right of the toolbar: "Home folder saved 2s ago", "Saving…", or a warning (section 7).
- **Full screen** uses the browser Fullscreen API. The window chrome is hidden and the terminal fills the screen. A small floating button, or Esc, exits.

### The terminal

- xterm.js with its fit addon, a monospace font, scrollback, and copy and paste (Ctrl+Shift+C / Ctrl+Shift+V and right-click).
- **Size sync:** when the terminal resizes, the page writes `rows cols` to `/.linuxweb/size` through v86's `create_file`. The helper notices the change and runs `stty -F /dev/ttyS0 rows R cols C`, which updates the running shell and full-screen programs such as `nano`, `vim`, and `htop`.
- **Touch devices only:** one slim row of keys phones lack: Esc, Tab, a Ctrl toggle, and the four arrows.

### Help

- `help` inside Linux prints a short tour: moving around (`ls`, `cd`, `pwd`), editing a file with `nano`, running `python3`, and where files are saved (only `/root` persists).
- The Help button shows the same text in a small beige dialog.

## 5. Saving the home folder

### Guest side (`linuxweb-helper`)

Every 2 seconds the helper:

1. Checks whether anything under `/root` changed since the last bundle, by comparing a listing of names, sizes, and modification times.
2. If it changed: `tar -czf /.linuxweb/home.tar.gz.tmp -C /root .`, renames it to `home.tar.gz`, and increments the number in `/.linuxweb/home.version`.
3. If `/.linuxweb/restore.tar.gz` exists: extracts it into `/root`, writes the number of restored files to `/.linuxweb/restored`, and deletes the archive.
4. If `/.linuxweb/size` changed: applies it with `stty` (section 4).

Nothing is typed into or printed on the user's terminal.

### Page side (`home.ts`)

- Every 2 seconds, read `/.linuxweb/home.version` with v86's `read_file`. When it changes, read `home.tar.gz` and store it in IndexedDB as a single record: the archive, its size, and the time saved.
- On visit, after `emulator-loaded`: if a record exists, write it to `/.linuxweb/restore.tar.gz` with `create_file`, then wait for `/.linuxweb/restored` to show the file count in the welcome text.
- On the first successful save, call `navigator.storage.persist()` so the browser keeps the data when disk space runs low.

### Rules

- Only `/root` is saved. System changes (installed packages, edits in `/etc`) reset on the next visit, and the help tour says so.
- **Two tabs:** only the tab holding the Web Lock `linuxweb-save` autosaves or restores. Other tabs show "Saving paused: LinuxWeb is open in another tab."
- **Size cap:** if `home.tar.gz` exceeds 50 MB, autosave pauses with a warning (section 7).

## 6. Saving the whole machine

- **Save machine** calls v86's `save_state()` (about 256 MB raw), compresses it in the browser with `CompressionStream("gzip")`, and stores it in IndexedDB with an id, a name (default: date and time), the creation time, and the compressed size.
- The **Saves** dialog lists up to 5 saves. Each has **Restore**, **Rename**, **Delete** (with confirmation), and **Download** (the compressed file, for keeping a copy).
- **Restore** decompresses the save and calls `restore_state()`. The dialog warns first: "This replaces your current home folder with the one in this save." After restore, home-folder autosave continues from the restored `/root`.
- **Reset** reloads the original snapshot and asks whether to keep the home folder. Keeping it is the default; if kept, it is restored as on a normal visit.
- At 5 saves, **Save machine** asks the user to delete one first.

## 7. Errors and edge cases

| Situation | What the user sees |
| --- | --- |
| Snapshot or image download fails | Dialog: "Couldn't download Linux. Check your connection." with **Retry** |
| No WebAssembly support | Plain page message explaining LinuxWeb can't run in this browser |
| IndexedDB unavailable (e.g. private browsing) | Status: "Saving is off in this browser". Everything else works |
| Home folder over 50 MB compressed | Status: "Home folder too big to save (over 50 MB)". Autosave pauses until it shrinks |
| Not enough browser storage for a machine save | Dialog: "Not enough browser storage for this save (needs about N MB). Delete an older save." N is the compressed size |
| A stored save can't be decompressed or restored | Dialog: "This save can't be read" with **Delete** |
| LinuxWeb open in a second tab | Status in that tab: "Saving paused: LinuxWeb is open in another tab" |

## 8. Build, deploy, and testing

### Workflows

- **`image.yml`**: a reusable workflow (`workflow_call`) that also runs on demand (`workflow_dispatch`). It performs the pipeline in section 3, restores from or saves to the cache, and fails if `test-image.mjs` fails.
- **`ci.yml`**: runs on every pull request. One job named "Lint, test, and build": lint, type check, unit tests, build, and the Playwright test. When `image/**` changed, it calls `image.yml` first so the tests use the new image.
- **`deploy.yml`**: runs on merge to `main`. Calls `image.yml` (a cache hit when `image/` is unchanged), builds the page, places the image under `dist/image/`, fails if `dist/` exceeds 900 MB, and publishes to GitHub Pages.

### Tests

1. **Unit tests (Vitest)** with a fake emulator: home-folder version polling and storage, the size cap, the two-tab lock, the saves list (limit of 5, rename, delete), and error states.
2. **Image test (`test-image.mjs`, Node)** on the real image:
   - resume `state.bin.zst`;
   - over the serial console, confirm `help` prints the tour and `python3 -c 'print(2+2)'` prints `4`;
   - write `/root/probe.txt` and confirm `/.linuxweb/home.version` increments and `home.tar.gz` contains it;
   - write `/.linuxweb/restore.tar.gz` and confirm its files appear in `/root`.
3. **End-to-end test (Playwright, headless Chromium)** against a production build:
   - open the page and wait for the prompt;
   - type `echo hi > /root/note.txt`;
   - reload, wait for the prompt, type `cat /root/note.txt`, and expect `hi`.

### Repo setup

- MIT license. `THIRD_PARTY_NOTICES.md` covers v86 (BSD-2-Clause), SeaBIOS and VGABIOS (LGPL-3.0), and xterm.js (MIT). It also links `packages.txt` and Alpine's `aports` sources for v3.21, since the image redistributes Alpine packages under their own licenses (including GPL).
- Branch protection on `main`: pull requests required, the "Lint, test, and build" check required, admins included.
- Dependabot for npm and GitHub Actions.

## 9. Things to verify first

Each of these is an assumption the design relies on. The implementation plan should prove each one early, with a small throwaway test, before building on it.

1. A file the guest writes to the 9P root filesystem (mounted with `cache=loose`) is readable through `read_file` within a few seconds.
2. After resume, a newline sent over `serial0` produces a fresh prompt in xterm.js.
3. `stty -F /dev/ttyS0 rows R cols C` from the helper resizes the running shell and `nano`.
4. `save_state()` at 256 MB compresses to a size that fits comfortably in IndexedDB, and restores in a reasonable time.
5. The image's content-addressed file tree is under 300 MB, and the snapshot is tens of MB.
6. `python3`, `git`, and `vim` run acceptably in 256 MB of RAM under v86.

## 10. Done means

- The live site resumes to a prompt, and `help` works.
- A file created in `/root` survives a reload.
- Save machine, Restore, Rename, Delete, and Download work.
- Full screen works, and the page is usable at phone width.
- All three test layers pass in CI.
- The README has a banner, a screenshot, and clear notes on what is saved and what isn't.
