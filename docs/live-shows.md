# Live shows

Aurora live shows publish synchronized renderer and audio-feature state, not pixels or audible
media. The audience transport is receive-only and remains separate from phone pairing and Console
control traffic.

## Worker setup and rollout

Create both R2 buckets named by `worker/wrangler.toml`, then deploy the Worker:

```bash
bunx wrangler r2 bucket create aurora-live-show-assets
bunx wrangler r2 bucket create aurora-live-show-assets-preview
bun run worker:deploy
```

`worker:deploy` builds the isolated viewer, uploads its content-addressed Bevy WASM runtime to R2,
and publishes the Worker/static assets. The WASM object is kept outside Cloudflare Static Assets
because it exceeds that service's 25 MiB per-file limit.

Wrangler applies the `ShowDirectory` Durable Object migration during deployment. Roll out in this
order: R2 buckets and migration, backward-compatible Worker, Pages directory/viewer assets, then
the Docker image and native CLI.

For Pages, set the repository variable `AURORA_LIVE_API_URL` to the deployed Worker origin. The
deploy workflow writes it into Console and `/shows/` without putting viewer grants in public URLs.

## Self-hosted HTTPS ingress

Cloudflare Tunnel is optional. Aurora needs a stable public HTTPS origin that forwards to its
read-only gateway on port 18080. Keep the Worker/Durable Objects/R2 deployment above, then export:

```bash
export AURORA_SHOW_INGRESS='external'
export AURORA_SHOW_PUBLIC_URL='https://show.example.com'
export AURORA_LIVE_API_URL='https://your-aurora-relay.workers.dev'
```

For native mode, the gateway listens on `http://127.0.0.1:18080` and the host interfaces. For
Docker, Aurora publishes it on loopback by default. A Caddy instance on the same host can terminate
public TLS with:

```caddyfile
show.example.com {
	reverse_proxy 127.0.0.1:18080
}
```

Point the hostname's DNS at that server and allow public ports 80/443. If Caddy is on a VPS joined
to the Aurora host over WireGuard, bind the Docker gateway to the Aurora host's WireGuard address:

```bash
export AURORA_SHOW_GATEWAY_BIND='10.20.0.2:18080'
```

Then proxy the VPS hostname to `http://10.20.0.2:18080`. Restrict that port in the host firewall to
the reverse proxy or WireGuard peer. Setting `AURORA_SHOW_GATEWAY_BIND=0.0.0.0:18080` also works,
but should not be used without an appropriate firewall.

The gateway exposes only the projector, renderer assets, read-only catalog data, and the
well-known verification proof. Console, `/ws`, Studio, mobile controls, debug routes, and write
endpoints are not routed. The Worker verifies the HTTPS origin without redirects before listing a
show.

`AURORA_LIVE_API_URL` defaults to Aurora's existing relay Worker. Without
`AURORA_SHOW_PUBLIC_URL`, normal local operation remains unchanged and only live-show publication
is disabled.

## Optional Cloudflare Tunnel ingress

Create a remotely managed, named Cloudflare Tunnel and configure its public hostname to use:

- Docker: `http://aurora-origin:18080`
- Native: `http://127.0.0.1:18080`

Then export:

```bash
export AURORA_SHOW_INGRESS='cloudflare'
export CLOUDFLARE_TUNNEL_TOKEN='…'
export AURORA_SHOW_PUBLIC_URL='https://show.example.com'
export AURORA_LIVE_API_URL='https://your-aurora-relay.workers.dev'
```

Aurora pins one checksum-verified `cloudflared` release for both native downloads and the Docker
sidecar. If `AURORA_SHOW_INGRESS` is omitted, Aurora selects Cloudflare when a tunnel token is
present and external ingress otherwise.

Cloudflare's named-tunnel and connector documentation is at
<https://developers.cloudflare.com/tunnel/setup/>.

## Manual release load gate

Create a dedicated open test show and obtain one viewer grant. Do not use an operator's active
show: the gate connects as its sole source. Run:

```bash
AURORA_LIVE_API_URL='https://your-worker.example' \
AURORA_LOAD_SHOW_ID='…' \
AURORA_LOAD_SOURCE_TOKEN='…' \
AURORA_LOAD_VIEWER_TOKEN='…' \
bun run load-gate:live-show
```

The default gate opens 1,000 viewer sockets, leaves one deliberately unconsumed, publishes 20
batches/second for 15 minutes, and fails unless at least 99% stay connected, at least 99.9% of
expected batches arrive in order, every monitored viewer receives an immediate snapshot, and the
slow viewer does not block fan-out. `AURORA_LOAD_VIEWERS` and `AURORA_LOAD_DURATION_MS` may be
lowered for a development smoke run; release sign-off uses the defaults.
