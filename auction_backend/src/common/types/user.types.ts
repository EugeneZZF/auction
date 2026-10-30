import { User } from '@prisma/client';

// Тип пользователя без пароля для API ответов
export type UserWithoutPassword = Omit<User, 'password'>;

// Тип для краткой информации о пользователе
export type UserInfo = Pick<
  User,
  'id' | 'email' | 'name' | 'balance' | 'bids' | 'role'
>;
