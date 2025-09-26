// admin/admin-transfer.service.ts
import { Injectable, HttpException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { ErrMsg } from '../common/errors-service/error-messages.type';
import { TokensService } from '../auth/tokens.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '../common/types/role.enum';
import { TokenType } from '../common/types/token-type.type';
import {
  ID,
  ROLE,
  EMAIL,
  NICKNAME,
  IS_BLOCKED,
} from '../common/constants/user-select-fields.constants';

@Injectable()
export class AdminTransferService {
  private readonly emailChangeExpiresIn: number;
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly errorsService: ErrorsService,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
    private readonly tokensService: TokensService,
    private readonly authService: AuthService,
  ) {
    this.emailChangeExpiresIn =
      this.envService.get('EMAIL_CHANGE_TOKEN_EXPIRES_IN', 'number') / 60;
  }

  async initiateTransfer(adminId: number, userId: number) {
    if (adminId === userId) {
      this.errorsService.forbidden(ErrMsg.ADMIN_CANNOT_TRANSFER_THEMSELVES);
    }
    let from;
    let to;
    try {
      from = await this.usersRepository.findOneOrFail({
        where: { id: adminId },
        select: [ID, EMAIL, NICKNAME, ROLE, IS_BLOCKED],
      });
    } catch (err) {
      return this.errorsService.userNotFound(err);
    }
    try {
      to = await this.usersRepository.findOneOrFail({
        where: { id: userId },
        select: [ID, EMAIL, NICKNAME, ROLE, IS_BLOCKED],
      });
    } catch (err) {
      return this.errorsService.userNotFound(err, ErrMsg.USER_NOT_FOUND);
    }
    if (to.is_blocked) {
      this.errorsService.badRequest(ErrMsg.TARGET_USER_BLOCKED);
    }
    if (from.role !== Role.ADMIN) {
      this.errorsService.badRequest(ErrMsg.ONLY_ADMINISTRATOR_TRANSFER);
    }
    if (to.role === Role.ADMIN) {
      this.errorsService.badRequest(ErrMsg.TARGET_USER_ALREADY_ADMINISTRATOR);
    }
    const token = this.tokensService.generateVerificationToken();
    await this.tokensService.saveTransferToken(token, from.id, to.id);
    const frontendUrl = this.envService.get('FRONTEND_URL');
    const link = `${frontendUrl}/confirm-admin?token=${token}`;
    const subject = 'Administrator rights invitation';
    const greet = to.nickname ? `Hello, ${to.nickname}!` : 'Hello!';
    const text =
      `${greet}\n\nYou have been invited to receive administrator rights.\n` +
      `To confirm, please follow the link (within ${this.emailChangeExpiresIn} min): ${link}\n\n` +
      `If you did not request this, ignore the message.`;
    const html =
      `<p>${greet}</p><p>You have been invited to receive administrator rights.</p>` +
      `<p>To confirm, please click the link (within ${this.emailChangeExpiresIn} min): <a href="${link}">${link}</a></p>` +
      `<p>If you did not request this, ignore the message.</p>`;
    await this.mailService.send(to.email, subject, text, html);
  }

  async confirmTransfer(token: string, currentUserId: number) {
    const data = await this.tokensService.getDataByTransferToken(token);
    if (
      !data ||
      typeof data.fromId !== 'number' ||
      typeof data.toId !== 'number'
    ) {
      return this.errorsService.invalidToken(null, TokenType.ADMIN_TRANSFER);
    }
    const { fromId, toId } = data;
    if (fromId === toId) {
      this.errorsService.badRequest(ErrMsg.ADMIN_CANNOT_TRANSFER_THEMSELVES);
    }
    if (currentUserId !== toId) {
      this.errorsService.forbidden(ErrMsg.TOKEN_NOT_ISSUED_FOR_CURRENT_USER);
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const from = await qr.manager.findOneOrFail(User, {
        where: { id: fromId },
        select: [ID, EMAIL, ROLE, IS_BLOCKED],
      });
      const to = await qr.manager.findOneOrFail(User, {
        where: { id: toId },
        select: [ID, EMAIL, ROLE, IS_BLOCKED],
      });
      if (to.is_blocked)
        this.errorsService.badRequest(ErrMsg.TARGET_USER_BLOCKED);
      if (from.role !== Role.ADMIN)
        this.errorsService.badRequest(ErrMsg.INITIATOR_IS_NO_ADMINISTRATOR);
      if (to.role === Role.ADMIN)
        this.errorsService.badRequest(ErrMsg.TARGET_USER_ALREADY_ADMINISTRATOR);
      await qr.manager.update(User, { id: fromId }, { role: Role.USER });
      await qr.manager.update(User, { id: toId }, { role: Role.ADMIN });
      await qr.commitTransaction();
      await this.tokensService.deleteTransferToken(token);
      const subj = 'Administrator rights have been transferred';
      this.mailService
        .send(
          from.email,
          subj,
          'Your administrator rights have been transferred to another user.',
        )
        .catch(() => undefined);
      this.mailService
        .send(to.email, subj, 'You have received administrator rights.')
        .catch(() => undefined);
      return this.authService.login(currentUserId);
    } catch (err) {
      await qr.rollbackTransaction();
      if (err instanceof HttpException) throw err;
      this.errorsService.badRequest(ErrMsg.TRANSFER_FAILED);
    } finally {
      await qr.release();
    }
  }
}
