import { Injectable } from '@nestjs/common';
import { EnvService } from '../env-service/env.service';
import { ErrorsService } from '../errors-service/errors.service';

export type RefreshCookieSameSite = 'lax' | 'strict' | 'none';
export type TrustProxySetting = boolean | number | string;

@Injectable()
export class SecurityConfigService {
  constructor(
    private readonly envService: EnvService,
    private readonly errorsService: ErrorsService,
  ) {}

  getRefreshCookieSecure(): boolean {
    return this.envService.get('REFRESH_COOKIE_SECURE', 'boolean');
  }

  getRefreshCookieSameSite(): RefreshCookieSameSite {
    const value = this.envService
      .get('REFRESH_COOKIE_SAME_SITE')
      .trim()
      .toLowerCase();

    if (value === 'lax' || value === 'strict' || value === 'none') {
      return value;
    }

    this.errorsService.default(
      null,
      'Env var "REFRESH_COOKIE_SAME_SITE" must be one of: lax, strict, none.',
    );
  }

  getFrontendOrigin(): string {
    const frontendUrl = this.envService.get('FRONTEND_URL');

    try {
      return new URL(frontendUrl).origin;
    } catch {
      this.errorsService.default(
        null,
        'Env var "FRONTEND_URL" must be a valid absolute URL.',
      );
    }
  }

  getTrustProxy(): TrustProxySetting {
    const value = this.envService.get('TRUST_PROXY').trim();

    if (value === 'false') return false;

    if (value === 'true') {
      this.errorsService.default(
        null,
        'TRUST_PROXY=true is not allowed. Configure an exact proxy hop count, IP, subnet, or keep it false.',
      );
    }

    if (/^\d+$/.test(value)) {
      return Number.parseInt(value, 10);
    }

    return value;
  }

  isFrontendOrigin(origin: string | undefined): boolean {
    if (!origin) return false;

    try {
      return new URL(origin).origin === this.getFrontendOrigin();
    } catch {
      return false;
    }
  }

  validate(): void {
    const secure = this.getRefreshCookieSecure();
    const sameSite = this.getRefreshCookieSameSite();

    this.getFrontendOrigin();
    this.getTrustProxy();

    if (sameSite === 'none' && !secure) {
      this.errorsService.default(
        null,
        'REFRESH_COOKIE_SAME_SITE=none requires REFRESH_COOKIE_SECURE=true.',
      );
    }
  }
}
