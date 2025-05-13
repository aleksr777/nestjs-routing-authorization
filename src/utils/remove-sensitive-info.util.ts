export function removeSensitiveInfo<T extends object, K extends keyof T>(
  source: T,
  keysToRemove: readonly K[],
): Omit<T, K> {
  const result = { ...source } as Partial<T>;
  for (const key of keysToRemove) {
    delete result[key];
  }
  return result as Omit<T, K>;
}
