import { Injectable, ForbiddenException, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { TokensService } from '../auth/tokens.service';
import { AuthService } from '../auth/auth.service';
import { EmailChangeRequestDto } from './dto/email-change-request.dto';
import { EmailChangeConfirmDto } from './dto/email-change-confirm.dto';
import {
  ID,
  EMAIL,
  IS_BLOCKED,
} from '../common/constants/user-select-fields.constants';
import { ErrMsg } from '../common/errors-service/error-messages.type';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class EmailChangeService {
  private readonly emailChangeTokenExpiresIn: number;
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
    private readonly errorsService: ErrorsService,
    private readonly tokensService: TokensService,
    private readonly authService: AuthService,
  ) {
    this.emailChangeTokenExpiresIn =
      this.envService.get('EMAIL_CHANGE_TOKEN_EXPIRES_IN', 'number') / 60;
  }

  async request(userId: number, dto: EmailChangeRequestDto) {
    const user = await this.usersRepository
      .findOneOrFail({ where: { id: userId }, select: [ID, EMAIL, IS_BLOCKED] })
      .catch((err) => this.errorsService.userNotFound(err));
    const currentUser = user as User;
    const currentEmail = currentUser.email;
    const newEmail = dto.new_email.trim().toLowerCase();
    this.mailService.validateNotServiceEmail(newEmail);
    if (currentEmail === newEmail) {
      this.errorsService.forbidden(ErrMsg.NEW_EMAIL_MATCH_USER_EMAIL);
    }
    if (currentUser.is_blocked) {
      this.errorsService.badRequest(ErrMsg.CURRENT_USER_BLOCKED);
    }
    const existingUser = await this.usersRepository.findOne({
      where: { email: newEmail },
      select: [ID],
    });
    if (existingUser) {
      this.errorsService.conflict(ErrMsg.CONFLICT_USER_EXISTS);
    }
    const redisValue = { user_id: userId, new_email: newEmail };
    const code = await this.tokensService.getEmailChangeCode(redisValue);
    const text =
      `You requested to change your account email to ${newEmail}.\n` +
      `To confirm, use the code below (within ${this.emailChangeTokenExpiresIn} min): ${code}\n\nIf it wasn't you, ignore this message.`;
    const html = `
      <p>You requested to change your account email to ${newEmail}.</p>
      <p>To confirm, use the code below (within ${this.emailChangeTokenExpiresIn} min): 
      <p style="font-weight: bold; font-size: 30px;">${code}</p>
      <p style="font-weight: bold; font-size: 17px;">If you didn’t request this, you can safely ignore this email.</p>`;
    await this.mailService.send(newEmail, 'Confirm your new email', text, html);
  }

  async confirm(
    currentUserId: number,
    dto: EmailChangeConfirmDto,
    accessToken: string | undefined,
  ) {
    if (!accessToken) {
      this.errorsService.tokenNotDefined(TokenType.ACCESS);
    }
    const data = await this.tokensService.getDataByEmailChangeCode(dto.code);
    if (
      !data ||
      typeof data.user_id !== 'number' ||
      typeof data.new_email !== 'string'
    ) {
      this.errorsService.invalidToken(null, TokenType.EMAIL_CHANGE);
    }
    if (data.user_id !== currentUserId) {
      throw new ForbiddenException(ErrMsg.TOKEN_NOT_ISSUED_FOR_CURRENT_USER);
    }
    const newEmail = data.new_email.trim().toLowerCase();
    this.mailService.validateNotServiceEmail(newEmail);
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: currentUserId },
        select: [ID, EMAIL, IS_BLOCKED],
      });
      if (user.is_blocked) {
        this.errorsService.badRequest(ErrMsg.CURRENT_USER_BLOCKED);
      }
      if (user.email.trim().toLowerCase() === newEmail) {
        this.errorsService.forbidden(ErrMsg.NEW_EMAIL_MATCH_USER_EMAIL);
      }
      const isEmailTaken = await this.usersRepository.exists({
        where: { email: newEmail },
      });
      if (isEmailTaken) {
        this.errorsService.conflict(ErrMsg.CONFLICT_USER_EXISTS);
      }
      user.email = newEmail;
      await this.usersRepository.save(user);
      await this.tokensService
        .deleteEmailChangeCode(dto.code)
        .catch(() => undefined);
      await this.tokensService.removeRefreshToken(user.id);
      await this.tokensService.addJwtTokenToBlacklist(
        accessToken,
        TokenType.ACCESS,
      );
      return this.authService.login(user.id);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      this.errorsService.userNotFound(err);
      this.errorsService.userConflict(err, [EMAIL]);
      this.errorsService.default(err);
    }
  }
}
