export const ID = 'id';
export const NICKNAME = 'nickname';
export const EMAIL = 'email';
export const PHONE_NUMBER = 'phone_number';

export const NAME = 'name';
export const AGE = 'age';

export const ROLE = 'role';
export const PASSWORD = 'password';
export const REFRESH_TOKEN = 'refresh_token';

export const LAST_ACTIVITY_AT = 'last_activity_at';
export const CREATED_AT = 'created_at';
export const UPDATED_AT = 'updated_at';

export const IS_BLOCKED = 'is_blocked';
export const BLOCKED_AT = 'blocked_at';
export const BLOCKED_BY = 'blocked_by';
export const BLOCKED_REASON = 'blocked_reason';

export const USER_SEARCHABLE_FIELDS = [
  NAME,
  NICKNAME,
  EMAIL,
  PHONE_NUMBER,
] as const;

export const IS_BLOCKED_FIELDS = [
  IS_BLOCKED,
  BLOCKED_AT,
  BLOCKED_BY,
  BLOCKED_REASON,
] as const;

export const USER_PUBLIC_FIELDS = [
  ID,
  NICKNAME,
  NAME,
  AGE,
  LAST_ACTIVITY_AT,
] as const;

export const USER_CONFIDENTIAL_FIELDS = [
  CREATED_AT,
  UPDATED_AT,
  EMAIL,
  PHONE_NUMBER,
  ROLE,
] as const;

export const USER_SECRET_FIELDS = [PASSWORD, REFRESH_TOKEN] as const;

export const USER_PROFILE_FIELDS = [
  ...USER_PUBLIC_FIELDS,
  ...USER_CONFIDENTIAL_FIELDS,
] as const;

export const ADMIN_FIELDS = [
  ...USER_PROFILE_FIELDS,
  ...IS_BLOCKED_FIELDS,
] as const;

export const USER_UNIQUE_FIELDS = [NICKNAME, PHONE_NUMBER, EMAIL] as const;

export const SPECIAL_UPDATE_FIELDS = [
  ID,
  EMAIL,
  PHONE_NUMBER,
  LAST_ACTIVITY_AT,
  CREATED_AT,
  UPDATED_AT,
  ROLE,
  ...IS_BLOCKED_FIELDS,
  ...USER_SECRET_FIELDS,
] as const;
