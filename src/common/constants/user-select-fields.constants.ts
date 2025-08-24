export const ID = 'id';
export const NICKNAME = 'nickname';
export const LAST_ACTIVITY_AT = 'last_activity_at';
export const CREATED_AT = 'created_at';
export const UPDATED_AT = 'updated_at';
export const EMAIL = 'email';
export const PHONE_NUMBER = 'phone_number';
export const ROLE = 'role';
export const USER_PASSWORD = 'password';
export const USER_REFRESH_TOKEN = 'refresh_token';

export const USER_SEARCHABLE_FIELDS = [NICKNAME, EMAIL, PHONE_NUMBER] as const;

export const USER_PUBLIC_FIELDS = [ID, NICKNAME, LAST_ACTIVITY_AT] as const;

export const USER_CONFIDENTIAL_FIELDS = [
  CREATED_AT,
  UPDATED_AT,
  EMAIL,
  PHONE_NUMBER,
  ROLE,
] as const;

export const USER_SECRET_FIELDS = [USER_PASSWORD, USER_REFRESH_TOKEN] as const;

export const USER_PROFILE_FIELDS = [
  ...USER_PUBLIC_FIELDS,
  ...USER_CONFIDENTIAL_FIELDS,
] as const;
