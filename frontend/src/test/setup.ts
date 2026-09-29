/** Node 26 exposes globalThis.localStorage as undefined without --localstorage-file,
 *  which shadows happy-dom's Storage. Always ensure a usable Storage is installed. */
function ensureLocalStorage(): void {
  const g = globalThis as typeof globalThis & { localStorage?: Storage };
  try {
    if (typeof g.localStorage?.getItem === "function") {
      return;
    }
  } catch {
    /* fall through */
  }
  const map = new Map<string, string>();
  const memory: Storage = {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
  try {
    Object.defineProperty(g, "localStorage", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: memory,
    });
  } catch {
    (g as { localStorage: Storage }).localStorage = memory;
  }
}

ensureLocalStorage();