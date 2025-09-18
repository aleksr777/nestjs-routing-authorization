import { Post, Body, Req, UseGuards, Controller } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { PasswordResetService } from './password-reset.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { RegistrationRequestDto } from './dto/registration-request.dto';
import { RegistrationConfirmDto } from './dto/registration-confirm.dto';
import { PasswordResetConfirmDto } from './dto/password-reset-confirm.dto';
import { PasswordResetRequestDto } from './dto/password-reset-request.dto';
import { User } from '../users/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly registrationService: RegistrationService,
    private readonly passwordResetService: PasswordResetService,
  ) {}

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: Request) {
    const user = req.user as User;
    return this.authService.login(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: Request) {
    const user = req.user as User;
    const access_token = req.headers.authorization;
    return this.authService.logout(+user.id, access_token);
  }

  @UseGuards(RefreshTokenGuard)
  @Post('refresh-tokens')
  async refreshJwtTokens(@Req() req: Request) {
    const user = req.user as User;
    return this.authService.refreshJwtTokens(+user.id);
  }
  @Post('registration/request')
  async requestRegistration(@Body() dto: RegistrationRequestDto) {
    return this.registrationService.request(dto.email, dto.password);
  }

  @Post('registration/confirm')
  async confirmRegistration(@Body() dto: RegistrationConfirmDto) {
    return this.registrationService.confirm(dto.token);
  }

  @Post('password-reset/request')
  async requestPasswordReset(@Body() dto: PasswordResetRequestDto) {
    return await this.passwordResetService.request(dto.email);
  }

  @Post('password-reset/confirm')
  resetPassword(@Body() dto: PasswordResetConfirmDto) {
    return this.passwordResetService.confirm(dto.token, dto.newPassword);
  }
}
