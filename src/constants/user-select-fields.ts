export const USER_PUBLIC_FIELDS = [
  'id',
  'nickname',
  'age',
  'gender',
  'about',
] as const;

export const USER_PROFILE_FIELDS = [
  ...USER_PUBLIC_FIELDS,
  'created_at',
  'updated_at',
  'email',
  'phone_number',
] as const;
