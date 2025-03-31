import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
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

  const serverPort = configService.get<number>('SERVER_PORT');
  if (!serverPort) {
    throw new Error('Server port is not defined!');
  }

  // Запуск приложения
  await app.listen(serverPort);
  console.log(`Application is running on: http://localhost:${serverPort}/api`);
}
bootstrap();
