import { InternalServerErrorException } from '@nestjs/common';
import { EnvService } from '../env-service/env.service';
import { ErrorsService } from '../errors-service/errors.service';
import { SecurityConfigService } from './security-config.service';

type TestEnv = Record<string, string>;

const createService = (values: TestEnv) => {
  const envService = {
    get: jest.fn(
      (
        key: string,
        type: 'string' | 'number' | 'boolean' = 'string',
      ): string | number | boolean => {
        const value = values[key];
        if (value === undefined) throw new Error(`Missing test env: ${key}`);
        if (type === 'boolean') return value === 'true';
        if (type === 'number') return Number(value);
        return value;
      },
    ),
  } as unknown as EnvService;

  return new SecurityConfigService(envService, new ErrorsService());
};

describe('SecurityConfigService', () => {
  it('accepts local development security settings', () => {
    const service = createService({
      FRONTEND_URL: 'http://localhost:5173/app',
      REFRESH_COOKIE_SECURE: 'false',
      REFRESH_COOKIE_SAME_SITE: 'lax',
      TRUST_PROXY: 'false',
    });

    expect(() => service.validate()).not.toThrow();
    expect(service.getRefreshCookieSecure()).toBe(false);
    expect(service.getRefreshCookieSameSite()).toBe('lax');
    expect(service.getFrontendOrigin()).toBe('http://localhost:5173');
    expect(service.getTrustProxy()).toBe(false);
    expect(service.isFrontendOrigin('http://localhost:5173')).toBe(true);
  });

  it('accepts cross-site secure cookies behind an exact proxy hop count', () => {
    const service = createService({
      FRONTEND_URL: 'https://app.example.com',
      REFRESH_COOKIE_SECURE: 'true',
      REFRESH_COOKIE_SAME_SITE: 'none',
      TRUST_PROXY: '1',
    });

    expect(() => service.validate()).not.toThrow();
    expect(service.getRefreshCookieSecure()).toBe(true);
    expect(service.getRefreshCookieSameSite()).toBe('none');
    expect(service.getTrustProxy()).toBe(1);
  });

  it('rejects SameSite=None without Secure cookies', () => {
    const service = createService({
      FRONTEND_URL: 'https://app.example.com',
      REFRESH_COOKIE_SECURE: 'false',
      REFRESH_COOKIE_SAME_SITE: 'none',
      TRUST_PROXY: 'false',
    });

    expect(() => service.validate()).toThrow(InternalServerErrorException);
  });

  it('rejects trusting arbitrary forwarded client IP values', () => {
    const service = createService({
      FRONTEND_URL: 'https://app.example.com',
      REFRESH_COOKIE_SECURE: 'true',
      REFRESH_COOKIE_SAME_SITE: 'lax',
      TRUST_PROXY: 'true',
    });

    expect(() => service.validate()).toThrow(InternalServerErrorException);
  });
});
