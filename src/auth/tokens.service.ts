import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RedisService } from '../common/redis-service/redis.service';
import { JwtService } from '@nestjs/jwt';
import { EnvService } from '../common/env-service/env.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { TokenType } from '../common/types/token-type.type';

const RESET_REDIS_PREFIX = `reset:`;
const REGISTER_REDIS_PREFIX = `register:`;
const ADMIN_TRANSFER_REDIS_PREFIX = `admin:transfer:`;
const EMAIL_CHANGE_REDIS_PREFIX = 'email-change:';
const PASSWORD_CHANGE_PREFIX = 'password-change:';

@Injectable()
export class TokensService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly transferExpiresIn: number;
  private readonly resetExpiresIn: number;
  private readonly registrationExpiresIn: number;
  private readonly emailChangeTokenExpiresIn: number;
  private readonly passwordChangeTokenExpiresIn: number;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly envService: EnvService,
    private readonly jwtService: JwtService,
    private readonly errorsService: ErrorsService,
  ) {
    this.accessSecret = this.envService.get('JWT_ACCESS_SECRET');
    this.refreshSecret = this.envService.get('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.envService.get('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiresIn = this.envService.get('JWT_REFRESH_EXPIRES_IN');
    this.transferExpiresIn = this.envService.get(
      'ADMIN_TRANSFER_TOKEN_EXPIRES_IN',
      'number',
    );
    this.resetExpiresIn = this.envService.get(
      'RESET_TOKEN_EXPIRES_IN',
      'number',
    );
    this.registrationExpiresIn = this.envService.get(
      'REGISTRATION_TOKEN_EXPIRES_IN',
      'number',
    );
    this.emailChangeTokenExpiresIn = this.envService.get(
      'EMAIL_CHANGE_TOKEN_EXPIRES_IN',
      'number',
    );
    this.passwordChangeTokenExpiresIn = this.envService.get(
      'PASSWORD_CHANGE_TOKEN_EXPIRES_IN',
      'number',
    );
  }

  private getJwtTokenExpiration(token: string, tokenType?: TokenType) {
    const decoded = this.jwtService.decode<JwtPayload>(token);
    if (!decoded?.exp) {
      this.errorsService.invalidToken(null, tokenType);
    }
    return decoded.exp;
  }

  private stripJwtToken(token: string) {
    const cleanedToken = token.startsWith('Bearer ')
      ? token.slice(7).trim()
      : token.trim();
    return cleanedToken;
  }

  private isRegistrationPayload(
    obj: unknown,
  ): obj is { email: string; password: string } {
    return (
      typeof obj === 'object' &&
      obj !== null &&
      'email' in obj &&
      typeof (obj as { email?: unknown }).email === 'string' &&
      'password' in obj &&
      typeof (obj as { password?: unknown }).password === 'string'
    );
  }

  async addJwtTokenToBlacklist(token: string, tokenType?: TokenType) {
    const cleanedToken = this.stripJwtToken(token);
    const exp = this.getJwtTokenExpiration(cleanedToken, tokenType);
    if (typeof exp !== 'number' || isNaN(exp)) {
      this.errorsService.invalidToken(null, tokenType);
    } else {
      const ttl = exp - Math.floor(Date.now() / 1000);
      if (ttl <= 0) {
        this.errorsService.invalidToken(null, tokenType);
      }
      await this.redisService.set(cleanedToken, 'blacklisted', { EX: ttl });
    }
  }

  async isJwtTokenBlacklisted(token: string) {
    const cleanedToken = this.stripJwtToken(token);
    const result = await this.redisService.get(cleanedToken);
    if (result) {
      this.errorsService.jwtTokenBlacklisted();
      return 'blacklisted';
    }
  }

  async saveRefreshToken(userId: number, refresh_token: string) {
    try {
      const result = await this.usersRepository.update(
        { id: userId },
        {
          refresh_token,
        },
      );
      if (result.affected === 0) {
        return this.errorsService.userNotFound();
      }
    } catch (err: unknown) {
      this.errorsService.default(err);
    }
  }

  async removeRefreshToken(userId: number) {
    try {
      const result = await this.usersRepository.update(
        { id: userId },
        {
          refresh_token: null,
        },
      );
      if (result.affected === 0) {
        return this.errorsService.userNotFound();
      }
    } catch (err: unknown) {
      this.errorsService.default(err);
    }
  }

  generateJwtTokens(userId: number) {
    const payload = {
      sub: userId,
    };
    const access_token = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn,
    });
    const refresh_token = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });
    const decodedAccess = this.jwtService.decode<JwtPayload>(access_token);
    const decodedRefresh = this.jwtService.decode<JwtPayload>(refresh_token);
    return {
      access_token,
      refresh_token,
      access_token_expires: decodedAccess?.exp ?? null,
      refresh_token_expires: decodedRefresh?.exp ?? null,
    };
  }

  generateVerificationToken() {
    return uuidv4();
  }

  /* Reset token */
  async saveResetToken(userId: number, token: string): Promise<void> {
    const id = userId.toString();
    await this.redisService.set(`${RESET_REDIS_PREFIX}${token}`, id, {
      EX: this.resetExpiresIn,
    });
  }

  async getUserIdByResetToken(token: string): Promise<number | null> {
    const userId = await this.redisService.get(`${RESET_REDIS_PREFIX}${token}`);
    return userId ? parseInt(userId, 10) : null;
  }

  async deleteResetToken(token: string) {
    await this.redisService.del(`${RESET_REDIS_PREFIX}${token}`);
  }

  /* Registration token */
  async saveRegistrationToken(token: string, value: unknown) {
    if (!this.isRegistrationPayload(value)) {
      this.errorsService.default(null, 'Invalid registration payload');
    }
    const json = JSON.stringify(value);
    await this.redisService.set(`${REGISTER_REDIS_PREFIX}${token}`, json, {
      EX: this.registrationExpiresIn,
    });
  }

  async getDataByRegistrationToken(
    token: string,
  ): Promise<{ email: string; password: string } | null> {
    const json = await this.redisService.get(
      `${REGISTER_REDIS_PREFIX}${token}`,
    );
    if (!json) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return null;
    }
    if (this.isRegistrationPayload(parsed)) {
      return parsed;
    }
    return null;
  }

  async deleteRegistrationToken(token: string) {
    await this.redisService.del(`${REGISTER_REDIS_PREFIX}${token}`);
  }

  /* Transfer token */
  async saveTransferToken(token: string, fromId: number, toId: number) {
    await this.redisService.set(
      `${ADMIN_TRANSFER_REDIS_PREFIX}${token}`,
      JSON.stringify({ fromId: fromId, toId: toId }),
      {
        EX: this.transferExpiresIn,
      },
    );
  }

  async getDataByTransferToken(
    token: string,
  ): Promise<{ fromId: number; toId: number } | undefined> {
    const raw = await this.redisService.get(
      `${ADMIN_TRANSFER_REDIS_PREFIX}${token}`,
    );
    if (!raw) {
      return undefined;
    } else {
      const data = JSON.parse(raw) as {
        fromId: number;
        toId: number;
      };
      return data;
    }
  }

  async deleteTransferToken(token: string) {
    await this.redisService.del(`${ADMIN_TRANSFER_REDIS_PREFIX}${token}`);
  }

  /* Email change token */
  async saveEmailChangeToken(token: string, userId: number, new_email: string) {
    await this.redisService.set(
      `${EMAIL_CHANGE_REDIS_PREFIX}${token}`,
      JSON.stringify({ userId: userId, new_email: new_email }),
      {
        EX: this.emailChangeTokenExpiresIn,
      },
    );
  }

  async getDataByEmailChangeToken(
    token: string,
  ): Promise<{ userId: number; new_email: string } | undefined> {
    const raw = await this.redisService.get(
      `${EMAIL_CHANGE_REDIS_PREFIX}${token}`,
    );
    if (!raw) {
      return undefined;
    } else {
      const data = JSON.parse(raw) as {
        userId: number;
        new_email: string;
      };
      return data;
    }
  }

  async deleteEmailChangeToken(token: string) {
    await this.redisService.del(`${EMAIL_CHANGE_REDIS_PREFIX}${token}`);
  }

  /* Password change token*/
  async savePasswordChangeToken(token: string, userId: number) {
    const ttl = this.passwordChangeTokenExpiresIn;
    await this.redisService.set(
      `${PASSWORD_CHANGE_PREFIX}${token}`,
      String(userId),
      { EX: ttl },
    );
  }

  async getUserIdByPasswordChangeToken(token: string): Promise<number | null> {
    const v = await this.redisService.get(`${PASSWORD_CHANGE_PREFIX}${token}`);
    return v ? parseInt(v, 10) : null;
  }

  async deletePasswordChangeToken(token: string) {
    await this.redisService.del(`${PASSWORD_CHANGE_PREFIX}${token}`);
  }
}
