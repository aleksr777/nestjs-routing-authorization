import { CookieOptions, Response } from 'express';
import { SecurityConfigService } from '../common/security/security-config.service';
import { AuthResponse, JwtTokens } from '../common/types/jwt-tokens.type';

const getRefreshCookieOptions = (
  securityConfig: SecurityConfigService,
  maxAge?: number,
): CookieOptions => ({
  httpOnly: true,
  secure: securityConfig.getRefreshCookieSecure(),
  sameSite: securityConfig.getRefreshCookieSameSite(),
  priority: 'high',
  path: '/api/auth',
  ...(maxAge !== undefined ? { maxAge } : {}),
});

export const setRefreshCookie = (
  res: Response,
  tokens: JwtTokens,
  securityConfig: SecurityConfigService,
): void => {
  const maxAge =
    typeof tokens.refresh_token_expires === 'number'
      ? Math.max(tokens.refresh_token_expires * 1000 - Date.now(), 0)
      : undefined;

  res.cookie(
    'refresh_token',
    tokens.refresh_token,
    getRefreshCookieOptions(securityConfig, maxAge),
  );
};

export const clearRefreshCookie = (
  res: Response,
  securityConfig: SecurityConfigService,
): void => {
  res.clearCookie('refresh_token', getRefreshCookieOptions(securityConfig));
};

export const getAuthResponse = (tokens: JwtTokens): AuthResponse => ({
  access_token: tokens.access_token,
  access_token_expires: tokens.access_token_expires,
});
