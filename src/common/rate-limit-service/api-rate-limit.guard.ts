import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { EnvService } from '../env-service/env.service';
import { ErrorsService } from '../errors-service/errors.service';
import { RedisService } from '../redis-service/redis.service';

const API_RATE_LIMIT_PREFIX = 'rate-limit:api:ip:';
const AUTH_RATE_LIMIT_PREFIX = 'rate-limit:auth:ip:';
const API_RATE_LIMIT_MESSAGE =
  'Too many API requests from this IP. Please try again later.';
const AUTH_RATE_LIMIT_MESSAGE =
  'Too many authentication requests from this IP. Please try again later.';

@Injectable()
export class ApiRateLimitGuard implements CanActivate {
  private readonly apiMaxRequests: number;
  private readonly apiWindowSeconds: number;
  private readonly authMaxRequests: number;
  private readonly authWindowSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly envService: EnvService,
    private readonly errorsService: ErrorsService,
  ) {
    this.apiMaxRequests = this.envService.get(
      'API_IP_MAX_REQUESTS',
      'number',
    );
    this.apiWindowSeconds = this.envService.get(
      'API_RATE_LIMIT_WINDOW',
      'number',
    );
    this.authMaxRequests = this.envService.get(
      'AUTH_IP_MAX_REQUESTS',
      'number',
    );
    this.authWindowSeconds = this.envService.get(
      'AUTH_RATE_LIMIT_WINDOW',
      'number',
    );
  }

  private getIp(request: Request) {
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  private isAuthRequest(request: Request) {
    const path = request.originalUrl.split('?')[0];
    return path === '/api/auth' || path.startsWith('/api/auth/');
  }

  private async consume(
    key: string,
    maxRequests: number,
    windowSeconds: number,
    message: string,
  ) {
    const requests = await this.redisService.incrWithExpire(key, windowSeconds);
    if (requests <= maxRequests) return;

    const ttl = await this.redisService.ttl(key);
    const retryAfter = typeof ttl === 'number' && ttl > 0 ? ttl : 1;
    this.errorsService.tooManyRequests(message, retryAfter);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.method === 'OPTIONS') return true;

    const ip = this.getIp(request);
    await this.consume(
      `${API_RATE_LIMIT_PREFIX}${ip}`,
      this.apiMaxRequests,
      this.apiWindowSeconds,
      API_RATE_LIMIT_MESSAGE,
    );

    if (this.isAuthRequest(request)) {
      await this.consume(
        `${AUTH_RATE_LIMIT_PREFIX}${ip}`,
        this.authMaxRequests,
        this.authWindowSeconds,
        AUTH_RATE_LIMIT_MESSAGE,
      );
    }

    return true;
  }
}
