#!/bin/sh
# Write deploy/Caddyfile with tls internal for localhost + host LAN IPs
# (AURORA_TLS_HOSTS from run-stack) + container IPs, then exec muxox.
set -eu

OUT=/app/deploy/Caddyfile
HOSTS="localhost 127.0.0.1"

append_hosts() {
	for ip in $1; do
		case "$ip" in
			""|127.*|::1) ;;
			*.*.*.*)
				case " $HOSTS " in
					*" $ip "*) ;;
					*) HOSTS="$HOSTS $ip" ;;
				esac
				;;
		esac
	done
}

# Host LAN IPs published by scripts/run-stack.ts (what browsers actually open).
if [ -n "${AURORA_TLS_HOSTS:-}" ]; then
	append_hosts "$(echo "$AURORA_TLS_HOSTS" | tr ',' ' ')"
fi

# Container addresses (useful for docker-exec curls).
IPS=$(hostname -I 2>/dev/null || true)
if [ -z "$IPS" ] && command -v ip >/dev/null 2>&1; then
	IPS=$(ip -4 -o addr show scope global 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | tr '\n' ' ')
fi
append_hosts "$IPS"

proj=""
ctrl=""
for h in $HOSTS; do
	if [ -n "$proj" ]; then
		proj="$proj, "
		ctrl="$ctrl, "
	fi
	proj="${proj}https://${h}:8443"
	ctrl="${ctrl}https://${h}:8444"
done

cat >"$OUT" <<EOF
{
	auto_https disable_redirects
	default_sni localhost
}

$proj {
	tls internal
	reverse_proxy 127.0.0.1:13000
}

$ctrl {
	tls internal
	# Visual-server APIs the Console needs same-origin (the bridge sends no CORS
	# headers, so reaching across to :8443 is blocked by the browser).
	# Keep in sync with CONTROLS_SITE_PROXIED_PATHS in cli/caddyfile.ts.
	handle /api/modes/* {
		reverse_proxy 127.0.0.1:13000
	}
	handle /api/packages/import {
		reverse_proxy 127.0.0.1:13000
	}
	handle {
		reverse_proxy 127.0.0.1:13001
	}
}

# Read-only public-ingress origin. A Cloudflare connector uses
# http://aurora-origin:18080; an external proxy reaches the published host port.
:18080 {
	@write not method GET HEAD
	respond @write "Method not allowed" 405
	handle /.well-known/aurora-live-show {
		reverse_proxy 127.0.0.1:13000
	}
	handle /api/modes/* {
		reverse_proxy 127.0.0.1:13000
	}
	handle /api/data/e/* {
		reverse_proxy 127.0.0.1:13000
	}
	handle /assets/* {
		reverse_proxy 127.0.0.1:13000
	}
	handle /dist/pkg/* {
		reverse_proxy 127.0.0.1:13000
	}
	handle /dist/projector-bridge.js {
		reverse_proxy 127.0.0.1:13000
	}
	handle /vendor/* {
		reverse_proxy 127.0.0.1:13000
	}
	handle /styles.css {
		reverse_proxy 127.0.0.1:13000
	}
	handle /index.html {
		reverse_proxy 127.0.0.1:13000
	}
	handle / {
		reverse_proxy 127.0.0.1:13000
	}
	respond "Not found" 404
}
EOF

echo "[entrypoint] Caddy TLS hosts:$HOSTS" >&2
exec muxox --port 18450 --config /app/deploy/muxox.toml
