import { SAVE_LOCK_NAME } from "./protocol.ts";

// Resolves true if this tab now holds the save lock for as long as it stays open.
export function acquireSaveLock(locks: LockManager | undefined = globalThis.navigator?.locks): Promise<boolean> {
  if (!locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    void locks.request(SAVE_LOCK_NAME, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(false);
        return undefined;
      }
      resolve(true);
      return new Promise<void>(() => {});
    });
  });
}
