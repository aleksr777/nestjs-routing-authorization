import { UnauthorizedException } from '@nestjs/common';

export function verifyOwner(
  userId: number,
  ownId: number,
  errorMessage: string,
): void {
  if (ownId !== userId) {
    throw new UnauthorizedException(errorMessage);
  }
}
