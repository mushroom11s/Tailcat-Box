/** Keys already assigned to serve mappings or open chat rooms. */

export type OccupiedKeySource = {
  keyName?: string;
  mode?: string;
  id?: string;
};

/** Collect named keys used by chat rooms and/or port-serve mappings. */
export function occupiedKeyNames(input: {
  rooms?: Iterable<OccupiedKeySource | null | undefined>;
  mappings?: Iterable<OccupiedKeySource | null | undefined>;
  /** When editing a serve mapping, keep its own key selectable. */
  allowMappingId?: string;
}): Set<string> {
  const out = new Set<string>();
  if (input.rooms) {
    for (const room of input.rooms) {
      const name = room?.keyName?.trim();
      if (name) {
        out.add(name);
      }
    }
  }
  if (input.mappings) {
    for (const mapping of input.mappings) {
      if (!mapping || mapping.mode !== "serve") {
        continue;
      }
      if (input.allowMappingId && mapping.id === input.allowMappingId) {
        continue;
      }
      const name = mapping.keyName?.trim();
      if (name) {
        out.add(name);
      }
    }
  }
  return out;
}

export function filterAvailableKeys<T extends { name: string }>(
  keys: T[],
  occupied: Set<string>,
): T[] {
  return keys.filter((key) => !occupied.has(key.name));
}
