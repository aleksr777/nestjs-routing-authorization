import {
  Controller,
  Get,
  Body,
  Req,
  Patch,
  Query,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { User } from '../users/entities/user.entity';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentProfile(@Req() req: { user: User }) {
    return this.usersService.getCurrentProfile(+req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateCurrentUser(
    @Body() updateUserDto: UpdateUserDto,
    @Req() req: { user: User },
  ) {
    return this.usersService.updateCurrentUser(+req.user.id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async removeCurrentUser(@Req() req: { user: User }) {
    return this.usersService.removeCurrentUser(+req.user.id);
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
