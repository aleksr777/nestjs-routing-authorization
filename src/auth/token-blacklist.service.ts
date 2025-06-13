import { Injectable, Inject } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenBlacklistService {
  private readonly redisClient;
  private readonly accessTokenTTL: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.redisClient = this.redisService.getClient();

    const expiresIn = this.configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );
    this.accessTokenTTL = this.parseExpiresIn(expiresIn);
  }

  private parseExpiresIn(value: string): number {
    const match = value.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid JWT_ACCESS_EXPIRES_IN format: ${value}`);
    }

    const [, amountStr, unit] = match;
    const amount = parseInt(amountStr, 10);

    switch (unit) {
      case 's':
        return amount;
      case 'm':
        return amount * 60;
      case 'h':
        return amount * 60 * 60;
      case 'd':
        return amount * 60 * 60 * 24;
      default:
        throw new Error(`Unknown time unit in JWT_ACCESS_EXPIRES_IN: ${unit}`);
    }
  }

  async add(token: string): Promise<void> {
    await this.redisClient.set(token, 'blacklisted', {
      EX: this.accessTokenTTL,
    });
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const result = await this.redisClient.get(token);
    return result === 'blacklisted';
  }
}
