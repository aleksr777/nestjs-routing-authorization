export enum ErrTextAuth {
  INVALID_TOKEN_MISSING_EXP = 'Invalid token: missing expiration time',
  INVALID_REFRESH_TOKEN = 'Invalid refresh token',
  INVALID_EMAIL_OR_PASSWORD = 'Invalid email or password',
  REFRESH_TOKEN_MISMATCH = 'Refresh token does not match stored token',
}

export enum ErrTextUsers {
  USER_NOT_FOUND = 'User was not found in the database!',
  CONFLICT_USER_EXISTS = 'A user with such unique data already exists in the database!',
  ACCESS_DENIED = 'The current user has insufficient access rights!',
  UNAUTHORIZED = 'User is not authorized',
}

export const textServerError = 'Internal server error!';
