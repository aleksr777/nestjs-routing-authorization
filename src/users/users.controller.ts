import {
  Body,
  Post,
  Controller,
  Get,
  Req,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { EmailChangeService } from './email-change.service';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import { EmailChangeConfirmDto } from './dto/email-change-confirm.dto';
import { User } from './entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailChangeService: EmailChangeService,
  ) {}

  @Get('me')
  async getCurrentProfile(@Req() req: Request) {
    const user = req.user as User;
    return this.usersService.getCurrentProfile(+user.id);
  }

  @Delete('me/delete')
  async removeCurrentUser(@Req() req: Request) {
    const user = req.user as User;
    const access_token = req.headers.authorization;
    return this.usersService.removeCurrentUser(+user.id, access_token);
  }

  @Post('me/email/update/request')
  request(@Body() dto: EmailChangeRequestDto, @Req() req: Request) {
    const user = req.user as User;
    return this.emailChangeService.request(+user.id, dto);
  }

  @Post('me/email/update/confirm')
  confirm(@Body() dto: EmailChangeConfirmDto, @Req() req: Request) {
    const user = req.user as User;
    return this.emailChangeService.confirm(+user.id, dto);
  }
}
