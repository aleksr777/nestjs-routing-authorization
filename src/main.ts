import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateEnvVariables } from './utils/validate-env.util';

async function bootstrap() {
  validateEnvVariables([
    'SERVER_PORT',
    'FRONTEND_URL',
    'DB_TYPE',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_SCHEMA',
    'DB_USERNAME',
    'DB_PASSWORD',
    'DB_TYPEORM_SYNC',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
  ]);

  const app = await NestFactory.create(AppModule);

  // Глобальная валидация DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Автоматически удаляет поля, не описанные в DTO
      forbidNonWhitelisted: true, // Возвращает ошибку, если есть лишние поля
      transform: true, // Автоматически преобразует типы (например, string -> number)
    }),
  );

  app.setGlobalPrefix('api');

  const configService = app.get(ConfigService);

  const serverPort = parseInt(configService.get<string>('SERVER_PORT', ''), 10);

  // Запуск приложения
  await app.listen(serverPort);
  console.log(`Application is running on: http://localhost:${serverPort}/api`);
}

bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
