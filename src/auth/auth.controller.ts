import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { RegistrationService } from './registration.service';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { RegistrationConfirmDto } from './dto/registration-confirm.dto';
import { RegistrationRequestDto } from './dto/registration-request.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { User } from '../users/entities/user.entity';
import { JwtTokens, AuthResponse } from '../common/types/jwt-tokens.type';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  private getRefreshCookieOptions(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/api/auth',
      ...(maxAge !== undefined ? { maxAge } : {}),
    };
  }

  private setRefreshCookie(res: Response, tokens: JwtTokens): void {
    const maxAge =
      typeof tokens.refresh_token_expires === 'number'
        ? Math.max(tokens.refresh_token_expires * 1000 - Date.now(), 0)
        : undefined;

    res.cookie(
      'refresh_token',
      tokens.refresh_token,
      this.getRefreshCookieOptions(maxAge),
    );
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie('refresh_token', this.getRefreshCookieOptions());
  }

  private getAuthResponse(tokens: JwtTokens): AuthResponse {
    return {
      access_token: tokens.access_token,
      access_token_expires: tokens.access_token_expires,
    };
  }

  private isJwtTokens(value: unknown): value is JwtTokens {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const tokens = value as Partial<Record<keyof JwtTokens, unknown>>;

    const isAccessTokenValid = typeof tokens.access_token === 'string';
    const isRefreshTokenValid = typeof tokens.refresh_token === 'string';

    const isAccessTokenExpiresValid =
      typeof tokens.access_token_expires === 'number' ||
      tokens.access_token_expires === null;

    const isRefreshTokenExpiresValid =
      typeof tokens.refresh_token_expires === 'number' ||
      tokens.refresh_token_expires === null;

    return (
      isAccessTokenValid &&
      isRefreshTokenValid &&
      isAccessTokenExpiresValid &&
      isRefreshTokenExpiresValid
    );
  }

  private handleAuthResult(res: Response, result: unknown) {
    if (!this.isJwtTokens(result)) {
      return result;
    }

    this.setRefreshCookie(res, result);

    return this.getAuthResponse(result);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as User;

    if (user.is_blocked) {
      this.clearRefreshCookie(res);
      return {
        blocked: true,
        blocked_reason: user.blocked_reason ?? null,
        contact_email: await this.authService.getAdministratorEmail(),
      };
    }

    const tokens = await this.authService.login(user.id);

    return this.handleAuthResult(res, tokens);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const user = req.user as User;
    const accessToken = req.headers.authorization;

    await this.authService.logout(+user.id, accessToken);

    this.clearRefreshCookie(res);

    return {
      message: 'Logged out successfully.',
    };
  }

  @UseGuards(RefreshTokenGuard)
  @Post('refresh-tokens')
  async refreshJwtTokens(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as User;
    const tokens = await this.authService.refreshJwtTokens(+user.id);

    return this.handleAuthResult(res, tokens);
  }

  @Post('registration/request')
  async requestRegistration(@Body() dto: RegistrationRequestDto) {
    return this.registrationService.request(dto.email, dto.password);
  }

  @Post('registration/confirm')
  async confirmRegistration(
    @Body() dto: RegistrationConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.registrationService.confirm(dto.code, dto.email);

    return this.handleAuthResult(res, result);
  }

  @Post('password-reset/request')
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return this.passwordResetService.request(dto.email);
  }

  @Post('password-reset/confirm')
  async resetPassword(
    @Body() dto: PasswordResetConfirmDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.passwordResetService.confirm(
      dto.code,
      dto.new_password,
      dto.email,
    );

    return this.handleAuthResult(res, result);
  }
}
