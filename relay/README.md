# LinuxWeb relay

A small [WISP](https://github.com/MercuryWorkshop/wisp-protocol) server that forwards LinuxWeb's outgoing TCP connections to the internet. It uses [`@mercuryworkshop/wisp-js`](https://github.com/MercuryWorkshop/wisp-js).

## Rules

- Every outgoing TCP port except email (25, 465, 587).
- No private or loopback addresses, and no UDP.
- Up to 100 open connections per browser tab.
- Only browsers on allowed origins can connect. This doesn't stop non-browser clients, so watch your bandwidth.
- Logs stay at warning level, so visitors' addresses and destinations aren't written to them.

## Settings

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Port to listen on |
| `ALLOWED_ORIGINS` | `https://hammadshakeelai.github.io,http://localhost:5173,http://localhost:4173` | Comma-separated browser origins; `*` allows any |
| `TRUSTED_PROXIES` | `127.0.0.1` | Proxy IPs whose `X-Forwarded-For` header is trusted |

## Run it

```bash
npm install
node server.ts
```

Or with Docker:

```bash
docker build -t linuxweb-relay .
docker run -p 8080:8080 linuxweb-relay
```

Put it behind HTTPS (most hosts do this for you) so browsers can use `wisps://`. It runs on any host that supports WebSockets, for example Fly.io, Render, Koyeb, or a small VPS with Caddy in front.

## Use it

- **For yourself:** open LinuxWeb, press **Network**, enter `wisps://your-relay.example.com/` (the trailing `/` matters), and press **Save and reload**.
- **For every visitor:** set the repository variable `RELAY_URL` to that address and run the Deploy workflow.
