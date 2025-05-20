export function applyDefinedFields<T>(target: T, source: Partial<T>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      (target as any)[key] = value;
    }
  }
}
