const CURRENT_STORAGE_PREFIX = "neoworker:";
const LEGACY_STORAGE_PREFIXES = [
  "novaready:",
  "cowork:",
  "cowork-os:",
  "quiverready:",
  "crewwork:",
] as const;

/** Copy pre-rebrand UI preferences forward without deleting the legacy keys. */
export function migrateLegacyBrandStorage(
  storage: Storage = window.localStorage,
): number {
  let migrated = 0;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) =>
      storage.key(index),
    ).filter((key): key is string => typeof key === "string");

    for (const key of keys) {
      const prefix = LEGACY_STORAGE_PREFIXES.find((candidate) =>
        key.startsWith(candidate),
      );
      if (!prefix) continue;
      const currentKey = `${CURRENT_STORAGE_PREFIX}${key.slice(prefix.length)}`;
      if (storage.getItem(currentKey) !== null) continue;
      const value = storage.getItem(key);
      if (value === null) continue;
      storage.setItem(currentKey, value);
      migrated += 1;
    }
  } catch {
    // localStorage may be unavailable in hardened or test environments.
  }
  return migrated;
}
