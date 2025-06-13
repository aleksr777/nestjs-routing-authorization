export function stripBearerPrefix(
  token: string | undefined | null,
): string | null {
  if (!token || typeof token !== 'string') return null;
  return token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();
}
