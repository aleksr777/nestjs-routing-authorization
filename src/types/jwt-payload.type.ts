export type JwtPayload = {
  sub: number; // ID пользователя (обязательное)
  email?: string; // Email (опционально)
  iat?: number; // Время создания токена
  exp: number; // Время истечения (обязательное)
  refreshTokenId?: string; // Для отслеживания refresh токенов
};
