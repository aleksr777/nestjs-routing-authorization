export enum ErrMessages {
  INTERNAL_SERVER_ERROR = 'Internal server error.',

  ACCESS_TOKEN_IS_BLACKLISTED = 'Access token is blacklisted.',
  INVALID_EMAIL_OR_PASSWORD = 'Invalid email or password.',

  TOKEN_NOT_DEFINED = 'Token is not defined.',
  ACCESS_TOKEN_NOT_DEFINED = 'Access token is not defined.',
  REFRESH_TOKEN_NOT_DEFINED = 'Refresh token is not defined.',
  RESET_TOKEN_NOT_DEFINED = 'Reset token is not defined.',
  REGISTRATION_TOKEN_NOT_DEFINED = 'Registration token is not defined.',
  ADMIN_TRANSFER_TOKEN_NOT_DEFINED = 'Admin transfer token is not defined.',

  INVALID_TOKEN = 'Invalid token.',
  INVALID_ACCESS_TOKEN = 'Access token is expired or invalid.',
  INVALID_REFRESH_TOKEN = 'Refresh token is expired or invalid.',
  INVALID_RESET_TOKEN = 'Reset token is expired or invalid. Please request a new one.',
  INVALID_REGISTRATION_TOKEN = 'Registration token is expired or invalid. Please request a new one.',
  INVALID_ADMIN_TRANSFER_TOKEN = 'Admin transfer token is expired or invalid. Please request a new one.',

  USER_NOT_FOUND = 'User was not found in the database.',
  CONFLICT_USER_EXISTS = 'A user with such unique data already exists in the database.',
  INSUFFICIENT_ACCESS_RIGHTS = 'The current user has insufficient access rights.',
  AUTHORIZED = 'User is not authorized.',
  ACCOUNT_BLOCKED = 'Account has been blocked by the administrator.',

  ONLY_ADMINISTRATOR_TRANSFER = 'Only administrator can initiate a transfer.',
  TARGET_USER_BLOCKED = 'Target user is blocked.',
  TARGET_USER_ALREADY_ADMINISTRATOR = 'Target user is already an administrator.',
  TRANSFER_FAILED = 'Transfer failed.',
  INITIATOR_IS_NO_ADMINISTRATOR = 'Initiator is no longer an administrator.',
  TOKEN_NOT_ISSUED_FOR_CURRENT_USER = 'Token not issued for current user',
  ADMIN_CANNOT_TRANSFER_THEMSELVES = 'Admin cannot transfer rights to themselves.',
}
