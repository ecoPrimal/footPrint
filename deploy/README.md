# footPrint Deployment — ironGate

## Phase 2 Status

This configuration targets **ironGate** (WireGuard `10.13.37.7`), the downstream host in the ecosystem 5-phase execution plan. Phase 2 deploys footPrint after the esotericWebb cell boot on ironGate.

**NUCLEUS dependency:** CAS routing via the Neural API requires all 13 primals to be running. If the membrane socket is unavailable, footPrint falls back to `NESTGATE_URL` (HTTP) or disables CAS proxy entirely.

## Quick Start

```bash
# On ironGate downstream host (10.13.37.7)
cd /opt/ecoPrimals/protists/footPrint
git pull
npm ci
npm run build
PORT=3000 MEMBRANE_SOCKET=/run/membrane/biomeos.sock node dist/server.js
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
| `MEMBRANE_SOCKET` | `/run/membrane/nestgate.sock` | No (UDS with riboCipher prefix for CAS) |
| `NESTGATE_URL` | — | No (HTTP fallback if socket unavailable; CAS disabled if both unset) |
| `NODE_ENV` | — | Optional |

**CAS routing order:** UDS with riboCipher [0xEC,0x01] (`MEMBRANE_SOCKET`) → HTTP (`NESTGATE_URL`) → disabled.

**BTSP note:** CAS data operations (`content.put`/`content.get`/`content.list`) require BTSP
authentication on the socket. `health.check` and `health.liveness` work without auth.
Full CAS write/read is pending either a local-trust exception from nestGate team or a
TypeScript BTSP client.

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
