import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { User } from '../users/entities/user.entity';
import {
  ID,
  ROLE,
  IS_BLOCKED,
  USER_PROFILE_FIELDS,
  PASSWORD,
  REFRESH_TOKEN,
  BLOCKED_REASON,
} from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class AuthService {
  config: any;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
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
      throw err;
    }
  }

  async validateUserByRefreshToken(id: number, refresh_token: string) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [
          ...USER_PROFILE_FIELDS,
          REFRESH_TOKEN,
          IS_BLOCKED,
          BLOCKED_REASON,
        ],
      });
      const isTokensMatch = refresh_token === user.refresh_token;
      if (!isTokensMatch) {
        return this.errorsService.invalidToken(null, TokenType.REFRESH);
      }
      return user;
    } catch (err: unknown) {
      this.errorsService.invalidToken(err, TokenType.REFRESH);
      this.errorsService.default(err);
    }
  }

  async login(userId: number) {
    try {
      const tokens = this.tokensService.generateJwtTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch (err: unknown) {
      this.errorsService.default(err);
    }
  }

  async logout(userId: number, access_token: string | undefined) {
    if (!access_token) {
      this.errorsService.tokenNotDefined(TokenType.ACCESS);
    } else {
      try {
        await this.tokensService.removeRefreshToken(userId);
        await this.tokensService.addJwtTokenToBlacklist(
          access_token,
          TokenType.ACCESS,
        );
      } catch (err: unknown) {
        this.errorsService.invalidToken(err, TokenType.ACCESS);
        this.errorsService.default(err);
      }
    }
  }

  async refreshJwtTokens(userId: number) {
    try {
      const tokens = this.tokensService.generateJwtTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch (err: unknown) {
      this.errorsService.invalidToken(err, TokenType.REFRESH);
      this.errorsService.default(err);
    }
  }
}
