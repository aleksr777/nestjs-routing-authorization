import { Injectable } from '@nestjs/common';
import { CookieOptions } from 'express';
import { EnvService } from '../env-service/env.service';
import { ErrorsService } from '../errors-service/errors.service';

const REFRESH_COOKIE_PATH = '/api/auth';
const ALLOWED_SAME_SITE_VALUES = ['lax', 'strict', 'none'] as const;

type RefreshCookieSameSite = (typeof ALLOWED_SAME_SITE_VALUES)[number];

@Injectable()
export class SecurityConfigService {
  private readonly frontendOrigin: string;
  private readonly refreshCookieSecure: boolean;
  private readonly refreshCookieSameSite: RefreshCookieSameSite;
  private readonly trustProxyHops: number;

  constructor(
    private readonly envService: EnvService,
    private readonly errorsService: ErrorsService,
  ) {
    this.frontendOrigin = this.parseFrontendOrigin(
      this.envService.get('FRONTEND_URL'),
    );
    this.refreshCookieSecure = this.envService.get(
      'REFRESH_COOKIE_SECURE',
      'boolean',
    );
    this.refreshCookieSameSite = this.parseSameSite(
      this.envService.get('REFRESH_COOKIE_SAME_SITE'),
    );
    this.trustProxyHops = this.parseTrustProxyHops(
      this.envService.get('TRUST_PROXY_HOPS', 'number'),
    );

    if (this.refreshCookieSameSite === 'none' && !this.refreshCookieSecure) {
      this.errorsService.default(
        null,
        'REFRESH_COOKIE_SECURE must be true when REFRESH_COOKIE_SAME_SITE is none.',
      );
    }
  }

  private parseFrontendOrigin(value: string): string {
    try {
      return new URL(value).origin;
    } catch {
      this.errorsService.default(null, 'FRONTEND_URL must be a valid URL.');
    }
  }

  private parseSameSite(value: string): RefreshCookieSameSite {
    const normalized = value.trim().toLowerCase();
    if (
      ALLOWED_SAME_SITE_VALUES.includes(
        normalized as RefreshCookieSameSite,
      )
    ) {
      return normalized as RefreshCookieSameSite;
    }

    this.errorsService.default(
      null,
      'REFRESH_COOKIE_SAME_SITE must be lax, strict, or none.',
    );
  }

  private parseTrustProxyHops(value: number): number {
    if (!Number.isInteger(value) || value < 0) {
      this.errorsService.default(
        null,
        'TRUST_PROXY_HOPS must be a non-negative integer.',
      );
    }
    return value;
  }

  getTrustProxyHops(): number {
    return this.trustProxyHops;
  }

  shouldEnableHsts(): boolean {
    return this.refreshCookieSecure;
  }

  getRefreshCookieOptions(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.refreshCookieSecure,
      sameSite: this.refreshCookieSameSite,
      path: REFRESH_COOKIE_PATH,
      ...(maxAge !== undefined ? { maxAge } : {}),
    };
  }

  assertAllowedOrigin(origin: string | undefined): void {
    if (!origin || origin !== this.frontendOrigin) {
      this.errorsService.forbidden('Request origin is not allowed.');
    }
  }
}
