import { User } from '../users/entities/user.entity';

export type PublicUser = Omit<
  User,
  'password' | 'validatePassword' | 'createdAt' | 'updatedAt'
>;
