import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { AuthService } from '../auth/auth.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { TokensService } from '../auth/tokens.service';
import {
  EMAIL,
  ID,
  PASSWORD,
} from '../common/constants/user-select-fields.constants';
import { ErrMsg } from '../common/errors-service/error-messages.type';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class PasswordChangeService {
  private readonly resetExpiresIn: number;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly hashService: HashService,
    private readonly errorsService: ErrorsService,
    private readonly tokensService: TokensService,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
  ) {
    this.resetExpiresIn =
      this.envService.get('RESET_TOKEN_EXPIRES_IN', 'number') / 60;
  }

  async request(userId: number, oldPassword: string) {
    const user = await this.usersRepository
      .findOneOrFail({
        where: { id: userId },
        select: [ID, PASSWORD],
      })
      .catch((err) => {
        this.errorsService.userNotFound(err);
        this.errorsService.default(err);
      });
    const ok = await this.hashService.compare(oldPassword, user.password);
    if (!ok) {
      return this.errorsService.badRequest(ErrMsg.OLD_PASSWORD_IS_INCORRECT);
    }
    const code = await this.tokensService.getPasswordChangeCode(userId);
    return { code };
  }

  async requestReset(userId: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: userId },
        select: [ID, EMAIL],
      });
      const code = await this.tokensService.getCurrentUserPasswordResetCode(
        user.id,
      );
      const text =
        `You requested to change your password.\n` +
        `Use this code within ${this.resetExpiresIn} min: ${code}\n\n` +
        `If it wasn't you, ignore this message.`;
      const html = `
        <p>You requested to change your password.</p>
        <p>Use this code within ${this.resetExpiresIn} min:</p>
        <p style="font-weight: bold; font-size: 30px;">${code}</p>
        <p style="font-weight: bold; font-size: 17px;">If you didn’t request this, you can safely ignore this email.</p>`;
      await this.mailService.send(
        user.email,
        'Confirm password change',
        text,
        html,
      );
      return { message: 'Confirmation code sent to your email.' };
    } catch (err: unknown) {
      this.errorsService.userNotFound(err);
      this.errorsService.default(err);
    }
  }

  async confirmReset(
    userId: number,
    code: string,
    newPassword: string,
    accessToken?: string,
  ) {
    if (!accessToken) {
      return this.errorsService.invalidToken(null, TokenType.ACCESS);
    }
    const storedUserId =
      await this.tokensService.getIdByCurrentUserPasswordResetCode(code);
    if (!storedUserId || storedUserId !== userId) {
      return this.errorsService.invalidToken(
        null,
        TokenType.CURRENT_USER_PASSWORD_RESET,
      );
    }
    const tokens = await this.updatePassword(userId, newPassword, accessToken);
    await this.tokensService
      .deleteCurrentUserPasswordResetCode(code)
      .catch(() => undefined);
    return tokens;
  }

  async confirm(
    userId: number,
    code: string,
    newPassword: string,
    accessToken?: string,
  ) {
    if (!accessToken) {
      return this.errorsService.invalidToken(null, TokenType.ACCESS);
    }
    const storedUserId =
      await this.tokensService.getIdByPasswordChangeCode(code);
    if (!storedUserId || storedUserId !== userId) {
      return this.errorsService.invalidToken(null, TokenType.PASSWORD_CHANGE);
    }
    const tokens = await this.updatePassword(userId, newPassword, accessToken);
    await this.tokensService
      .deletePasswordChangeCode(code)
      .catch(() => undefined);
    return tokens;
  }

  private async updatePassword(
    userId: number,
    newPassword: string,
    accessToken: string,
  ) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const user = await qr.manager.findOneOrFail(User, {
        where: { id: userId },
        select: [ID, PASSWORD],
      });
      const same = await this.hashService.compare(newPassword, user.password);
      if (same) this.errorsService.badRequest(ErrMsg.NEW_PASSWORD_MUST_DIFFER);
      const hash = await this.hashService.hash(newPassword);
      await qr.manager.update(
        User,
        { id: userId },
        { password: hash, refresh_token: null },
      );
      await qr.commitTransaction();
      await this.tokensService.addJwtTokenToBlacklist(
        accessToken,
        TokenType.ACCESS,
      );
      return this.authService.login(userId);
    } catch (err) {
      await qr.rollbackTransaction();
      if (err instanceof HttpException) throw err;
      this.errorsService.userNotFound(err);
      this.errorsService.default(err);
    } finally {
      await qr.release();
    }
  }
}
