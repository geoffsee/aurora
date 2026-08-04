import { describe, expect, test } from 'vitest';
import { dockerArchFromHost, dockerPlatform } from '../../cli/docker-platform';

describe('dockerArchFromHost', () => {
  test.each([
    { arch: 'arm64', dockerArch: 'arm64' },
    { arch: 'x64', dockerArch: 'amd64' },
  ] as const)('$arch → linux/$dockerArch', ({ arch, dockerArch }) => {
    expect(dockerArchFromHost(arch, {})).toBe(dockerArch);
    expect(dockerPlatform(dockerArch)).toBe(`linux/${dockerArch}`);
  });

  test('AURORA_DOCKER_ARCH overrides host arch', () => {
    expect(dockerArchFromHost('arm64', { AURORA_DOCKER_ARCH: 'amd64' })).toBe('amd64');
  });

  test('rejects bad override or unsupported arch', () => {
    expect(() => dockerArchFromHost('x64', { AURORA_DOCKER_ARCH: 'ppc64' })).toThrow(
      /AURORA_DOCKER_ARCH/,
    );
    expect(() => dockerArchFromHost('ia32', {})).toThrow(/unsupported host arch/);
  });
});
