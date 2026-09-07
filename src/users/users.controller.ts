import {
  Body,
  Post,
  Controller,
  Get,
  Req,
  Res,
  Delete,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  clearRefreshCookie,
  getAuthResponse,
  setRefreshCookie,
} from '../auth/auth-response.util';
import { UsersService } from './users.service';
import { EmailChangeService } from './email-change.service';
import { PasswordChangeService } from './password-change.service';
import { DeleteCurrentUserDto } from './dto/delete-current-user.dto';
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
  async deleteCurrentUser(
    @Body() dto: DeleteCurrentUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as User;
    await this.usersService.deleteCurrentUser(
      +user.id,
      dto.password,
      req.headers.authorization,
    );
    clearRefreshCookie(res);
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
  async confirmUpdateEmail(
    @Body() dto: EmailChangeConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as User;
    const tokens = await this.emailChangeService.confirm(
      +user.id,
      dto,
      req.headers.authorization,
    );
    if (!tokens) return tokens;
    setRefreshCookie(res, tokens);
    return getAuthResponse(tokens);
  }

  @Post('me/password/change/request')
  verifyOldPassword(@Body() dto: PasswordVerifyOldDto, @Req() req: Request) {
    const user = req.user as User;
    return this.passwordChangeService.request(+user.id, dto.old_password);
  }

  @Post('me/password/change/confirm')
  async changePasswordByToken(
    @Body() dto: PasswordChangeByTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as User;
    const tokens = await this.passwordChangeService.confirm(
      +user.id,
      dto.code,
      dto.new_password,
      req.headers.authorization,
    );
    if (!tokens) return tokens;
    setRefreshCookie(res, tokens);
    return getAuthResponse(tokens);
  }

  @Post('me/password/reset/request')
  requestCurrentUserPasswordReset(@Req() req: Request) {
    const user = req.user as User;
    return this.passwordChangeService.requestReset(+user.id);
  }

  @Post('me/password/reset/confirm')
  async confirmCurrentUserPasswordReset(
    @Body() dto: PasswordChangeByTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = req.user as User;
    const tokens = await this.passwordChangeService.confirmReset(
      +user.id,
      dto.code,
      dto.new_password,
      req.headers.authorization,
    );
    if (!tokens) return tokens;
    setRefreshCookie(res, tokens);
    return getAuthResponse(tokens);
  }
}
