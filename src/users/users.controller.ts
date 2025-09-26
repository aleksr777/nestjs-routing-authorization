import {
  Body,
  Post,
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
import { EmailChangeService } from './email-change.service';
import { PasswordChangeService } from './password-change.service';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import { EmailChangeConfirmDto } from './dto/email-change-confirm.dto';
import { PasswordChangeByTokenDto } from './dto/password-change.dto';
import { PasswordVerifyOldDto } from './dto/password-verify-old.dto';
import { UpdatePartialUserDataDto } from './dto/update-partial-user-data.dto';
import { User } from './entities/user.entity';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly emailChangeService: EmailChangeService,
    private readonly passwordChangeService: PasswordChangeService,
  ) {}

  @Get('me')
  async getCurrentProfile(@Req() req: Request) {
    const user = req.user as User;
    return this.usersService.getCurrentProfile(+user.id);
  }

  @Delete('me/delete')
  async deleteCurrentUser(@Req() req: Request) {
    const user = req.user as User;
    const access_token = req.headers.authorization;
    return this.usersService.deleteCurrentUser(+user.id, access_token);
  }

  @Patch('me/partial-data/update')
  async updatePartialUserData(
    @Body() dto: UpdatePartialUserDataDto,
    @Req() req: Request,
  ) {
    const user = req.user as User;
    return this.usersService.updatePartialUserData(+user.id, dto);
  }

  @Post('me/email/update/request')
  requestUpdateEmail(@Body() dto: EmailChangeRequestDto, @Req() req: Request) {
    const user = req.user as User;
    return this.emailChangeService.request(+user.id, dto);
  }

  @Post('me/email/update/confirm')
  confirmUpdateEmail(@Body() dto: EmailChangeConfirmDto, @Req() req: Request) {
    const user = req.user as User;
    return this.emailChangeService.confirm(+user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/password/verify-old')
  verifyOldPassword(@Body() dto: PasswordVerifyOldDto, @Req() req: Request) {
    const user = req.user as User;
    return this.passwordChangeService.issuePasswordChangeToken(
      +user.id,
      dto.old_password,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/password/change')
  changePasswordByToken(
    @Body() dto: PasswordChangeByTokenDto,
    @Req() req: Request,
  ) {
    const user = req.user as User;
    const access = req.headers.authorization;
    return this.passwordChangeService.changePasswordByToken(
      +user.id,
      dto.token,
      dto.new_password,
      access,
    );
  }
}
