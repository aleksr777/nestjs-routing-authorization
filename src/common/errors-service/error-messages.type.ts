export enum ErrMsg {
  INTERNAL_SERVER_ERROR = 'Internal server error.',

  ACCESS_TOKEN_IS_BLACKLISTED = 'Access token is blacklisted.',
  INVALID_EMAIL_OR_PASSWORD = 'Invalid email or password.',

  TOKEN_NOT_DEFINED = 'Token is not defined.',
  ACCESS_TOKEN_NOT_DEFINED = 'Access token is not defined.',
  REFRESH_TOKEN_NOT_DEFINED = 'Refresh token is not defined.',

  ADMIN_TRANSFER_CODE_NOT_DEFINED = 'Admin transfer code is not defined.',
  RESET_CODE_NOT_DEFINED = 'Reset code is not defined.',
  REGISTRATION_CODE_NOT_DEFINED = 'Registration code is not defined.',
  EMAIL_CHANGE_CODE_NOT_DEFINED = 'Email change code is not defined.',
  PASSWORD_CHANGE_CODE_NOT_DEFINED = 'Password change code is not defined.',

  INVALID_TOKEN = 'Invalid token.',
  INVALID_ACCESS_TOKEN = 'Access token is expired or invalid.',
  INVALID_REFRESH_TOKEN = 'Refresh token is expired or invalid.',

  INVALID_ADMIN_TRANSFER_CODE = 'Admin transfer code is expired or invalid. Please request a new one.',
  INVALID_RESET_CODE = 'Reset code is expired or invalid. Please request a new one.',
  INVALID_REGISTRATION_CODE = 'Registration code is expired or invalid. Please request a new one.',
  INVALID_EMAIL_CHANGE_CODE = 'Invalid email change code is expired or invalid. Please request a new one.',
  INVALID_PASSWORD_CHANGE_CODE = 'Invalid password change code is expired or invalid. Please request a new one.',

  USER_NOT_FOUND = 'User was not found in the database.',
  ADMIN_NOT_FOUND = 'Admin was not found in the database.',
  CONFLICT_USER_EXISTS = 'A user with such unique data already exists in the database.',
  INSUFFICIENT_ACCESS_RIGHTS = 'The current user has insufficient access rights.',
  AUTHORIZED = 'User is not authorized.',
  ACCOUNT_BLOCKED = 'Account has been blocked by the administrator.',

  ONLY_ADMINISTRATOR_TRANSFER = 'Only administrator can initiate a transfer.',
  CURRENT_USER_BLOCKED = 'Current user is blocked.',
  TARGET_USER_BLOCKED = 'Target user is blocked.',
  TARGET_USER_ALREADY_ADMINISTRATOR = 'Target user is already an administrator.',
  TRANSFER_FAILED = 'Transfer failed.',
  INITIATOR_IS_NO_ADMINISTRATOR = 'Initiator is no longer an administrator.',
  TOKEN_NOT_ISSUED_FOR_CURRENT_USER = 'Token not issued for current user',
  ADMIN_CANNOT_TRANSFER_THEMSELVES = 'Admin cannot transfer rights to themselves.',

  SERVICE_EMAIL_MATCH_USER_EMAIL = `The service mail must not match the user's email.`,
  NEW_EMAIL_MATCH_USER_EMAIL = 'The new email must not be the same as the current one.',

  NEW_PASSWORD_MUST_DIFFER = 'New password must differ from old.',
  OLD_PASSWORD_IS_INCORRECT = 'Old password is incorrect',

  NO_FIELDS_FOR_UPDATE = 'No fields provided for update.',
  FIELDS_CANNOT_BE_UPDATED = 'Some fields cannot be updated in this way.',
  FIELDS_CANNOT_BE_EMPTY = 'Some fields cannot be empty.',
}
