import { expect, type Page } from "@playwright/test";

/**
 * How many saves are on this device, read from the store itself.
 *
 * The heart flips to "Saved" the moment it is tapped and the write to
 * IndexedDB lands after it (`saved-store.ts`). A test that leaves for
 * /saved on the heart alone can get there first and read "Nothing saved
 * yet": once in a run, then green on retry. So the wait is on the write.
 *
 * Only a database the browser already lists is opened. Opening
 * `keyval-store` before idb-keyval has, with no version, would create it
 * without the `keyval` store that idb-keyval only makes on an upgrade, and
 * the app's own reads would then fail.
 */
export async function savesOnDevice(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const listed = (await indexedDB.databases?.()) ?? [];
    if (!listed.some((db) => db.name === "keyval-store")) return 0;
    const db = await new Promise<IDBDatabase | null>((resolve) => {
      const open = indexedDB.open("keyval-store");
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(null);
    });
    if (!db) return 0;
    try {
      if (!db.objectStoreNames.contains("keyval")) return 0;
      const value = await new Promise<unknown>((resolve) => {
        const read = db
          .transaction("keyval", "readonly")
          .objectStore("keyval")
          .get("yuvoy.saved.v2");
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => resolve(undefined);
      });
      return Array.isArray(value) ? value.length : 0;
    } finally {
      db.close();
    }
  });
}

/** Waits until the save just tapped is on the device, not only on the heart. */
export async function expectSaveStored(page: Page) {
  await expect.poll(() => savesOnDevice(page)).toBeGreaterThan(0);
}
