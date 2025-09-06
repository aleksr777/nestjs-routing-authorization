import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { Injectable } from '@nestjs/common';
import { EnvService } from '../../common/env-service/env.service';
import { JwtPayload } from '../../common/types/jwt-payload.type';
import { TokenType } from '../../common/types/token-type.type';
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
      this.errorsHandlerService.tokenNotDefined(TokenType.ACCESS);
    } else {
      await this.tokensService.isJwtTokenBlacklisted(access_token);
      const user = await this.authService.validateUserById(+payload.sub);
      if (user) {
        this.authService.isUserBlocked(user);
      }
      return user;
    }
  }
}
