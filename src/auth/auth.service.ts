import {
  Injectable,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { User } from '../users/entities/user.entity';
import {
  ID,
  ROLE,
  EMAIL,
  IS_BLOCKED,
  USER_PROFILE_FIELDS,
  PASSWORD,
  REFRESH_TOKEN,
  BLOCKED_REASON,
} from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';
import { Role } from '../common/types/role.enum';

@Injectable()
export class AuthService {
  config: any;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly tokensService: TokensService,
    private readonly hashService: HashService,
    private readonly errorsService: ErrorsService,
  ) {}

  removeSensitiveInfo<T extends object, K extends keyof T>(
    source: T | T[],
    keysToRemove: readonly K[],
  ): Omit<T, K> | Omit<T, K>[] {
    const remove = (item: T): Omit<T, K> => {
      const result = { ...item } as Partial<T>;
      for (const key of keysToRemove) {
        delete result[key];
      }
      return result as Omit<T, K>;
    };
    if (Array.isArray(source)) {
      return source.map(remove);
    } else {
      return remove(source);
    }
  }

  isUserBlocked(user: User) {
    if (user.is_blocked) {
      this.errorsService.accountBlocked(user.blocked_reason);
    }
  }

  async validateUserByEmailAndPassword(email: string, password: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, PASSWORD, IS_BLOCKED, BLOCKED_REASON],
      });
      const isPasswordValid = await this.hashService.compare(
        password,
        user.password,
      );
      this.errorsService.invalidEmailOrPassword(null, isPasswordValid);
      return user;
    } catch (err: unknown) {
      this.errorsService.invalidEmailOrPassword(err);
      this.errorsService.default(err);
    }
  }

  async getAdministratorEmail() {
    try {
      const administrator = await this.usersRepository.findOneOrFail({
        where: { role: Role.ADMIN },
        select: [EMAIL],
      });
      return administrator.email;
    } catch (err: unknown) {
      this.errorsService.userNotFound(err, 'Administrator not found');
      this.errorsService.default(err);
    }
  }

  async validateUserById(id: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [ID, ROLE, IS_BLOCKED, BLOCKED_REASON],
      });
      return user;
    } catch (err: unknown) {
      this.errorsService.userNotFound(err);
      this.errorsService.default(err);
    }
  }

  async login(userId: number) {
    try {
      const tokens = this.tokensService.generateJwtTokens(userId);
      const refreshTokenHash = this.hashService.hashToken(tokens.refresh_token);
      await this.tokensService.saveRefreshToken(userId, refreshTokenHash);
      return tokens;
    } catch (err: unknown) {
      this.errorsService.default(err);
    }
  }

  async logout(userId: number, access_token: string | undefined) {
    if (!access_token) {
      this.errorsService.tokenNotDefined(TokenType.ACCESS);
    }
    try {
      await this.tokensService.removeRefreshToken(userId);
      await this.tokensService.addJwtTokenToBlacklist(
        access_token,
        TokenType.ACCESS,
      );
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) {
        this.errorsService.invalidToken(err, TokenType.ACCESS);
      }
      this.errorsService.default(err);
    }
  }

  async refreshJwtTokens(
    userId: number,
    currentRefreshToken: string | null,
  ) {
    if (!currentRefreshToken) {
      this.errorsService.tokenNotDefined(TokenType.REFRESH);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const user = await qr.manager.findOne(User, {
        where: { id: userId },
        select: [ID, REFRESH_TOKEN, IS_BLOCKED, BLOCKED_REASON],
        lock: { mode: 'pessimistic_write' },
      });

      if (!user) {
        this.errorsService.invalidToken(null, TokenType.REFRESH);
      }

      this.isUserBlocked(user);

      const isCurrentRefreshToken =
        typeof user.refresh_token === 'string' &&
        this.hashService.compareToken(currentRefreshToken, user.refresh_token);

      if (!isCurrentRefreshToken) {
        await qr.manager.update(
          User,
          { id: userId },
          { refresh_token: null },
        );
        await qr.commitTransaction();
        this.errorsService.invalidToken(null, TokenType.REFRESH);
      }

      const tokens = this.tokensService.generateJwtTokens(userId);
      const refreshTokenHash = this.hashService.hashToken(tokens.refresh_token);
      await qr.manager.update(
        User,
        { id: userId },
        { refresh_token: refreshTokenHash },
      );
      await qr.commitTransaction();

      return tokens;
    } catch (err: unknown) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      if (err instanceof HttpException) {
        throw err;
      }
      this.errorsService.invalidToken(err, TokenType.REFRESH);
    } finally {
      await qr.release();
    }
  }
}
