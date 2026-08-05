import { describe, expect, test } from 'vitest';
import { normalizeRemoteModelAssetPath } from '../../shared/model-asset-path.ts';

describe('normalizeRemoteModelAssetPath', () => {
  test('accepts absolute HTTP(S) GLB and glTF URLs', () => {
    expect(normalizeRemoteModelAssetPath(' https://cdn.example.com/figure.glb ')).toBe(
      'https://cdn.example.com/figure.glb',
    );
    expect(normalizeRemoteModelAssetPath('http://localhost:8080/model.gltf?cache=123')).toBe(
      'http://localhost:8080/model.gltf?cache=123',
    );
  });

  test('accepts root-relative epoch pack asset paths', () => {
    expect(normalizeRemoteModelAssetPath('/api/data/e/3/decks/deck-a/figure/mesh.glb')).toBe(
      '/api/data/e/3/decks/deck-a/figure/mesh.glb',
    );
    expect(normalizeRemoteModelAssetPath('/api/data/e/1/decks/deck-b/figure/a.gltf?v=1')).toBe(
      '/api/data/e/1/decks/deck-b/figure/a.gltf?v=1',
    );
  });

  test('empty input clears the override', () => {
    expect(normalizeRemoteModelAssetPath('   ', 'https://old/model.glb')).toBe('');
  });

  test.each([
    'models/local.glb',
    'javascript:alert(1)',
    'https://user:secret@example.com/model.glb',
    'https://example.com/model.obj',
    'https://example.com/model.glb#Scene0',
    '/api/data/e/1/decks/deck-a/figure/../escape.glb',
    '/api/data/e/1/decks/deck-a/figure/mesh.obj',
  ])('rejects unsupported or unsafe path %s', (path) => {
    expect(normalizeRemoteModelAssetPath(path, 'https://old.example/model.glb')).toBe(
      'https://old.example/model.glb',
    );
  });
});
