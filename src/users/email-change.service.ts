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
    const newEmail = dto.new_email;
    if (currentEmail === newEmail) {
      this.errorsService.forbidden(ErrMsg.NEW_EMAIL_MATCH_USER_EMAIL);
    }
    if (currentUser.is_blocked) {
      this.errorsService.badRequest(ErrMsg.CURRENT_USER_BLOCKED);
    }
    this.mailService.validateNotServiceEmail(newEmail);
    const token = this.tokensService.generateVerificationToken();
    await this.tokensService.saveEmailChangeToken(token, userId, newEmail);
    const frontendUrl = this.envService.get('FRONTEND_URL');
    const link = `${frontendUrl}/confirm-email?token=${token}`;
    const subject = 'Confirm your new email';
    const text =
      `You requested to change your account email to ${newEmail}.\n` +
      `To confirm, follow the link (within ${this.emailChangeTokenExpiresIn} min): ${link}\n\nIf it wasn't you, ignore this message.`;
    const html =
      `<p>You requested to change your account email to ${newEmail}.</p>` +
      `<p>To confirm, click (within ${this.emailChangeTokenExpiresIn} min): <a href="${link}">${link}</a></p>` +
      `<p>If it wasn't you, ignore this message.</p>`;
    await this.mailService.send(newEmail, subject, text, html);
  }

  async confirm(currentUserId: number, dto: EmailChangeConfirmDto) {
    const data = await this.tokensService.getDataByEmailChangeToken(dto.token);
    if (
      !data ||
      typeof data.userId !== 'number' ||
      typeof data.new_email !== 'string'
    ) {
      return this.errorsService.invalidToken(null, TokenType.EMAIL_CHANGE);
    }
    this.mailService.validateNotServiceEmail(data.new_email);
    if (
      !data ||
      typeof data.userId !== 'number' ||
      typeof data.new_email !== 'string'
    ) {
      return this.errorsService.invalidToken(null, TokenType.EMAIL_CHANGE);
    }
    if (data.userId !== currentUserId) {
      throw new ForbiddenException(ErrMsg.TOKEN_NOT_ISSUED_FOR_CURRENT_USER);
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const user = await qr.manager.findOneOrFail(User, {
        where: { id: currentUserId },
        select: [ID, EMAIL, IS_BLOCKED],
      });
      if (user?.is_blocked) {
        this.errorsService.badRequest(ErrMsg.CURRENT_USER_BLOCKED);
      }
      user.email = data.new_email;
      await qr.manager.save(user);
      await qr.commitTransaction();
      await this.tokensService
        .deleteEmailChangeToken(dto.token)
        .catch(() => undefined);
      return this.authService.login(user.id);
    } catch (err) {
      await qr.rollbackTransaction();
      if (err instanceof HttpException) throw err;
      this.errorsService.userConflict(err);
      this.errorsService.default(err);
    } finally {
      await qr.release();
    }
  }
}
