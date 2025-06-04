import { Patch, Post, Body, Req, UseGuards, Controller } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { User } from '../users/entities/user.entity';
import { UpdateUserDto } from '../users/dto/update-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() createUserDto: CreateUserDto,
    @Req() req: { user: User },
  ) {
    return this.authService.register(+req.user.id, createUserDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: { user: User }) {
    return this.authService.login(+req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: { user: User }) {
    return this.authService.logout(+req.user.id);
  }

  @UseGuards(RefreshTokenGuard)
  @Post('refresh')
  async refreshTokens(@Req() req: { user: User }) {
    return this.authService.refreshTokens(+req.user.id, req.user.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('update')
  async updateCurrentUser(
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: { user: User },
  ) {
    return this.authService.updateCurrentUser(+req.user.id, updateUserDto);
  }
}
