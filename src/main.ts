import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { EnvService } from './common/env-service/env.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const envService = app.get(EnvService);
  envService.validateVariables();

  // Global DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Automatically removes properties not defined in the DTO
      forbidNonWhitelisted: true, // Throws an error if extra properties are present
      transform: true, // Automatically transforms payloads to the expected types (e.g., string -> number)
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  const serverPort = envService.get('SERVER_PORT', 'number');

  // Start app
  await app.listen(serverPort);
  console.log(`Application is running on: http://localhost:${serverPort}/api`);
}

bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
