export const USER_PUBLIC_FIELDS = [
  'id',
  'nickname',
  'age',
  'gender',
  'about',
] as const;

export const USER_AUTH_FIELDS = [
  ...USER_PUBLIC_FIELDS,
  'password',
  'email',
] as const;
