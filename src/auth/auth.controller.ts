import { Controller, Post, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TokenPayloadDto } from './dto/token-payload.dto';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { User } from '../users/entities/user.entity';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.authService.register(createUserDto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Request() req: { user: Omit<User, 'password'> }) {
    return this.authService.login(req.user as User);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Request() req: { user: User }) {
    await this.authService.logout(req.user.id);
    return { message: 'Successfully logged out' };
  }

  @Post('refresh')
  async refresh(@Body() body: TokenPayloadDto) {
    return this.authService.refreshTokens(body.refreshToken);
  }
}
