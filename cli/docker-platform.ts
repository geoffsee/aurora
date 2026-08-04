/**
 * Map Node/Bun `os.arch()` → `docker build/run --platform`.
 *
 * BuildKit then sets `TARGETARCH` inside the Dockerfile automatically; no
 * separate `--build-arg` is required.
 */

export type DockerArch = 'amd64' | 'arm64';

const NODE_ARCH_TO_DOCKER: Record<string, DockerArch> = {
  x64: 'amd64',
  arm64: 'arm64',
};

/**
 * Resolve Docker arch from the host CPU.
 * Override with `AURORA_DOCKER_ARCH` (`amd64` | `arm64`).
 */
export function dockerArchFromHost(
  arch: string = process.arch,
  env: Record<string, string | undefined> = process.env,
): DockerArch {
  const override = env.AURORA_DOCKER_ARCH?.trim();
  if (override === 'amd64' || override === 'arm64') return override;
  if (override) {
    throw new Error(`AURORA_DOCKER_ARCH must be amd64 or arm64 (got ${JSON.stringify(override)})`);
  }
  const mapped = NODE_ARCH_TO_DOCKER[arch];
  if (!mapped) {
    throw new Error(
      `unsupported host arch for aurora Docker image: ${arch} ` +
        `(expected ${Object.keys(NODE_ARCH_TO_DOCKER).join(', ')})`,
    );
  }
  return mapped;
}

export function dockerPlatform(arch: DockerArch): string {
  return `linux/${arch}`;
}
