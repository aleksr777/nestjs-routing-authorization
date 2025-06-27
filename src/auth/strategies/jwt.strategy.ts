import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../types/jwt-payload.type';
import { AuthService } from '../../auth/auth.service';
import { TokensService } from '../tokens.service';
import { Request } from 'express';
import { ErrMessages } from '../../constants/error-messages';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private configService: ConfigService,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const access_token = req.headers.authorization;
    if (!access_token) {
      throw new UnauthorizedException(ErrMessages.TOKEN_NOT_DEFINED);
    }
    const isBlacklisted = await this.tokensService.isBlacklisted(access_token);
    if (isBlacklisted) {
      throw new UnauthorizedException(ErrMessages.TOKEN_IS_BLACKLISTED);
    }
    const userData = await this.authService.validateUserById(+payload.sub);
    return userData;
  }
}
