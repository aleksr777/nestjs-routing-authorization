import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt, StrategyOptionsWithRequest } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../../auth/auth.service';
import { JwtPayload } from '../../types/jwt-payload.type';
import { Request } from 'express';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  private readonly extractor = ExtractJwt.fromAuthHeaderAsBearerToken();
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const secret = configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not defined!');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
      passReqToCallback: true,
    } as StrategyOptionsWithRequest);
  }

  async validate(req: Request, payload: JwtPayload) {
    const refreshToken = this.extractor(req);
    if (!refreshToken) {
      throw new UnauthorizedException('refresh_token not found in request!');
    }
    const userData = await this.authService.validateByRefreshToken(
      +payload.sub,
      refreshToken,
    );
    return userData;
  }
}
