# footPrint Deployment — sporeGate

## Quick Start

```bash
# On sporeGate (or any gate with Node ≥20)
cd /opt/ecoPrimals/protists/footPrint
git pull
npm ci
npm run build
PORT=3000 node dist/server.js
```

## Verify

```bash
curl -s http://localhost:3000/api/health
# {"status":"ok","version":"2.0.0","uptime":5,...}

curl -s http://localhost:3000/api/projects
# []

curl -s http://localhost:3000/api/agent/status
# {"connected":false,"entityCount":0,...}
```

## systemd

```bash
sudo cp deploy/footprint.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now footprint
sudo journalctl -u footprint -f
```

## Caddy (golgi)

Import `deploy/caddy-footprint-api.snippet` into the `primals.eco {}` block,
**before** the static `/footprint/*` handler. Adjust IP if Express is not on
`10.13.37.2`.

## Ports

| Port | Bind | Purpose |
|------|------|---------|
| 3000 | localhost or WG IP | HTTP + WebSocket (Caddy terminates TLS) |

## Directories

| Path | Auto-created | Persist |
|------|-------------|---------|
| `projects/` | Yes | **Yes** — user project data |
| `cache/` | Yes | No — proxy cache, safe to clear |
| `dist/client/` | From build | Read-only (golgi serves its own copy) |

## Environment

| Var | Default | Required |
|-----|---------|----------|
| `PORT` | `3000` | No |
| `NODE_ENV` | — | Optional (no behavior change currently) |
