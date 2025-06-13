export enum ErrTextAuth {
  TOKEN_NOT_DEFINED = 'Token is not defined',
  INVALID_TOKEN = 'Invalid token',
  INVALID_EMAIL_OR_PASSWORD = 'Invalid email or password',
}

export enum ErrTextUsers {
  USER_NOT_FOUND = 'User was not found in the database!',
  CONFLICT_USER_EXISTS = 'A user with such unique data already exists in the database!',
  INSUFFICIENT_ACCESS_RIGHTS = 'The current user has insufficient access rights!',
  AUTHORIZED = 'User is not authorized',
}

export const INTERNAL_SERVER_ERROR = 'Internal server error!';
