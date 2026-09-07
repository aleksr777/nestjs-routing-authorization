import { CookieOptions, Response } from 'express';
import { AuthResponse, JwtTokens } from '../common/types/jwt-tokens.type';

const getRefreshCookieOptions = (maxAge?: number): CookieOptions => ({
  httpOnly: true,
  secure: false,
  sameSite: 'lax',
  path: '/api/auth',
  ...(maxAge !== undefined ? { maxAge } : {}),
});

export const setRefreshCookie = (res: Response, tokens: JwtTokens): void => {
  const maxAge =
    typeof tokens.refresh_token_expires === 'number'
      ? Math.max(tokens.refresh_token_expires * 1000 - Date.now(), 0)
      : undefined;

  res.cookie(
    'refresh_token',
    tokens.refresh_token,
    getRefreshCookieOptions(maxAge),
  );
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie('refresh_token', getRefreshCookieOptions());
};

export const getAuthResponse = (tokens: JwtTokens): AuthResponse => ({
  access_token: tokens.access_token,
  access_token_expires: tokens.access_token_expires,
});
