import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrMessages } from '../../common/types/error-messages.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(
    err: any,
    user: any,
    info: Error | undefined,
  ): TUser {
    if (err) throw err;
    if (
      info?.message === 'No auth token' ||
      info?.name === 'TokenExpiredError'
    ) {
      throw new UnauthorizedException(ErrMessages.ACCESS_TOKEN_NOT_DEFINED);
    }
    if (!user) {
      throw new UnauthorizedException(ErrMessages.INVALID_ACCESS_TOKEN);
    }
    return user as TUser;
  }
}
