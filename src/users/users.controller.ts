import {
  Controller,
  Get,
  Body,
  Request,
  Patch,
  Query,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../types/jwt-payload.type';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getCurrentProfile(@Request() req: { user: JwtPayload }) {
    const ownId = req.user.sub;
    return this.usersService.getCurrentProfile(ownId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateCurrentUser(
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: { user: JwtPayload },
  ) {
    const ownId = req.user.sub;
    return this.usersService.updateCurrentUser(ownId, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me')
  async removeCurrentUser(@Request() req: { user: JwtPayload }) {
    const ownId = req.user.sub;
    return this.usersService.removeCurrentUser(ownId);
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
