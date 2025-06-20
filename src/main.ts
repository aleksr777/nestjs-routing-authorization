import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENV_VARIABLES } from './constants/env-variables';
import { validateEnvVariables } from './utils/validate-env.util';

async function bootstrap() {
  validateEnvVariables(ENV_VARIABLES);

  const app = await NestFactory.create(AppModule);

  // Global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically removes properties not defined in the DTO
      forbidNonWhitelisted: true, // Throws an error if extra properties are present
      transform: true, // Automatically transforms payloads to the expected types (e.g., string -> number)
    }),
  );

  app.setGlobalPrefix('api');

  const configService = app.get(ConfigService);

  const serverPort = parseInt(
    configService.getOrThrow<string>('SERVER_PORT'),
    10,
  );

  // Start app
  await app.listen(serverPort);
  console.log(`Application is running on: http://localhost:${serverPort}/api`);
}

bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
