import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, StrategyOptionsWithRequest } from 'passport-jwt';
import { ErrorsHandlerService } from '../../common/errors-handler-service/errors-handler.service';
import { AuthService } from '../../auth/auth.service';
import { EnvService } from '../../common/env-service/env.service';
import { JwtPayload } from '../../types/jwt-payload.type';
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
    private readonly errorsHandlerService: ErrorsHandlerService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: envService.getEnv('JWT_REFRESH_SECRET'),
      algorithms: ['HS256'],
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
  }

  async validate(req: Request, payload: JwtPayload) {
    const refresh_token = this.extractor(req);
    const userId = +payload.sub;
    if (!refresh_token) {
      return this.errorsHandlerService.handleTokenNotDefined();
    }
    const userData = await this.authService.validateUserByRefreshToken(
      userId,
      refresh_token,
    );
    return userData;
  }
}
