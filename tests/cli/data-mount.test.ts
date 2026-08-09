import { describe, expect, test } from 'vitest';
import {
  CONTAINER_DATA_DIR,
  DEFAULT_DATA_VOLUME,
  describeDataMount,
  dockerMountArgs,
  resolveDockerDataMount,
} from '../../cli/data-mount.ts';

const CWD = '/work/aurora';

describe('docker data mount', () => {
  test('defaults to the named volume so imports always have a home', () => {
    const mount = resolveDockerDataMount({ env: {}, cwd: CWD });
    expect(mount.kind).toBe('volume');
    expect(mount.source).toBe(DEFAULT_DATA_VOLUME);
    expect(mount.containerPath).toBe(CONTAINER_DATA_DIR);
    expect(mount.warning).toBeUndefined();
  });

  test('--data-dir binds a host directory, resolved absolute', () => {
    const mount = resolveDockerDataMount({ dataDir: './data-overlay', env: {}, cwd: CWD });
    expect(mount.kind).toBe('bind');
    expect(mount.source).toBe('/work/aurora/data-overlay');
  });

  test('AURORA_DATA_DIR binds when no flag was passed', () => {
    const mount = resolveDockerDataMount({ env: { AURORA_DATA_DIR: 'overlay' }, cwd: CWD });
    expect(mount.kind).toBe('bind');
    expect(mount.source).toBe('/work/aurora/overlay');
  });

  test('--data-dir wins over AURORA_DATA_DIR', () => {
    const mount = resolveDockerDataMount({
      dataDir: '/explicit',
      env: { AURORA_DATA_DIR: '/from-env' },
      cwd: CWD,
    });
    expect(mount.source).toBe('/explicit');
  });

  test('blank values fall through instead of mounting an empty path', () => {
    const mount = resolveDockerDataMount({
      dataDir: '   ',
      env: { AURORA_DATA_DIR: '' },
      cwd: CWD,
    });
    expect(mount.kind).toBe('volume');
    expect(mount.source).toBe(DEFAULT_DATA_VOLUME);
  });

  test('AURORA_DATA_VOLUME renames the volume', () => {
    const mount = resolveDockerDataMount({ env: { AURORA_DATA_VOLUME: 'show-night' }, cwd: CWD });
    expect(mount.kind).toBe('volume');
    expect(mount.source).toBe('show-night');
  });

  test('a volume name Docker would reject warns and falls back', () => {
    // Docker rejects leading punctuation and slashes; silently passing this on
    // would fail at `docker run` with a far less obvious message.
    const mount = resolveDockerDataMount({ env: { AURORA_DATA_VOLUME: '/nope/slash' }, cwd: CWD });
    expect(mount.source).toBe(DEFAULT_DATA_VOLUME);
    expect(mount.warning).toContain('AURORA_DATA_VOLUME');
  });

  test('both kinds render as one -v argument pair', () => {
    expect(dockerMountArgs(resolveDockerDataMount({ env: {}, cwd: CWD }))).toEqual([
      '-v',
      `${DEFAULT_DATA_VOLUME}:${CONTAINER_DATA_DIR}`,
    ]);
    expect(
      dockerMountArgs(resolveDockerDataMount({ dataDir: '/host/dir', env: {}, cwd: CWD })),
    ).toEqual(['-v', `/host/dir:${CONTAINER_DATA_DIR}`]);
  });

  test('the volume log tells the operator how to reset it', () => {
    const message = describeDataMount(resolveDockerDataMount({ env: {}, cwd: CWD }));
    expect(message).toContain(`docker volume rm ${DEFAULT_DATA_VOLUME}`);
  });
});
