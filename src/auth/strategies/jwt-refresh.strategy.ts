import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, StrategyOptionsWithRequest } from 'passport-jwt';
import { ErrorsService } from '../../common/errors-service/errors.service';
import { AuthService } from '../../auth/auth.service';
import { EnvService } from '../../common/env-service/env.service';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { TokenType } from '../../common/types/token-type.type';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  private readonly extractor = ExtractJwt.fromAuthHeaderAsBearerToken();
  constructor(
    private readonly envService: EnvService,
    private readonly authService: AuthService,
    private readonly errorsService: ErrorsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: envService.get('JWT_REFRESH_SECRET'),
      algorithms: ['HS256'],
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
  }

  async validate(req: Request, payload: JwtPayload) {
    const refresh_token = this.extractor(req);
    const userId = +payload.sub;
    if (!refresh_token) {
      this.errorsService.tokenNotDefined(TokenType.REFRESH);
    } else {
      const user = await this.authService.validateUserByRefreshToken(
        userId,
        refresh_token,
      );
      if (user) {
        this.authService.isUserBlocked(user);
      }
      return user;
    }
  }
}
