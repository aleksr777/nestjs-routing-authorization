import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RedisClientType } from 'redis';
import { RedisService } from '../redis/redis.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ErrMessages } from '../constants/error-messages';
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
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.redisClient = this.redisService.getClient();
    this.accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );
    this.refreshExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );
  }

  private getTokenExpiration(token: string) {
    const decoded = this.jwtService.decode<JwtPayload>(token);
    if (!decoded?.exp) {
      throw new InternalServerErrorException(ErrMessages.INVALID_TOKEN);
    }
    return decoded.exp;
  }

  private checkAndStripToken(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException(ErrMessages.TOKEN_NOT_DEFINED);
    }
    const cleanedToken = token.startsWith('Bearer ')
      ? token.slice(7).trim()
      : token.trim();
    return cleanedToken;
  }

  async addToBlacklist(access_token: string | undefined): Promise<void> {
    const cleanedToken = this.checkAndStripToken(access_token);
    const exp = this.getTokenExpiration(cleanedToken);
    const ttl = exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redisClient.set(cleanedToken, 'blacklisted', { EX: ttl });
    }
  }

  async isBlacklisted(access_token: string | undefined): Promise<boolean> {
    const cleanedToken = this.checkAndStripToken(access_token);
    const result = await this.redisClient.get(cleanedToken);
    return result === 'blacklisted';
  }

  async saveRefreshToken(userId: number, refresh_token: string) {
    try {
      const result = await this.usersRepository.update(userId, {
        refresh_token,
      });
      if (result.affected === 0) {
        throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
      }
    } catch {
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
  }

  async removeRefreshToken(userId: number) {
    try {
      const result = await this.usersRepository.update(userId, {
        refresh_token: null as unknown as string,
      });
      if (result.affected === 0) {
        throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
      }
    } catch {
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
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
