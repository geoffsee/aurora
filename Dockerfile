# syntax=docker/dockerfile:1.7
# ghcr.io/geoffsee/aurora:latest — Bun bridge + Caddy + muxox (single process tree).
# Muxox linux gnu binaries need GLIBC ≥ 2.39 — use Ubuntu 24.04 for the runtime
# (bookworm/Bun-debian is too old).
#
# Arch comes from `docker build --platform` (BuildKit sets TARGETARCH):
#   docker build --platform linux/arm64 .
#   docker build --platform linux/amd64 .

ARG WASM_BINDGEN_VERSION=0.2.122
ARG MUXOX_VERSION=1.7.4

# ---------------------------------------------------------------------------
# Build wasm + controls (mirrors CI / bun run build:web + build:controls)
# ---------------------------------------------------------------------------
FROM rust:1-bookworm AS build
ARG WASM_BINDGEN_VERSION
WORKDIR /app

RUN rustup target add wasm32-unknown-unknown \
	&& cargo install wasm-bindgen-cli --version "${WASM_BINDGEN_VERSION}" --locked

COPY --from=oven/bun:1.2.19-debian /usr/local/bin/bun /usr/local/bin/bun

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

COPY Cargo.toml Cargo.lock rust-toolchain.toml ./
COPY src ./src
COPY plugins ./plugins
COPY assets/shaders ./assets/shaders
COPY shaders ./shaders
COPY models ./models
COPY shared ./shared
COPY scripts ./scripts
COPY web ./web
COPY bridge ./bridge
COPY .cargo ./.cargo

RUN --mount=type=cache,target=/usr/local/cargo/registry \
	--mount=type=cache,target=/usr/local/cargo/git \
	--mount=type=cache,target=/app/target \
	--mount=type=cache,target=/root/.bun/install/cache \
	bun run build:web \
	&& bun run build:controls \
	&& bun run scripts/stage-web-models.ts

# ---------------------------------------------------------------------------
# Runtime (Ubuntu 24.04 = glibc new enough for prebuilt muxox)
# ---------------------------------------------------------------------------
FROM ubuntu:24.04 AS runtime
ARG TARGETARCH
ARG MUXOX_VERSION
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl socat unzip \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=oven/bun:1.2.19-debian /usr/local/bin/bun /usr/local/bin/bun
COPY --from=caddy:2.10.0-alpine /usr/bin/caddy /usr/bin/caddy

# TARGETARCH is set by BuildKit from `docker build --platform` (amd64|arm64).
RUN case "${TARGETARCH}" in \
		amd64) muxox_target=x86_64-unknown-linux-gnu ;; \
		arm64) muxox_target=aarch64-unknown-linux-gnu ;; \
		*) echo "unsupported TARGETARCH=${TARGETARCH}" >&2; exit 1 ;; \
	esac \
	&& curl -fsSL \
		"https://github.com/geoffsee/muxox/releases/download/v${MUXOX_VERSION}/muxox-${muxox_target}.tar.gz" \
		| tar -xz -C /usr/local/bin \
	&& chmod +x /usr/local/bin/muxox \
	&& muxox --version \
	&& bun --version \
	&& caddy version

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
	bun install --frozen-lockfile

COPY --from=build /app/dist ./dist
COPY --from=build /app/web ./web
COPY --from=build /app/bridge ./bridge
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/assets/shaders ./assets/shaders
# Bundled deck preset catalog (read-only layer; override via AURORA_DATA_DIR)
COPY data ./data
COPY deploy ./deploy
RUN chmod +x /app/deploy/entrypoint.sh

ENV HOST=127.0.0.1 \
	PORT=13000 \
	CONTROLS_PORT=13001 \
	LIVE_HOST=host.docker.internal

EXPOSE 8443 8444 8450 11001/udp 12000/udp

ENTRYPOINT ["/app/deploy/entrypoint.sh"]
