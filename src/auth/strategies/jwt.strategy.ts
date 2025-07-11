import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Injectable } from '@nestjs/common';
import { EnvService } from '../../common/env-service/env.service';
import { JwtPayload } from '../../types/jwt-payload.type';
import { AuthService } from '../../auth/auth.service';
import { TokensService } from '../tokens.service';
import { ErrorsHandlerService } from '../../common/errors-handler-service/errors-handler.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly envService: EnvService,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
    private readonly errorsHandlerService: ErrorsHandlerService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: envService.getEnv('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const access_token = req.headers.authorization;
    if (!access_token) {
      return this.errorsHandlerService.handleTokenNotDefined();
    }
    const isBlacklisted = await this.tokensService.isBlacklisted(access_token);
    if (isBlacklisted) {
      return this.errorsHandlerService.handleTokenIsBlacklisted();
    }
    const userData = await this.authService.validateUserById(+payload.sub);
    return userData;
  }
}
