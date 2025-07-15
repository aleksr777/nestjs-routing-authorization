export enum ErrMessages {
  INTERNAL_SERVER_ERROR = 'Internal server error!',

  TOKEN_NOT_DEFINED = 'Token is not defined!',
  INVALID_TOKEN = 'Invalid token',
  INVALID_RESET_TOKEN = 'The reset token is expired or invalid! Please request a new one.',
  TOKEN_IS_BLACKLISTED = 'Token is blacklisted',
  INVALID_EMAIL_OR_PASSWORD = 'Invalid email or password!',

  USER_NOT_FOUND = 'User was not found in the database!',
  CONFLICT_USER_EXISTS = 'A user with such unique data already exists in the database!',
  INSUFFICIENT_ACCESS_RIGHTS = 'The current user has insufficient access rights!',
  AUTHORIZED = 'User is not authorized!',
}
