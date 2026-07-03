export type JwtPayload = {
  sub: number; // User ID
  iat?: number; // Token issued at time
  exp?: number; // Token expiration time
};
