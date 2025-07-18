import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RedisService } from '../common/redis-service/redis.service';
import { JwtService } from '@nestjs/jwt';
import { EnvService } from '../common/env-service/env.service';
import { ErrorsHandlerService } from '../common/errors-handler-service/errors-handler.service';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class TokensService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  private readonly resetExpiresIn: number;
  private readonly registrationExpiresIn: number;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly envService: EnvService,
    private readonly jwtService: JwtService,
    private readonly errorsHandlerService: ErrorsHandlerService,
  ) {
    this.accessSecret = this.envService.getEnv('JWT_ACCESS_SECRET');
    this.refreshSecret = this.envService.getEnv('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.envService.getEnv('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiresIn = this.envService.getEnv('JWT_REFRESH_EXPIRES_IN');
    this.resetExpiresIn = this.envService.getEnv(
      'RESET_TOKEN_EXPIRES_IN',
      'number',
    );
    this.registrationExpiresIn = this.envService.getEnv(
      'REGISTRATION_TOKEN_EXPIRES_IN',
      'number',
    );
  }

  private getJwtTokenExpiration(token: string) {
    const decoded = this.jwtService.decode<JwtPayload>(token);
    if (!decoded?.exp) {
      return this.errorsHandlerService.handleInvalidToken();
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

  async addJwtTokenToBlacklist(access_token: string) {
    const cleanedToken = this.stripJwtToken(access_token);
    const exp = this.getJwtTokenExpiration(cleanedToken);
    if (typeof exp !== 'number' || isNaN(exp)) {
      return this.errorsHandlerService.handleInvalidToken();
    }
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl <= 0) {
      return this.errorsHandlerService.handleInvalidToken();
    }
    await this.redisService.set(cleanedToken, 'blacklisted', { EX: ttl });
  }

  async isJwtTokenBlacklisted(access_token: string) {
    const cleanedToken = this.stripJwtToken(access_token);
    const result = await this.redisService.get(cleanedToken);
    return result === 'blacklisted';
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
        return this.errorsHandlerService.handleUserNotFound();
      }
    } catch (err: unknown) {
      this.errorsHandlerService.handleDefaultError(err);
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
        return this.errorsHandlerService.handleUserNotFound();
      }
    } catch (err: unknown) {
      this.errorsHandlerService.handleDefaultError(err);
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

  async saveResetToken(userId: number, token: string): Promise<void> {
    const id = userId.toString();
    await this.redisService.set(`reset:${token}`, id, {
      EX: this.resetExpiresIn,
    });
  }

  async getUserIdByResetToken(token: string): Promise<number | null> {
    const userId = await this.redisService.get(`reset:${token}`);
    return userId ? parseInt(userId, 10) : null;
  }

  async deleteResetToken(token: string) {
    await this.redisService.del(`reset:${token}`);
  }

  async saveRegistrationToken(token: string, value: unknown) {
    if (!this.isRegistrationPayload(value)) {
      throw new Error('Invalid registration payload');
    }
    const json = JSON.stringify(value);
    await this.redisService.set(`register:${token}`, json, {
      EX: this.registrationExpiresIn,
    });
  }

  async getDataByRegistrationToken(
    token: string,
  ): Promise<{ email: string; password: string } | null> {
    const json = await this.redisService.get(`register:${token}`);
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
    await this.redisService.del(`register:${token}`);
  }
}
