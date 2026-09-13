# LinuxWeb Network Edition: Design Spec

| | |
| --- | --- |
| **Status** | Approved design, awaiting spec review |
| **Date** | 2026-09-13 |
| **Repo** | `hammadshakeelai/LinuxWeb` |
| **Live site** | `https://hammadshakeelai.github.io/LinuxWeb/` |
| **Builds on** | `2026-09-13-linuxweb-design.md` (v1). This spec replaces v1's "no internet" non-goal and its 256 MB memory size. Everything else in v1 still applies. |

## 1. What it is

LinuxWeb v1 is a real Alpine Linux in a tab, but it has few tools and no network, so it feels like a demo. This edition makes it feel like an almost-full, network-capable Linux machine: a large preinstalled toolset, working `apk add`, `pip install`, `npm install`, `git clone`, `curl https://...` and `ssh`, and packages that come back on the next visit.

### Goals

- Preinstall a broad toolset (section 3) while keeping instant resume from a snapshot.
- Give Linux real outgoing TCP networking through a WISP relay whose address is one setting.
- Behave sensibly with no relay: say "Offline" clearly and explain how to go online.
- Remember packages a visitor installs and reinstall them on the next visit.
- Make familiar commands from other distros (`apt`, `apt-get`, `pacman`, `snap`) do something useful.
- Ship a relay server in the repo, ready to deploy on any host later.

### Non-goals

- Incoming connections to the VM, UDP other than DNS, and ICMP beyond the virtual router. v86's WISP client does not support them.
- Real `apt`, `pacman`, or snaps. They cannot manage Alpine packages, and snaps need systemd.
- Choosing or deploying a relay host. The site default relay stays empty until a later decision.
- A graphical desktop, other distros, or more than one VM.

## 2. Decisions made during brainstorming

| Topic | Decision |
| --- | --- |
| Relay | The relay address is a setting. The site default is empty for now; the page shows "Offline" until a relay is set. Visitors can also enter their own. |
| Persistence of installs | Remember installed package names with the home folder and reinstall them on the next visit once online (not whole-machine autosave). |
| Approach | A bigger Alpine 3.21 image with networking (not Debian, not install-on-demand only). |
| Memory | 512 MB. |
| User | Stay logged in as root. Install `sudo` so `sudo ...` commands work as written. |
| Other distros' tools | `apt`, `apt-get`, `pacman`, and `snap` are small commands that translate to `apk`. |
| Relay rules | Every outgoing TCP port except email (25, 465, 587); up to 100 open connections per tab; only browsers on allowed origins; no private or loopback addresses; no UDP. |
| Missing commands | bash suggests the package that provides a missing command, from an index built into the image. |

## 3. What visitors get

### The machine

- Alpine Linux 3.21 (32-bit), 512 MB RAM, resumed from a prebuilt snapshot.
- bash is root's shell, with tab completion.
- A virtio network card that comes up with DHCP when the page says the network is online.

### Preinstalled packages

These Alpine package names go into `image/Dockerfile`, in addition to v1's base packages:

| Group | Packages |
| --- | --- |
| Core | `bash` `bash-completion` `coreutils` `util-linux` `findutils` `gawk` `less` `file` `which` `tree` `htop` `btop` `ncdu` `lsof` `strace` `tmux` `man-pages` `mandoc` `fastfetch` `sudo` |
| Shells and editors | `zsh` `fish` `nano` `vim` `neovim` `micro` `mc` |
| Modern command line | `bat` `ripgrep` `fd` `fzf` `eza` |
| Network | `curl` `wget` `openssh-client-default` `git` `bind-tools` `iproute2` `iputils` `traceroute` `nmap` `netcat-openbsd` `whois` `w3m` |
| C, C++, and assembly | `build-base` (gcc, g++, make, binutils) `nasm` `gdb` `valgrind` `cmake` `meson` `ninja-build` |
| Languages and data | `python3` `py3-pip` `nodejs` `npm` `lua5.4` `sqlite` `jq` `postgresql17` |
| Archives | `zip` `unzip` `xz` |
| Fun | `cmatrix` `sl` `figlet` |

Measured against the Alpine 3.21 x86 package index on 2026-09-13, this is 227 packages and about 712 MB installed, which should be roughly 475 MB on the site.

### Online (a relay is set and reachable)

- `apk add`, `pip install`, `npm install`, `git clone`, `curl https://...`, and `ssh user@host` work.
- PostgreSQL, like any server started inside Linux, is reachable only from inside the VM.

### Offline (no relay, or the relay is unreachable)

- Everything that does not need the network works as in v1.
- `apk add`, `apk update`, `apk upgrade`, and `apk fetch` print: `LinuxWeb is offline: set a relay with the Network button to install packages.` and exit with status 1.

### Packages you install

- Added package names are kept in `/root/.config/linuxweb/packages`, which the v1 home-folder autosave already saves.
- On the next visit, once online, they are reinstalled automatically and the status line reports it.

### Commands from other distros

| You type | LinuxWeb runs |
| --- | --- |
| `apt install X` / `apt-get install X` | `apk add X` |
| `apt remove X` / `purge` / `autoremove X` | `apk del X` |
| `apt update` | `apk update` |
| `apt upgrade` / `full-upgrade` / `dist-upgrade` | `apk upgrade` |
| `apt search X` | `apk search X` |
| `apt show X` | `apk info -a X` |
| `apt list --installed` | `apk info` |
| `pacman -S X` | `apk add X` |
| `pacman -Sy` | `apk update` |
| `pacman -Syu` | `apk update && apk upgrade` |
| `pacman -R X` / `-Rs X` | `apk del X` |
| `pacman -Ss X` | `apk search X` |
| `pacman -Q` | `apk info` |
| `pacman -Qi X` | `apk info -a X` |
| `snap install X` | Prints `Snaps need systemd, which LinuxWeb doesn't have. Trying apk add X instead.` then `apk add X` |

- Each translated command first prints one line saying what it runs, for example `apt on LinuxWeb runs Alpine's package manager: apk add htop`.
- Common Debian names are mapped to Alpine names: `build-essential` to `build-base`, `python3-pip` to `py3-pip`, `openssh-client` to `openssh-client-default`, `neofetch` to `fastfetch`. Other names pass through unchanged.
- Any other subcommand prints which subcommands are supported and exits with status 1.

### Missing commands

Typing a command that is not installed prints, for example:

```
nyancat: command not found. Install it with: apk add nyancat
```

When offline, a second line adds: `(needs the network: set a relay with the Network button)`. Commands with no known package keep bash's normal message.

## 4. Architecture

```
Browser page                                   Linux (v86)
────────────                                   ───────────
network.ts  ── relay address, probe ──►  writes /.linuxweb/network ──►  linuxweb-helper
v86 net_device {virtio, relay_url}   ◄── TCP over WISP ──►  relay/ (wisp-js server)  ──► internet
home.ts / packages status  ◄── reads /.linuxweb/packages-status ◄──  linuxweb-helper
```

### The image (`image/Dockerfile`)

- Adds the packages in section 3.
- Sets root's shell to `/bin/bash`.
- Adds `/etc/network/interfaces` with `iface eth0 inet dhcp` and no `auto eth0`, so boot never waits for DHCP.
- Copies the image's `/etc/apk/world` to `/usr/local/share/linuxweb/base-world` after all packages are installed.
- Generates `/usr/local/share/linuxweb/commands.tsv` (`command<TAB>package`, one per line) from the `cmd:` provides in the Alpine 3.21 `main` and `community` indexes. When several packages provide a command, `main` wins, then the alphabetically first name.
- Adds to `image/rootfs/`:
  - `/usr/local/bin/apk`: the offline guard, which then runs `/sbin/apk "$@"`. `/usr/local/bin` comes before `/sbin` in Alpine's default `PATH`.
  - `/usr/local/bin/apt`, `apt-get`, `pacman`, `snap`: the translators in section 3.
  - `/etc/profile.d/linuxweb.sh` (read by bash login shells): `command_not_found_handle` using `commands.tsv`, the `help` alias, and the `localhost:~# ` prompt.
- The snapshot is built with `net_device: { type: "virtio" }` and no `relay_url`.
- Writes `image/out/version.txt`: the first 12 hex characters of the SHA-256 of `fs.json` followed by `state.bin.zst`. The page uses it to mark older machine saves.

### Exchange files (additions to v1's `/.linuxweb/` protocol)

| File | Written by | Contents |
| --- | --- | --- |
| `/.linuxweb/network` | Page | `online` or `offline` |
| `/.linuxweb/packages-status` | Helper | `<run> <state> <total> <failed>`, for example `3 installing 4 0` or `3 done 4 1`. `run` increases by 1 for each reinstall attempt. `state` is `installing` or `done`. |
| `/root/.config/linuxweb/packages` | Helper | Added package names, one per line, sorted |
| `/var/log/linuxweb-packages.log` | Helper | Output of each reinstall |

### Guest helper (`linuxweb-helper`, extended)

The v1 loop keeps running every 2 seconds. It adds:

1. **Waiting for the page.** Tracking and reinstalling do not start until `/.linuxweb/network` exists. The page writes that file only after the home-folder restore has finished or been skipped. This means an empty package list can never overwrite a saved one before the restore arrives.
2. **Going online.** When `network` changes to `online`, the helper runs `udhcpc -i eth0 -n -q`. If DHCP fails, it tries again on each later loop while `network` is still `online`.
3. **Reinstalling.** After DHCP succeeds the first time in this boot, the helper reads `/root/.config/linuxweb/packages`. It picks the names that `apk info -e` reports as not installed, and runs `/sbin/apk add` for them, appending output to the log. It writes `packages-status` as `installing` before and `done` after, with the count of names that failed. With nothing to reinstall, it writes no status.
4. **Tracking.** Once the reinstall step has finished for this boot (or there was no saved list), the helper computes `sort -u /etc/apk/world` minus `base-world` on every loop. When that differs from the saved list, it rewrites `/root/.config/linuxweb/packages`. A saved name that failed to reinstall stays in the list. The v1 home autosave then picks up the change.

While offline with a saved list that has not been reinstalled, the helper does not rewrite the list.

### The page

- **`src/vm-config.ts`:** `MEMORY_SIZE` becomes 512 MB. `vmOptions` takes an optional `relayUrl` and sets `net_device: { type: "virtio", relay_url }`, or `{ type: "virtio" }` without a relay.
- **`src/network.ts` (new):**
  - `relayUrl()` returns the visitor's saved address from `localStorage` key `linuxweb-relay`, or else `import.meta.env.VITE_RELAY_URL`, or else none.
  - `isValidRelayUrl(url)`: starts with `wisp://` or `wisps://`, parses as a URL, and ends with `/`.
  - `probeRelay(url, timeoutMs)` opens a WebSocket to the relay (with `wisp` replaced by `ws`) and resolves `online` if it opens within 5 seconds, else `unreachable`. It closes the test socket.
  - The page probes at start and every 60 seconds, and when the Network dialog opens. When the result changes, it updates the button and writes `/.linuxweb/network`: `online` for a reachable relay, `offline` otherwise.
- **`src/packages-status.ts` (new):** parses `packages-status` and turns a new `run` into status messages.
- **`src/main.ts`:** creates the emulator with the relay address, runs the home restore, then starts network probing, and polls `packages-status` alongside the home folder.
- **Machine saves:** `MachineRecord` gains an optional `imageVersion` set from `version.txt` at save time. A save whose `imageVersion` differs from the current one, or is missing, is "older". If `version.txt` cannot be loaded, saves are treated as current, and a failing restore shows v1's "This save can't be read" message.

### The relay server (`relay/`, new)

- `relay/server.ts`, run with Node 24, using `@mercuryworkshop/wisp-js` (LGPL-3.0, used unmodified as a library).
- `relay/package.json` and `relay/Dockerfile` (`node:24-alpine`) make it deployable on its own.
- `relay/README.md` explains deployment on Fly.io, Render, Koyeb, or a VPS behind TLS, and how to set the site default.
- An HTTP server answers `GET /` with `LinuxWeb relay` and hands WebSocket upgrades to `wisp.routeRequest`.
- **Settings (environment variables):**
  - `PORT`: default `8080`.
  - `ALLOWED_ORIGINS`: comma-separated. Default `https://hammadshakeelai.github.io,http://localhost:5173,http://localhost:4173`. `*` turns the check off; CI's Node image test uses it because Node sends no `Origin`.
  - `TRUSTED_PROXIES`: comma-separated IPs passed to `parse_real_ip_from`. Default `127.0.0.1`.
- **wisp-js options:** `port_blacklist: [25, 465, 587]`, `allow_udp_streams: false`, `stream_limit_total: 100`, `allow_private_ips: false`, `allow_loopback_ips: false`.
- An upgrade whose `Origin` is missing or not allowed gets `HTTP 403` and the socket is closed.
- Relay addresses must end in `/`. wisp-js treats other paths as a different protocol.

## 5. Screens and text

### Toolbar

A **Network** button sits before **Help**. Its label is `Network: Online`, `Network: Offline`, or `Network: Unreachable`.

### Network dialog

- Title `Network`.
- A status line, one of:
  - `Online through <address>`
  - `Offline: no relay is set`
  - `Can't reach that relay. Check the address or try again later.`
- A text field labelled `Relay address`, placeholder `wisps://relay.example.com/`.
- Buttons `Cancel`, `Clear`, and `Save and reload`.
  - An invalid address shows `Relay addresses start with wisp:// or wisps:// and end with /` and does not save.
  - Saving and clearing store the choice, wait for any in-progress home-folder save, then reload.
- The note: `Linux's internet traffic goes through this relay. HTTPS stays encrypted, but the relay sees which addresses and ports you connect to. DNS lookups go to Cloudflare.`

### Status line

- While a reinstall runs: `Reinstalling N packages…`
- When it finishes: `Reinstalled 1 package` or `Reinstalled N packages` for 5 seconds, or `Couldn't reinstall F of N packages. See /var/log/linuxweb-packages.log` for 10 seconds.
- Otherwise the v1 home-folder status shows. Package messages take priority while shown.

### Welcome text

On a first visit, one line is added after the v1 lines:

- `Network is online: try apk add, git clone, or curl.`
- `Network is offline: set a relay with the Network button to install software.`

Return visits add the same line after `Welcome back...`.

### Help tour

`help.txt` adds short sections: Networking (the Network button and what works), Installing software (`apk add` plus the apt/pacman translation and reinstall on next visit), C/C++ and assembly (a `gcc hello.c` and a `nasm` example), PostgreSQL (start it and connect with `psql`), and Fun (`cmatrix`, `sl`, `figlet`). It notes that compiling and database startup are slow in the browser.

### Saves dialog

Older saves show `(older LinuxWeb)` after the name and offer only **Download** and **Delete**.

### README

- Updates the tool list.
- Adds a Networking section: setting a relay, a link to `relay/README.md`, and the privacy note.
- "Not included" becomes: no incoming connections, no UDP other than DNS, no systemd or snaps.

## 6. Errors and edge cases

| Situation | Behavior |
| --- | --- |
| No relay set | Button shows Offline. The guest gets `offline`. `apk add` prints the offline message. |
| Relay unreachable at start | Button shows Unreachable. The guest gets `offline`. Probing retries every 60 seconds; when the relay answers, the guest gets `online` and brings the network up. |
| Relay drops mid-session | v86 reconnects by itself every 10 seconds. The next probe updates the button. Open connections inside Linux fail as they would on a real network. |
| Invalid relay address saved earlier | Treated as no relay; the dialog shows the address with the validation message. |
| A package fails to reinstall | Logged; the status line reports the count; the name stays in the list. |
| DHCP fails while online | Retried each helper loop; `apk add` then fails with apk's own network error. |
| Emulator can't allocate 512 MB | If creating the emulator throws a `RangeError` or an out-of-memory error, the page shows `This device doesn't have enough free memory to run LinuxWeb (it needs 512 MB).` instead of the retry dialog. |
| Machine save from the v1 image | Marked older: Download and Delete only. |
| Second tab (no save lock) | Networking works the same; its home folder and package list are not saved, as in v1. |

## 7. Build, deploy, and testing

### Workflows

- **`image.yml`:** builds the bigger image. `image/test-image.ts` keeps the v1 checks with updated limits and adds the no-network checks listed under Tests below.
- **`ci.yml`:**
  - "Lint, test, and build" (required) stays as it is, including the v1 reload end-to-end test.
  - A new job **"Network (uses the internet)"**, not required, needs the image job. It starts a local relay, runs `image/test-network.ts`, then runs the Playwright network test.
- **`deploy.yml`:** passes `VITE_RELAY_URL: ${{ vars.RELAY_URL }}` to the build. The repository variable stays unset until a relay host is chosen. The 900 MB site-size check stays.

### Tests

- **Unit (Vitest):**
  - `network.ts`: validation, saved address beats site default, and probe results with a fake WebSocket (open, error, timeout).
  - `packages-status.ts`: parsing, new-run detection, and messages.
  - Status-line priority.
  - Saves marked older by `imageVersion`.
  - `relay/`: the Origin check (allowed, not allowed, missing, `*`), and the port rules applied through wisp-js's filter (25, 465, 587 blocked; 22 and 443 allowed). No internet needed.
- **Image test (`image/test-image.ts`, no network):**
  - The v1 checks.
  - bash is the shell.
  - `apt install nyancat` prints the translation line, then the offline message.
  - `nyancat` (not preinstalled) prints `nyancat: command not found. Install it with: apk add nyancat`.
  - gcc compiles and runs `hello.c`; nasm assembles and links a hello world.
  - `valgrind true` exits 0; `initdb`, `pg_ctl start`, and `pg_ctl stop` succeed; `node -e 'console.log(42)'` prints 42.
  - A machine save gzips to under 80 MB; the file tree is under 850 MB.
- **Network test (`image/test-network.ts`, uses the internet):**
  - Starts `relay/server.ts` on a local port with `ALLOWED_ORIGINS=*`.
  - Resumes the snapshot with that relay and writes `online`.
  - `ip -4 addr show eth0` shows `192.168.86.100`.
  - `curl -sI https://dl-cdn.alpinelinux.org/alpine/` returns HTTP 200.
  - `apk add nyancat` succeeds and `nyancat` appears in `/root/.config/linuxweb/packages`.
  - A second emulator resumes the snapshot, gets that home folder restored through the v1 exchange, goes online, and reports `done 1 0` with `nyancat` installed.
- **End-to-end (`e2e/network.spec.ts`, uses the internet):**
  1. With a local relay running, open the Network dialog, enter its address, and save.
  2. After the reload, the button shows `Network: Online`, and `apk add nyancat` succeeds.
  3. Reload again; the status line shows `Reinstalled 1 package`.

## 8. Things to verify first

The first plan task checks these in CI before anything is built on them:

1. A snapshot built with a virtio card and no relay resumes in an emulator that has a `relay_url`, and DHCP then assigns `192.168.86.100`.
2. Through a local wisp-js relay, `curl https://...` and `apk add nyancat` work from Linux.
3. gcc, nasm, valgrind, PostgreSQL, and Node run in 512 MB.
4. A 512 MB machine save gzips to under 80 MB (measured: 60.5 MB after gcc, valgrind, node and PostgreSQL have run).
5. The built site stays under the 900 MB deploy check.

## 9. Risks

- **Relay abuse once deployed:** the Origin check does not stop non-browser clients. The port and connection limits reduce but do not prevent misuse. Choosing a host includes watching bandwidth and cost.
- **Speed:** compiling, valgrind, and PostgreSQL startup take seconds to tens of seconds under v86.
- **Phones:** 512 MB may not be available on low-memory phones; section 6 covers the message.
- **Status accuracy:** the Network button's probe can briefly disagree with v86's own relay connection, which reports no status.
- **Privacy:** DNS lookups go to Cloudflare (v86's default DNS-over-HTTPS server).
- **CI time:** the image build grows with the package count; the image cache limits it to image changes.

## 10. Done means

- CI passes: "Lint, test, and build", the image checks, and the "Network (uses the internet)" job.
- The live site, with no relay configured:
  - Resumes to a bash prompt; `help` shows the new sections.
  - The toolbar shows `Network: Offline`; `apk add nyancat` and `apt install nyancat` print the offline message.
  - `gcc`, `nasm`, `nvim`, `btop`, `psql --version`, `cmatrix`, and `figlet` run.
  - Typing `nyancat` prints the install hint.
  - Machine saves made on v1 show `(older LinuxWeb)`.
- With a relay address entered in the Network dialog (the local relay from `relay/README.md` is enough), `apk add`, `git clone`, and `curl https://...` work, and an installed package is reinstalled after a reload.
