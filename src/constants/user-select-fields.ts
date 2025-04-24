export const USER_PUBLIC_FIELDS = [
  'id',
  'nickname',
  'age',
  'gender',
  'about',
] as const;

export const USER_PROFILE_FIELDS = [
  ...USER_PUBLIC_FIELDS,
  'email',
  'phoneNumber',
] as const;

export const USER_AUTH_FIELDS = [
  ...USER_PUBLIC_FIELDS,
  'email',
  'phoneNumber',
  'password',
] as const;
