import type { AuroraThreePackageBundle } from './aurora-package.ts';

const DB_NAME = 'aurora-three-packages-v1';
const STORE_NAME = 'packages';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME, { keyPath: 'slug' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('failed to open IndexedDB'));
  });
}

export async function putThreePackageBundle(bundle: AuroraThreePackageBundle): Promise<void> {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({
        slug: bundle.manifest.slug,
        bundle,
        updatedAt: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('failed to store Three.js package'));
      tx.onabort = () => reject(tx.error ?? new Error('Three.js package transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function getThreePackageBundle(
  slug: string,
): Promise<AuroraThreePackageBundle | null> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(slug);
      request.onsuccess = () =>
        resolve((request.result?.bundle as AuroraThreePackageBundle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error('failed to read Three.js package'));
    });
  } finally {
    db.close();
  }
}
