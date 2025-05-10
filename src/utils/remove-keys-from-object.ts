export function removeKey<T extends object, K extends keyof T>(
  source: T,
  keyToRemove: K,
): Omit<T, K> {
  const result = { ...source } as Partial<T>;
  delete result[keyToRemove];
  return result as Omit<T, K>;
}

export function removeKeys<T extends object, K extends keyof T>(
  source: T,
  keysToRemove: readonly K[],
): Omit<T, K> {
  const result = { ...source } as Partial<T>;
  for (const key of keysToRemove) {
    delete result[key];
  }
  return result as Omit<T, K>;
}
