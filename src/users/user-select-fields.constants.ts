export const USER_PUBLIC_FIELDS = [
  'id',
  'nickname',
  'last_activity_at',
] as const;

export const USER_CONFIDENTIAL_FIELDS = [
  'created_at',
  'updated_at',
  'email',
  'phone_number',
  'role',
] as const;

export const USER_PASSWORD = 'password';
export const USER_REFRESH_TOKEN = 'refresh_token';

export const USER_SECRET_FIELDS = [USER_PASSWORD, USER_REFRESH_TOKEN] as const;

export const USER_PROFILE_FIELDS = [
  ...USER_PUBLIC_FIELDS,
  ...USER_CONFIDENTIAL_FIELDS,
] as const;
