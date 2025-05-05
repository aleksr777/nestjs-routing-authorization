import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Headers,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { User } from '../users/entities/user.entity';

interface RequestWithUser extends Request {
  user: {
    userId: number;
    email: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Req() req: { user: Omit<User, 'password'> }) {
    return this.authService.login(req.user as User);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: RequestWithUser) {
    await this.authService.logout(req.user.id);
    return { message: 'Successfully logged out' };
  }

  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  async refreshTokens(@Headers('authorization') authHeader: string) {
    return this.authService.refreshTokens(authHeader);
  }
}
