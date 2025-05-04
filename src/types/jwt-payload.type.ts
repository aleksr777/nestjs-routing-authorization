export type JwtPayload = {
  sub: number; // ID пользователя
  email?: string; // Email
  iat?: number; // Время создания токена
  exp?: number; // Время истечения
  refreshTokenId?: string; // Для отслеживания refresh токенов
};
