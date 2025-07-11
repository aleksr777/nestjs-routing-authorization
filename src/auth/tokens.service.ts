import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RedisClientType } from 'redis';
import { RedisService } from '../common/redis-service/redis.service';
import { JwtService } from '@nestjs/jwt';
import { EnvService } from '../common/env-service/env.service';
import { ErrorsHandlerService } from '../common/errors-handler-service/errors-handler.service';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class TokensService {
  private readonly redisClient: RedisClientType;
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly redisService: RedisService,
    private readonly envService: EnvService,
    private readonly jwtService: JwtService,
    private readonly errorsHandlerService: ErrorsHandlerService,
  ) {
    this.redisClient = this.redisService.getClient();
    this.accessSecret = this.envService.getEnv('JWT_ACCESS_SECRET');
    this.refreshSecret = this.envService.getEnv('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.envService.getEnv('JWT_ACCESS_EXPIRES_IN');
    this.refreshExpiresIn = this.envService.getEnv('JWT_REFRESH_EXPIRES_IN');
  }

  private getTokenExpiration(token: string) {
    const decoded = this.jwtService.decode<JwtPayload>(token);
    if (!decoded?.exp) {
      return this.errorsHandlerService.handleInvalidToken();
    }
    return decoded.exp;
  }

  private stripToken(token: string) {
    const cleanedToken = token.startsWith('Bearer ')
      ? token.slice(7).trim()
      : token.trim();
    return cleanedToken;
  }

  async addToBlacklist(access_token: string): Promise<void> {
    const cleanedToken = this.stripToken(access_token);
    const exp = this.getTokenExpiration(cleanedToken);
    if (typeof exp !== 'number' || isNaN(exp)) {
      return this.errorsHandlerService.handleInvalidToken();
    }
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redisClient.set(cleanedToken, 'blacklisted', { EX: ttl });
    }
  }

  async isBlacklisted(access_token: string): Promise<boolean> {
    const cleanedToken = this.stripToken(access_token);
    const result = await this.redisClient.get(cleanedToken);
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
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleDefaultError();
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
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }

  generateTokens(userId: number) {
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
    return {
      access_token,
      refresh_token,
      access_token_expires: this.getTokenExpiration(access_token),
      refresh_token_expires: this.getTokenExpiration(refresh_token),
    };
  }
}
