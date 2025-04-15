import {
  Controller,
  Get,
  Body,
  Request,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../types/jwt-payload.type';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async updateUser(
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
    @Request() req: { user: JwtPayload },
  ) {
    const ownId = req.user.sub;
    return this.usersService.updateUser(+userId, ownId, updateUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteUser(
    @Param('id') userId: string,
    @Request() req: { user: JwtPayload },
  ) {
    const ownId = req.user.sub;
    return this.usersService.removeUser(+userId, ownId);
  }

  @Get('all')
  async getAllUsers() {
    return this.usersService.findAllUsers();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getUserById(@Param('id') userId: string) {
    return this.usersService.findUserById(+userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('nickname/:nickname')
  async getUserByNickname(@Param('nickname') nickname: string) {
    return this.usersService.findUserByNickname(nickname);
  }
}
