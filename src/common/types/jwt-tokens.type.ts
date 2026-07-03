export type JwtPayload = {
  sub: number; // User ID
  iat?: number; // Token issued at time
  exp?: number; // Token expiration time
};

export type JwtTokens = {
  access_token: string;
  refresh_token: string;
  access_token_expires: number | null;
  refresh_token_expires: number | null;
};

export type AuthResponse = {
  access_token: string;
  access_token_expires: number | null;
};
