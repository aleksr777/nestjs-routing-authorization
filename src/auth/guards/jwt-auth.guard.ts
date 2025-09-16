import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ErrorsService } from '../../common/errors-service/errors.service';
import { TokenType } from '../../common/types/token-type.type';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly errorsService: ErrorsService) {
    super();
  }
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
      this.errorsService.tokenNotDefined(TokenType.ACCESS);
    }
    if (!user) {
      this.errorsService.invalidToken(null, TokenType.ACCESS);
    }
    return user as TUser;
  }
}
