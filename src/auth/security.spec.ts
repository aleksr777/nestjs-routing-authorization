import { ExecutionContext, HttpException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EnvService } from '../common/env-service/env.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { HashService } from '../common/hash-service/hash.service';
import { RedisService } from '../common/redis-service/redis.service';
import { ApiRateLimitGuard } from '../common/rate-limit-service/api-rate-limit.guard';
import { JwtPayload } from '../common/types/jwt-tokens.type';
import { LoginRateLimitService } from './login-rate-limit.service';
import { PublicVerificationRateLimitService } from './public-verification-rate-limit.service';
import { SessionTokenService } from './session-token.service';

const createEnvService = (values: Record<string, string | number>) =>
  ({
    get: jest.fn((key: string) => values[key]),
  }) as unknown as EnvService;

const createRedisMock = () => ({
  get: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
  incrWithExpire: jest.fn(),
});

describe('authentication security primitives', () => {
  describe('HashService refresh-token hashing', () => {
    const service = new HashService();

    it('hashes tokens deterministically without storing the raw token', () => {
      const token = 'refresh-token-value';
      const hash = service.hashToken(token);

      expect(hash).toHaveLength(64);
      expect(hash).not.toBe(token);
      expect(service.hashToken(token)).toBe(hash);
    });

    it('compares refresh tokens using the stored hash', () => {
      const hash = service.hashToken('current-token');

      expect(service.compareToken('current-token', hash)).toBe(true);
      expect(service.compareToken('replayed-token', hash)).toBe(false);
    });
  });

  describe('SessionTokenService rotation tokens', () => {
    const envService = createEnvService({
      JWT_ACCESS_SECRET: 'access-secret',
      JWT_REFRESH_SECRET: 'refresh-secret',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    });
    const jwtService = new JwtService();
    const service = new SessionTokenService(jwtService, envService);

    it('generates a unique refresh token and jti on each rotation', () => {
      const first = service.generate(7);
      const second = service.generate(7);
      const firstPayload = jwtService.decode<JwtPayload>(first.refresh_token);
      const secondPayload = jwtService.decode<JwtPayload>(second.refresh_token);

      expect(first.refresh_token).not.toBe(second.refresh_token);
      expect(firstPayload?.sub).toBe(7);
      expect(secondPayload?.sub).toBe(7);
      expect(typeof firstPayload?.jti).toBe('string');
      expect(typeof secondPayload?.jti).toBe('string');
      expect(firstPayload?.jti).not.toBe(secondPayload?.jti);
    });
  });

  describe('LoginRateLimitService', () => {
    const envService = createEnvService({
      LOGIN_EMAIL_MAX_ATTEMPTS: 5,
      LOGIN_IP_MAX_ATTEMPTS: 20,
      LOGIN_RATE_LIMIT_WINDOW: 300,
    });
    const errorsService = new ErrorsService();

    it('normalizes email keys and clears successful-login failures', async () => {
      const redis = createRedisMock();
      redis.del.mockResolvedValue(1);
      const service = new LoginRateLimitService(
        redis as unknown as RedisService,
        envService,
        errorsService,
      );

      await service.clearEmailFailures('  User@Example.COM ');

      expect(redis.del).toHaveBeenCalledWith(
        'login:failures:email:user@example.com',
      );
    });

    it('returns 429 when the email failure limit is reached', async () => {
      const redis = createRedisMock();
      redis.incrWithExpire.mockResolvedValueOnce(5).mockResolvedValueOnce(1);
      redis.ttl.mockResolvedValue(180);
      const service = new LoginRateLimitService(
        redis as unknown as RedisService,
        envService,
        errorsService,
      );

      await expect(
        service.registerFailure('user@example.com', '127.0.0.1'),
      ).rejects.toMatchObject({ status: 429 });
    });
  });

  describe('PublicVerificationRateLimitService', () => {
    const envService = createEnvService({
      PUBLIC_VERIFICATION_IP_MAX_REQUESTS: 20,
      PUBLIC_VERIFICATION_IP_RATE_LIMIT_WINDOW: 600,
    });
    const errorsService = new ErrorsService();

    it('allows requests up to the configured IP limit', async () => {
      const redis = createRedisMock();
      redis.incrWithExpire.mockResolvedValue(20);
      const service = new PublicVerificationRateLimitService(
        redis as unknown as RedisService,
        envService,
        errorsService,
      );

      await expect(service.consume('127.0.0.1')).resolves.toBeUndefined();
      expect(redis.incrWithExpire).toHaveBeenCalledWith(
        'verification:requests:ip:127.0.0.1',
        600,
      );
    });

    it('returns 429 with the Redis TTL after the IP limit is exceeded', async () => {
      const redis = createRedisMock();
      redis.incrWithExpire.mockResolvedValue(21);
      redis.ttl.mockResolvedValue(420);
      const service = new PublicVerificationRateLimitService(
        redis as unknown as RedisService,
        envService,
        errorsService,
      );

      try {
        await service.consume('127.0.0.1');
        throw new Error('Expected rate limit error');
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(HttpException);
        const httpError = err as HttpException;
        expect(httpError.getStatus()).toBe(429);
        expect(httpError.getResponse()).toMatchObject({ retry_after: 420 });
      }
    });
  });

  describe('ApiRateLimitGuard', () => {
    const envService = createEnvService({
      API_IP_MAX_REQUESTS: 600,
      API_RATE_LIMIT_WINDOW: 60,
      AUTH_IP_MAX_REQUESTS: 120,
      AUTH_RATE_LIMIT_WINDOW: 60,
    });
    const errorsService = new ErrorsService();

    const createContext = (request: object) =>
      ({
        switchToHttp: () => ({
          getRequest: () => request,
        }),
      }) as unknown as ExecutionContext;

    it('counts auth requests against both general and auth-specific limits', async () => {
      const redis = createRedisMock();
      redis.incrWithExpire.mockResolvedValue(1);
      const guard = new ApiRateLimitGuard(
        redis as unknown as RedisService,
        envService,
        errorsService,
      );
      const context = createContext({
        method: 'POST',
        ip: '127.0.0.1',
        socket: {},
        originalUrl: '/api/auth/login',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(redis.incrWithExpire).toHaveBeenNthCalledWith(
        1,
        'rate-limit:api:ip:127.0.0.1',
        60,
      );
      expect(redis.incrWithExpire).toHaveBeenNthCalledWith(
        2,
        'rate-limit:auth:ip:127.0.0.1',
        60,
      );
    });

    it('does not rate-limit CORS preflight requests', async () => {
      const redis = createRedisMock();
      const guard = new ApiRateLimitGuard(
        redis as unknown as RedisService,
        envService,
        errorsService,
      );
      const context = createContext({
        method: 'OPTIONS',
        ip: '127.0.0.1',
        socket: {},
        originalUrl: '/api/auth/login',
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(redis.incrWithExpire).not.toHaveBeenCalled();
    });
  });
});
