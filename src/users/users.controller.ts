import {
  Body,
  Controller,
  Get,
  Req,
  Delete,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentProfile(@Req() req: Request) {
    const user = req.user as User;
    console.log(user.role);
    return this.usersService.getCurrentProfile(+user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/delete')
  async removeCurrentUser(@Req() req: Request) {
    const user = req.user as User;
    const access_token = req.headers.authorization;
    return this.usersService.removeCurrentUser(+user.id, access_token);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/update')
  async updateCurrentUser(@Body() dto: UpdateUserDto, @Req() req: Request) {
    const user = req.user as User;
    const userData = { ...dto };
    return this.usersService.updateCurrentUser(+user.id, userData);
  }
}
