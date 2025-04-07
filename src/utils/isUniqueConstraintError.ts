import { QueryFailedError } from 'typeorm';

export function isUniqueConstraintError(
  error: unknown,
): error is QueryFailedError & { code: string } {
  return (
    error instanceof QueryFailedError &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}
