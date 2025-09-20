import { Injectable, HttpException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { TokensService } from '../auth/tokens.service';
import { ID, PASSWORD } from '../common/constants/user-select-fields.constants';
import { ErrMsg } from '../common/errors-service/error-messages.type';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class PasswordChangeService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly hashService: HashService,
    private readonly errorsService: ErrorsService,
    private readonly tokensService: TokensService,
  ) {}

  async issuePasswordChangeToken(userId: number, oldPassword: string) {
    const user = await this.usersRepository
      .findOneOrFail({
        where: { id: userId },
        select: [ID, PASSWORD],
      })
      .catch((err) => this.errorsService.userNotFound(err));
    const ok = await this.hashService.compare(
      oldPassword,
      (user as User).password,
    );
    if (!ok)
      return this.errorsService.badRequest(ErrMsg.OLD_PASSWORD_IS_INCORRECT);
    const token = this.tokensService.generateVerificationToken();
    await this.tokensService.savePasswordChangeToken(token, userId);
    return { token };
  }

  async changePasswordByToken(
    userId: number,
    token: string,
    newPassword: string,
    accessToken?: string,
  ) {
    let same;
    const storedUserId =
      await this.tokensService.getUserIdByPasswordChangeToken(token);
    if (!storedUserId || storedUserId !== userId) {
      return this.errorsService.invalidToken(null, TokenType.PASSWORD_CHANGE);
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const user = await qr.manager.findOneOrFail(User, {
        where: { id: userId },
        select: [ID, PASSWORD],
      });
      same = await this.hashService.compare(newPassword, user.password);
      if (same) this.errorsService.badRequest(ErrMsg.NEW_PASSWORD_MUST_DIFFER);
      const hash = await this.hashService.hash(newPassword);
      await qr.manager.update(
        User,
        { id: userId },
        { password: hash, refresh_token: null },
      );
      await qr.commitTransaction();
      await this.tokensService
        .deletePasswordChangeToken(token)
        .catch(() => undefined);
      if (accessToken) {
        await this.tokensService.addJwtTokenToBlacklist(
          accessToken,
          TokenType.ACCESS,
        );
      }
      return this.tokensService.generateJwtTokens(userId);
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
