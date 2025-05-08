import {
  Controller,
  Post,
  Body,
  Req,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { User } from '../users/entities/user.entity';

// Для access-стратегии (JwtAuthGuard) PassportStrategy возвращает вам User-объект
interface JwtRequest extends Request {
  user: { id: number; email: string };
}

// Для LocalStrategy (LocalAuthGuard) PassportStrategy возвращает объект с id
interface LoginRequest extends Request {
  user: User;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // Регистрация нового пользователя
  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  // Логин по email+password через LocalStrategy
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: LoginRequest) {
    return this.authService.login(req.user);
  }

  // Logout — только по access-токену
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: JwtRequest) {
    // req.user.id теперь доступен без ошибок
    await this.authService.logout(req.user.id);
    return { message: 'Successfully logged out' };
  }

  // Refresh — только по refresh-токену
  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  async refreshTokens(@Headers('authorization') authHeader: string) {
    console.log(authHeader);
    return this.authService.refreshTokens(authHeader);
  }
}
