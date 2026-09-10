import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RedisService } from '../common/redis-service/redis.service';
import { JwtService } from '@nestjs/jwt';
import { EnvService } from '../common/env-service/env.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { ErrMsg } from '../common/errors-service/error-messages.type';
import { JwtPayload } from '../common/types/jwt-tokens.type';
import { TokenType } from '../common/types/token-type.type';

const RESET_REDIS_PREFIX = 'reset:';
const RESET_ACTIVE_REDIS_PREFIX = 'reset:active:';
const CURRENT_USER_PASSWORD_RESET_REDIS_PREFIX = 'current-user-password-reset:';
const REGISTER_REDIS_PREFIX = 'register:';
const REGISTER_ACTIVE_REDIS_PREFIX = 'register:active:';
const ADMIN_TRANSFER_REDIS_PREFIX = 'admin:transfer:';
const EMAIL_CHANGE_REDIS_PREFIX = 'email-change:';
const PASSWORD_CHANGE_PREFIX = 'password-change:';
const VERIFICATION_ATTEMPTS_PREFIX = 'verification:attempts:';
const VERIFICATION_RESEND_PREFIX = 'verification:resend:';
const DEFAULT_VERIFICATION_ATTEMPTS = 5;
const ADMIN_TRANSFER_VERIFICATION_ATTEMPTS = 3;

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
  private readonly verificationResendCooldown: number;

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
    this.verificationResendCooldown = this.envService.get(
      'VERIFICATION_CODE_RESEND_COOLDOWN',
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

  private getVerificationAttemptConfig(tokenType: TokenType) {
    switch (tokenType) {
      case TokenType.ADMIN_TRANSFER:
        return {
          maxAttempts: ADMIN_TRANSFER_VERIFICATION_ATTEMPTS,
          expiresIn: this.transferExpiresIn,
        };
      case TokenType.REGISTRATION:
        return {
          maxAttempts: DEFAULT_VERIFICATION_ATTEMPTS,
          expiresIn: this.registrationExpiresIn,
        };
      case TokenType.PASSWORD_RESET:
      case TokenType.CURRENT_USER_PASSWORD_RESET:
        return {
          maxAttempts: DEFAULT_VERIFICATION_ATTEMPTS,
          expiresIn: this.resetExpiresIn,
        };
      case TokenType.EMAIL_CHANGE:
        return {
          maxAttempts: DEFAULT_VERIFICATION_ATTEMPTS,
          expiresIn: this.emailChangeTokenExpiresIn,
        };
      case TokenType.PASSWORD_CHANGE:
        return {
          maxAttempts: DEFAULT_VERIFICATION_ATTEMPTS,
          expiresIn: this.passwordChangeTokenExpiresIn,
        };
      default:
        return {
          maxAttempts: DEFAULT_VERIFICATION_ATTEMPTS,
          expiresIn: this.resetExpiresIn,
        };
    }
  }

  private getVerificationAttemptsKey(tokenType: TokenType, subject: string) {
    return `${VERIFICATION_ATTEMPTS_PREFIX}${tokenType.toLowerCase()}:${subject}`;
  }

  private getVerificationResendKey(tokenType: TokenType, subject: string) {
    return `${VERIFICATION_RESEND_PREFIX}${tokenType.toLowerCase()}:${subject}`;
  }

  private getRegistrationActiveKey(email: string) {
    return `${REGISTER_ACTIVE_REDIS_PREFIX}${email.trim().toLowerCase()}`;
  }

  private getResetActiveKey(userId: number) {
    return `${RESET_ACTIVE_REDIS_PREFIX}${userId}`;
  }

  getVerificationAttemptLimit(tokenType: TokenType) {
    return this.getVerificationAttemptConfig(tokenType).maxAttempts;
  }

  getVerificationResendCooldown() {
    return this.verificationResendCooldown;
  }

  async reserveVerificationCodeRequest(tokenType: TokenType, subject: string) {
    const key = this.getVerificationResendKey(tokenType, subject);
    const result = await this.redisService.set(key, '1', {
      EX: this.verificationResendCooldown,
      NX: true,
    });

    if (result === 'OK') {
      return this.verificationResendCooldown;
    }

    const ttl = await this.redisService.ttl(key);
    const retryAfter = typeof ttl === 'number' && ttl > 0 ? ttl : 1;
    this.errorsService.tooManyRequests(
      ErrMsg.VERIFICATION_CODE_RESEND_TOO_SOON,
      retryAfter,
    );
  }

  async releaseVerificationCodeRequest(tokenType: TokenType, subject: string) {
    await this.redisService.del(
      this.getVerificationResendKey(tokenType, subject),
    );
  }

  async getVerificationAttemptsRemaining(tokenType: TokenType, subject: string) {
    const { maxAttempts } = this.getVerificationAttemptConfig(tokenType);
    const key = this.getVerificationAttemptsKey(tokenType, subject);
    const raw = await this.redisService.get(key);
    const attempts = raw ? Number.parseInt(raw, 10) : 0;
    const safeAttempts = Number.isFinite(attempts) ? attempts : 0;
    return Math.max(0, maxAttempts - safeAttempts);
  }

  async assertVerificationAttemptsAvailable(tokenType: TokenType, subject: string) {
    const attemptsRemaining = await this.getVerificationAttemptsRemaining(
      tokenType,
      subject,
    );
    if (attemptsRemaining <= 0) {
      this.errorsService.invalidTokenWithAttempts(tokenType, 0);
    }
  }

  async registerVerificationFailure(tokenType: TokenType, subject: string) {
    const { maxAttempts, expiresIn } = this.getVerificationAttemptConfig(tokenType);
    const key = this.getVerificationAttemptsKey(tokenType, subject);
    const attempts = await this.redisService.incr(key);
    if (attempts === 1) {
      await this.redisService.expire(key, expiresIn);
    }
    return typeof attempts === 'number' && attempts >= maxAttempts;
  }

  async clearVerificationFailures(tokenType: TokenType, subject: string) {
    await this.redisService.del(
      this.getVerificationAttemptsKey(tokenType, subject),
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

  generateVerificationCode(): string {
    return randomInt(100_000, 1_000_000).toString();
  }

  private async saveVerificationToken(
    prefix: string,
    value: string,
    expiresIn: number,
  ): Promise<string> {
    const maxAttempts = 100;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const code = this.generateVerificationCode();
      const key = `${prefix}${code}`;
      const result = await this.redisService.set(key, value, {
        EX: expiresIn,
        NX: true,
      });
      if (result === 'OK') {
        return code;
      }
    }
    this.errorsService.default(null, ErrMsg.UNABLE_GENERATE_UNIQUE_CODE);
  }

  /* REGISTRATION CODE */
  async getRegistrationCode(value: { email: string; password: string }) {
    if (!this.isRegistrationPayload(value)) {
      this.errorsService.default(null, ErrMsg.INVALID_REGISTRATION_PAYLOAD);
    }

    const normalizedEmail = value.email.trim().toLowerCase();
    const activeKey = this.getRegistrationActiveKey(normalizedEmail);
    const previousCode = await this.redisService.get(activeKey);
    const json = JSON.stringify({ ...value, email: normalizedEmail });
    const code = await this.saveVerificationToken(
      REGISTER_REDIS_PREFIX,
      json,
      this.registrationExpiresIn,
    );

    await this.redisService.set(activeKey, code, {
      EX: this.registrationExpiresIn,
    });

    if (previousCode && previousCode !== code) {
      await this.redisService.del(`${REGISTER_REDIS_PREFIX}${previousCode}`);
    }

    return code;
  }

  async getActiveRegistrationData(email: string) {
    const activeCode = await this.redisService.get(
      this.getRegistrationActiveKey(email),
    );
    if (!activeCode) return null;
    const data = await this.getDataByRegistrationCode(activeCode);
    return data ? { code: activeCode, data } : null;
  }

  async isActiveRegistrationCode(email: string, code: string) {
    const activeCode = await this.redisService.get(
      this.getRegistrationActiveKey(email),
    );
    return activeCode === code;
  }

  async getDataByRegistrationCode(
    code: string,
  ): Promise<{ email: string; password: string } | null> {
    const json = await this.redisService.get(`${REGISTER_REDIS_PREFIX}${code}`);
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

  async deleteRegistrationCode(code: string, email?: string) {
    await this.redisService.del(`${REGISTER_REDIS_PREFIX}${code}`);
    if (email) {
      const activeKey = this.getRegistrationActiveKey(email);
      const activeCode = await this.redisService.get(activeKey);
      if (activeCode === code) {
        await this.redisService.del(activeKey);
      }
    }
  }

  /* PASSWORD RESET CODE */
  async getResetCode(userId: number) {
    if (!userId) {
      this.errorsService.default(null, ErrMsg.USER_ID_NOT_DEFINED);
    }

    const activeKey = this.getResetActiveKey(userId);
    const previousCode = await this.redisService.get(activeKey);
    const id = userId.toString();
    const code = await this.saveVerificationToken(
      RESET_REDIS_PREFIX,
      id,
      this.resetExpiresIn,
    );

    await this.redisService.set(activeKey, code, { EX: this.resetExpiresIn });

    if (previousCode && previousCode !== code) {
      await this.redisService.del(`${RESET_REDIS_PREFIX}${previousCode}`);
    }

    return code;
  }

  async isActiveResetCode(userId: number, code: string) {
    const activeCode = await this.redisService.get(
      this.getResetActiveKey(userId),
    );
    return activeCode === code;
  }

  async getIdByResetCode(code: string): Promise<number | null> {
    const userId = await this.redisService.get(`${RESET_REDIS_PREFIX}${code}`);
    return userId ? parseInt(userId, 10) : null;
  }

  async deletePassResetCode(code: string, userId?: number) {
    await this.redisService.del(`${RESET_REDIS_PREFIX}${code}`);
    if (userId) {
      const activeKey = this.getResetActiveKey(userId);
      const activeCode = await this.redisService.get(activeKey);
      if (activeCode === code) {
        await this.redisService.del(activeKey);
      }
    }
  }

  /* CURRENT USER PASSWORD RESET CODE */
  async getCurrentUserPasswordResetCode(userId: number) {
    if (!userId) {
      this.errorsService.default(null, ErrMsg.USER_ID_NOT_DEFINED);
    }
    const id = userId.toString();
    return this.saveVerificationToken(
      CURRENT_USER_PASSWORD_RESET_REDIS_PREFIX,
      id,
      this.resetExpiresIn,
    );
  }

  async getIdByCurrentUserPasswordResetCode(
    code: string,
  ): Promise<number | null> {
    const userId = await this.redisService.get(
      `${CURRENT_USER_PASSWORD_RESET_REDIS_PREFIX}${code}`,
    );
    return userId ? parseInt(userId, 10) : null;
  }

  async deleteCurrentUserPasswordResetCode(code: string) {
    await this.redisService.del(
      `${CURRENT_USER_PASSWORD_RESET_REDIS_PREFIX}${code}`,
    );
  }

  /* EMAIL CHANGE CODE */
  async getEmailChangeCode(value: { user_id: number; new_email: string }) {
    if (!value) {
      this.errorsService.default(null, ErrMsg.PAYLOAD_NOT_DEFINED);
    }
    const json = JSON.stringify(value);
    return this.saveVerificationToken(
      EMAIL_CHANGE_REDIS_PREFIX,
      json,
      this.emailChangeTokenExpiresIn,
    );
  }

  async getDataByEmailChangeCode(code: string) {
    const raw = await this.redisService.get(
      `${EMAIL_CHANGE_REDIS_PREFIX}${code}`,
    );
    if (!raw) {
      return undefined;
    } else {
      const data = JSON.parse(raw) as {
        user_id: number;
        new_email: string;
      };
      return data;
    }
  }

  async deleteEmailChangeCode(code: string) {
    await this.redisService.del(`${EMAIL_CHANGE_REDIS_PREFIX}${code}`);
  }

  /* PASSWORD CHANGE CODE */
  async getPasswordChangeCode(userId: number) {
    if (!userId) {
      this.errorsService.default(null, ErrMsg.USER_ID_NOT_DEFINED);
    }
    const id = userId.toString();
    return this.saveVerificationToken(
      PASSWORD_CHANGE_PREFIX,
      id,
      this.passwordChangeTokenExpiresIn,
    );
  }

  async getIdByPasswordChangeCode(code: string): Promise<number | null> {
    const userId = await this.redisService.get(
      `${PASSWORD_CHANGE_PREFIX}${code}`,
    );
    return userId ? parseInt(userId, 10) : null;
  }

  async deletePasswordChangeCode(code: string) {
    await this.redisService.del(`${PASSWORD_CHANGE_PREFIX}${code}`);
  }

  /* ADMIN TRANSFER CODE */
  async getTransferCode(fromId: number, toId: number) {
    const value = JSON.stringify({ fromId, toId });
    return this.saveVerificationToken(
      ADMIN_TRANSFER_REDIS_PREFIX,
      value,
      this.transferExpiresIn,
    );
  }

  async getDataByTransferToken(
    code: string,
  ): Promise<{ fromId: number; toId: number } | undefined> {
    const raw = await this.redisService.get(
      `${ADMIN_TRANSFER_REDIS_PREFIX}${code}`,
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

  async deleteTransferToken(code: string) {
    await this.redisService.del(`${ADMIN_TRANSFER_REDIS_PREFIX}${code}`);
  }
}
