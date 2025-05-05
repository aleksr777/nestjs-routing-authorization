import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { TokenPayloadDto } from '../dto/token-payload.dto';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: false,
      ignoreExpiration: false,
      algorithms: ['HS256'],
    });
  }

  async validate(payload: TokenPayloadDto) {
    // Проверяем, что в токене действительно тип — Refresh
    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }
    // Дополнительная валидация — сверяем токен с тем, что хранится в БД
    const user = await this.authService.getUserIfRefreshTokenMatches(
      payload.sub,
      payload.refreshTokenHash,
    );
    if (!user) {
      throw new UnauthorizedException('Refresh token revoked');
    }
    return { userId: payload.sub, email: payload.email };
  }
}
