<p align="center"><a href="https://hammadshakeelai.github.io/LinuxWeb/"><img src="docs/banner.png" alt="LinuxWeb: real Alpine Linux in your browser tab" width="100%"></a></p>

**Try it:** https://hammadshakeelai.github.io/LinuxWeb/

LinuxWeb runs real Alpine Linux 3.21 in your browser with the [v86](https://github.com/copy/v86) emulator. Nothing to install, and nothing you do can touch your own computer.

<p align="center"><img src="docs/screenshot.png" alt="LinuxWeb showing the help tour in its terminal" width="100%"></p>

## What you get

- A real shell with `nano`, `vim`, `python3`, `git`, `man`, `tree`, and `htop`.
- Type `help` for a two-minute tour.
- **Full screen** hides the window so the terminal fills your screen.

## What is saved

- **Your home folder (`/root`) is saved in this browser automatically** and restored on your next visit.
- Installed packages and changes outside `/root` reset on your next visit.
- **Save machine** keeps everything, including open programs. You can keep up to 5 saves and download them.
- Saves live in this browser only. Clearing site data removes them.

## Not included

- No internet from inside Linux: most sites block browser requests without a proxy, so `apk add` can't work.

## Development

Requires Node 24. Building the Linux image also needs Docker, Python 3 with `zstandard`, and `zstd` (Linux or WSL).

```bash
npm install
npm run image        # build and test the Linux image into image/out (a few minutes)
npm run dev          # http://localhost:5173/LinuxWeb/
npm test             # unit tests
npm run build && npm run test:e2e
```

The design and the plan it was built from are in `docs/superpowers/`.

## License

MIT. See `THIRD_PARTY_NOTICES.md` for v86, SeaBIOS, xterm.js, and Alpine Linux packages.
