# footPrint Deployment — ironGate

## Phase 2 Status

This configuration targets **ironGate** (WireGuard `10.13.37.7`), the downstream host in the ecosystem 5-phase execution plan. Phase 2 deploys footPrint after the esotericWebb cell boot on ironGate.

**CAS dependency:** nestGate must be running on the same gate. footPrint connects via TCP JSON-RPC (port 8080, local-trust — no BTSP required). If nestGate is unreachable, CAS operations are disabled and projects persist to local filesystem only.

## Quick Start

```bash
# On ironGate downstream host (10.13.37.7)
cd /opt/ecoPrimals/protists/footPrint
git pull
npm ci
npm run build
PORT=3002 NESTGATE_RPC_PORT=8080 node dist/server.js
```

## Verify

```bash
curl -s http://localhost:3002/api/health
# {"status":"ok","version":"2.0.0","uptime":5,...}

curl -s http://localhost:3002/api/projects
# []

curl -s http://localhost:3002/api/agent/status
# {"connected":false,"entityCount":0,...}
```

## systemd

```bash
sudo cp deploy/footprint.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now footprint
sudo journalctl -u footprint -f
```

The unit runs as `membrane` (needs read access to `/run/membrane/` for Neural API UDS routing).

## Caddy (golgi)

With subdomain routing (`footprint.primals.eco`), Caddy reverse-proxies everything
to the Express server on ironGate (`10.13.37.7:3002`). WebSocket paths (`/ws`, `/ws/bridge`)
use explicit upgrade headers. SPA fallback is handled server-side. Import
`deploy/caddy-footprint-api.snippet` into the Caddyfile.

## Environment

| Var | Default | Required |
|-----|---------|----------|
| `PORT` | `3000` | No (use `3002` on ironGate — 3000 reserved, 3001 = petalTongue) |
| `NESTGATE_RPC_PORT` | `8080` | No (TCP JSON-RPC to nestGate, same-gate local-trust) |
| `NESTGATE_RPC_URL` | — | No (explicit URL, e.g. `tcp://127.0.0.1:8080`) |
| `MEMBRANE_SOCKET` | — | No (UDS+riboCipher for biomeOS routing; requires BTSP for data ops) |
| `NODE_ENV` | — | Optional |

**CAS routing order:** TCP JSON-RPC (`NESTGATE_RPC_PORT`/`NESTGATE_RPC_URL`, local-trust, no BTSP) → UDS (`MEMBRANE_SOCKET`, requires BTSP) → disabled.

## Ports

| Port | Bind | Purpose |
|------|------|---------|
| 3002 | 0.0.0.0 (WG + LAN) | HTTP + WebSocket (Caddy terminates TLS) |

## WebSocket Paths

| Path | Purpose |
|------|---------|
| `/ws` | petalTongue JSON-RPC bridge |
| `/ws/bridge` | Agent JSON-RPC 2.0 bridge (`project.sync`, `project.command`, `agent.message`, `bridge.health`) |

## Directories

| Path | Auto-created | Persist |
|------|-------------|---------|
| `projects/` | Yes | **Yes** — user project data |
| `cache/` | Yes | No — proxy cache, safe to clear |
| `dist/client/` | From build | Read-only |
