export type JwtPayload = {
  sub: number; // ID пользователя
  iat?: number; // Время создания токена
  exp?: number; // Время истечения
};
