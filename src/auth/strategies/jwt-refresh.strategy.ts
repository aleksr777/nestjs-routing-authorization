import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { Request } from 'express';
import { AuthService } from '../auth.service';
import { EnvService } from '../../common/env-service/env.service';
import { ErrorsService } from '../../common/errors-service/errors.service';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { TokenType } from '../../common/types/token-type.type';

const REFRESH_COOKIE_NAME = 'refresh_token';

type RequestWithSafeCookies = Omit<Request, 'cookies'> & {
  cookies?: Record<string, unknown>;
};

const getRefreshTokenFromCookie = (req: Request): string | null => {
  const request = req as RequestWithSafeCookies;
  const token = request.cookies?.[REFRESH_COOKIE_NAME];

  return typeof token === 'string' ? token : null;
};

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly envService: EnvService,
    private readonly authService: AuthService,
    private readonly errorsService: ErrorsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([getRefreshTokenFromCookie]),
      ignoreExpiration: false,
      secretOrKey: envService.get('JWT_REFRESH_SECRET'),
      algorithms: ['HS256'],
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = getRefreshTokenFromCookie(req);
    const userId = +payload.sub;

    if (!refreshToken) {
      this.errorsService.tokenNotDefined(TokenType.REFRESH);
    }

    const user = await this.authService.validateUserByRefreshToken(
      userId,
      refreshToken,
    );

    if (user) {
      this.authService.isUserBlocked(user);
    }

    return user;
  }
}
