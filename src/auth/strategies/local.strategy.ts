import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { LoginRateLimitService } from '../login-rate-limit.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly loginRateLimitService: LoginRateLimitService,
  ) {
    super({
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, email: string, password: string) {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    await this.loginRateLimitService.assertAllowed(email, ip);

    try {
      const user = await this.authService.validateUserByEmailAndPassword(
        email,
        password,
      );
      await this.loginRateLimitService.clearEmailFailures(email);
      return user;
    } catch (err: unknown) {
      await this.loginRateLimitService.registerFailure(email, ip);
      throw err;
    }
  }
}
