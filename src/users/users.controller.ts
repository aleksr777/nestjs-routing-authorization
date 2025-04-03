import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Patch(':id')
  async updateUser(
    @Param('id') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(+userId, updateUserDto);
  }

  @Delete(':id')
  async deleteUser(@Param('id') userId: string) {
    return this.usersService.removeUser(+userId);
  }

  @Get('all')
  async getAllUsers() {
    return this.usersService.findAllUsers();
  }

  @Get(':id')
  async getUserById(@Param('id') userId: string) {
    return this.usersService.findUserById(+userId);
  }

  @Get('nickname/:nickname')
  async getUserByNickname(@Param('nickname') nickname: string) {
    return this.usersService.findUserByNickname(nickname);
  }
}
