import {
  Body,
  Controller,
  Get,
  Req,
  Query,
  Delete,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { User } from '../users/entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentProfile(@Req() req: Request) {
    const user = req.user as User;
    const userId = +user.id;
    return this.usersService.getCurrentProfile(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/delete')
  async removeCurrentUser(@Req() req: Request) {
    const user = req.user as User;
    const userId = +user.id;
    const access_token = req.headers.authorization;
    return this.usersService.removeCurrentUser(userId, access_token);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me/update')
  async updateCurrentUser(
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: Request,
  ) {
    const user = req.user as User;
    const userId = +user.id;
    return this.usersService.updateCurrentUser(userId, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getUsersQuery(@Query() query: GetUsersQueryDto) {
    return this.usersService.getUsersQuery(
      query.limit,
      query.offset,
      query.nickname,
    );
  }
}
