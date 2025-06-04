export function applyDefinedFields<T extends Record<string, unknown>>(
  target: T,
  source: Partial<T>,
): void {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      target[key as keyof T] = value as T[keyof T];
    }
  }
}
