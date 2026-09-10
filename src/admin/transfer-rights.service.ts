import { Injectable, HttpException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { RedisService } from '../common/redis-service/redis.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { ErrMsg } from '../common/errors-service/error-messages.type';
import { TokensService } from '../auth/tokens.service';
import { Role } from '../common/types/role.enum';
import { TokenType } from '../common/types/token-type.type';
import {
  ID,
  ROLE,
  EMAIL,
  NICKNAME,
  PASSWORD,
  IS_BLOCKED,
} from '../common/constants/user-select-fields.constants';

const ADMIN_TRANSFER_PENDING_KEY = 'admin:transfer:pending';

type PendingAdminTransfer = {
  code: string;
  fromId: number;
  toId: number;
};

@Injectable()
export class AdminTransferService {
  private readonly transferExpiresIn: number;
  private readonly transferExpiresInMinutes: number;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly errorsService: ErrorsService,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
    private readonly redisService: RedisService,
    private readonly hashService: HashService,
    private readonly tokensService: TokensService,
  ) {
    this.transferExpiresIn = this.envService.get(
      'ADMIN_TRANSFER_TOKEN_EXPIRES_IN',
      'number',
    );
    this.transferExpiresInMinutes = this.transferExpiresIn / 60;
  }

  private async getPendingTransfer(): Promise<PendingAdminTransfer | null> {
    const raw = await this.redisService.get(ADMIN_TRANSFER_PENDING_KEY);
    if (!raw) return null;

    try {
      const data = JSON.parse(raw) as Partial<PendingAdminTransfer>;
      if (
        typeof data.code === 'string' &&
        typeof data.fromId === 'number' &&
        typeof data.toId === 'number'
      ) {
        return data as PendingAdminTransfer;
      }
    } catch {
      // Invalid lock data is treated as stale and removed below.
    }

    await this.redisService.del(ADMIN_TRANSFER_PENDING_KEY);
    return null;
  }

  private isSameTransfer(
    first: PendingAdminTransfer | null,
    second: PendingAdminTransfer,
  ): boolean {
    return (
      first?.code === second.code &&
      first.fromId === second.fromId &&
      first.toId === second.toId
    );
  }

  private async getActivePendingTransfer(): Promise<PendingAdminTransfer | null> {
    const pending = await this.getPendingTransfer();
    if (!pending) return null;

    const data = await this.tokensService.getDataByTransferToken(pending.code);
    if (!data || data.fromId !== pending.fromId || data.toId !== pending.toId) {
      await this.redisService.del(ADMIN_TRANSFER_PENDING_KEY);
      return null;
    }

    return pending;
  }

  private async reserveTransfer(
    code: string,
    fromId: number,
    toId: number,
  ): Promise<void> {
    const value = JSON.stringify({ code, fromId, toId });
    const result = await this.redisService.set(
      ADMIN_TRANSFER_PENDING_KEY,
      value,
      {
        EX: this.transferExpiresIn,
        NX: true,
      },
    );

    if (result !== 'OK') {
      await this.tokensService.deleteTransferToken(code).catch(() => undefined);
      this.errorsService.conflict(ErrMsg.ADMIN_TRANSFER_ALREADY_PENDING);
    }
  }

  private async releaseTransfer(code: string): Promise<void> {
    const pending = await this.getPendingTransfer();
    if (pending?.code === code) {
      await this.redisService.del(ADMIN_TRANSFER_PENDING_KEY);
    }
    await this.tokensService.deleteTransferToken(code);
  }

  async getTransferStatus() {
    const pending = await this.getActivePendingTransfer();
    return {
      pending: pending !== null,
      target_user_id: pending?.toId ?? null,
    };
  }

  async initiateTransfer(adminId: number, userId: number, password: string) {
    if (adminId === userId) {
      this.errorsService.forbidden(ErrMsg.ADMIN_CANNOT_TRANSFER_THEMSELVES);
    }

    let from: User;
    let to: User;

    try {
      from = await this.usersRepository.findOneOrFail({
        where: { id: adminId },
        select: [ID, EMAIL, NICKNAME, PASSWORD, ROLE, IS_BLOCKED],
      });
    } catch (err: unknown) {
      return this.errorsService.userNotFound(err);
    }

    if (from.role !== Role.ADMIN) {
      this.errorsService.badRequest(ErrMsg.ONLY_ADMINISTRATOR_TRANSFER);
    }

    const isPasswordValid = await this.hashService.compare(password, from.password);
    if (!isPasswordValid) {
      this.errorsService.badRequest(ErrMsg.CURRENT_PASSWORD_IS_INCORRECT);
    }

    try {
      to = await this.usersRepository.findOneOrFail({
        where: { id: userId },
        select: [ID, EMAIL, NICKNAME, ROLE, IS_BLOCKED],
      });
    } catch (err: unknown) {
      return this.errorsService.userNotFound(err, ErrMsg.USER_NOT_FOUND);
    }

    if (to.is_blocked) {
      this.errorsService.badRequest(ErrMsg.TARGET_USER_BLOCKED);
    }
    if (to.role === Role.ADMIN) {
      this.errorsService.badRequest(ErrMsg.TARGET_USER_ALREADY_ADMINISTRATOR);
    }

    const code = await this.tokensService.getTransferCode(from.id, to.id);
    await this.reserveTransfer(code, from.id, to.id);

    const frontendUrl = this.envService.get('FRONTEND_URL');
    const link = `${frontendUrl}/admin/transfer/confirm`;
    const subject = 'Administrator rights invitation';
    const greet = to.nickname ? `Hello, ${to.nickname}!` : 'Hello!';
    const text = `${greet}\n\nYou have been invited to receive administrator rights.\nTo confirm, follow the link within ${this.transferExpiresInMinutes} min and enter the code below together with your current account password: ${link}\n\n${code}\n\nIf you did not request this, ignore the message.`;
    const html = `
      <p>${greet}</p>
      <p>You have been invited to receive administrator rights.</p>
      <p>To confirm, follow the link within ${this.transferExpiresInMinutes} min and enter the code below together with your current account password: <a href="${link}">${link}</a></p>
      <p style="font-weight: bold; font-size: 30px;">${code}</p>
      <p>If you did not request this, ignore the message.</p>`;

    try {
      await this.mailService.send(to.email, subject, text, html);
    } catch (err: unknown) {
      await this.releaseTransfer(code).catch(() => undefined);
      this.errorsService.default(err);
    }

    return { message: 'Administrator rights invitation sent.' };
  }

  async cancelTransfer(adminId: number) {
    const pending = await this.getActivePendingTransfer();
    if (!pending) {
      this.errorsService.conflict(ErrMsg.ADMIN_TRANSFER_NOT_PENDING);
    }
    if (pending.fromId !== adminId) {
      this.errorsService.forbidden(ErrMsg.ONLY_TRANSFER_INITIATOR_CAN_CANCEL);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const from = await qr.manager.findOneOrFail(User, {
        where: { id: pending.fromId },
        select: [ID, ROLE],
        lock: { mode: 'pessimistic_write' },
      });

      if (from.role !== Role.ADMIN) {
        this.errorsService.conflict(ErrMsg.ADMIN_TRANSFER_CANNOT_CANCEL);
      }

      const currentPending = await this.getActivePendingTransfer();
      if (!this.isSameTransfer(currentPending, pending)) {
        this.errorsService.conflict(ErrMsg.ADMIN_TRANSFER_CANNOT_CANCEL);
      }

      await this.releaseTransfer(pending.code);
      await qr.commitTransaction();
    } catch (err: unknown) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      if (err instanceof HttpException) throw err;
      this.errorsService.badRequest(ErrMsg.TRANSFER_FAILED);
    } finally {
      await qr.release();
    }

    return { message: 'Administrator rights transfer cancelled.' };
  }

  async confirmTransfer(code: string, currentUserId: number, password: string) {
    const attemptSubject = currentUserId.toString();
    await this.tokensService.assertVerificationAttemptsAvailable(
      TokenType.ADMIN_TRANSFER,
      attemptSubject,
    );

    const pending = await this.getActivePendingTransfer();
    if (!pending || pending.code !== code) {
      const limitReached = await this.tokensService.registerVerificationFailure(
        TokenType.ADMIN_TRANSFER,
        attemptSubject,
      );
      if (limitReached && pending?.toId === currentUserId) {
        await this.releaseTransfer(pending.code).catch(() => undefined);
      }
      return this.errorsService.invalidToken(null, TokenType.ADMIN_TRANSFER);
    }

    const { fromId, toId } = pending;
    if (fromId === toId) {
      this.errorsService.badRequest(ErrMsg.ADMIN_CANNOT_TRANSFER_THEMSELVES);
    }
    if (currentUserId !== toId) {
      await this.tokensService.registerVerificationFailure(
        TokenType.ADMIN_TRANSFER,
        attemptSubject,
      );
      this.errorsService.forbidden(ErrMsg.TOKEN_NOT_ISSUED_FOR_CURRENT_USER);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    let fromEmail = '';
    let toEmail = '';

    try {
      const from = await qr.manager.findOneOrFail(User, {
        where: { id: fromId },
        select: [ID, EMAIL, ROLE, IS_BLOCKED],
        lock: { mode: 'pessimistic_write' },
      });

      const currentPending = await this.getActivePendingTransfer();
      if (!this.isSameTransfer(currentPending, pending)) {
        this.errorsService.invalidToken(null, TokenType.ADMIN_TRANSFER);
      }

      const to = await qr.manager.findOneOrFail(User, {
        where: { id: toId },
        select: [ID, EMAIL, PASSWORD, ROLE, IS_BLOCKED],
        lock: { mode: 'pessimistic_write' },
      });

      if (to.is_blocked) {
        this.errorsService.badRequest(ErrMsg.TARGET_USER_BLOCKED);
      }

      const isPasswordValid = await this.hashService.compare(
        password,
        to.password,
      );
      if (!isPasswordValid) {
        this.errorsService.badRequest(ErrMsg.CURRENT_PASSWORD_IS_INCORRECT);
      }

      if (from.role !== Role.ADMIN) {
        this.errorsService.badRequest(ErrMsg.INITIATOR_IS_NO_ADMINISTRATOR);
      }
      if (to.role === Role.ADMIN) {
        this.errorsService.badRequest(ErrMsg.TARGET_USER_ALREADY_ADMINISTRATOR);
      }

      fromEmail = from.email;
      toEmail = to.email;

      await qr.manager.update(User, { id: fromId }, { role: Role.USER });
      await qr.manager.update(User, { id: toId }, { role: Role.ADMIN });
      await qr.commitTransaction();
    } catch (err: unknown) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      if (err instanceof HttpException) throw err;
      this.errorsService.badRequest(ErrMsg.TRANSFER_FAILED);
    } finally {
      await qr.release();
    }

    await this.releaseTransfer(code).catch(() => undefined);
    await this.tokensService
      .clearVerificationFailures(TokenType.ADMIN_TRANSFER, attemptSubject)
      .catch(() => undefined);

    const subject = 'Administrator rights have been transferred';
    this.mailService
      .send(
        fromEmail,
        subject,
        'Your administrator rights have been transferred to another user.',
      )
      .catch(() => undefined);
    this.mailService
      .send(toEmail, subject, 'You have received administrator rights.')
      .catch(() => undefined);

    return { message: 'Administrator rights transferred successfully.' };
  }
}
