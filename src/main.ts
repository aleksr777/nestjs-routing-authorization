import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { Application } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { EnvService } from './common/env-service/env.service';
import { SecurityConfigService } from './common/security-service/security-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const envService = app.get(EnvService);
  envService.validateVariables();

  const securityConfigService = app.get(SecurityConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as Application;
  expressApp.set('trust proxy', securityConfigService.getTrustProxyHops());

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: securityConfigService.shouldEnableHsts()
        ? {
            maxAge: 31_536_000,
            includeSubDomains: true,
          }
        : false,
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: securityConfigService.getFrontendOrigin(),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.setGlobalPrefix('api');

  const serverPort = envService.get('SERVER_PORT', 'number');
  await app.listen(serverPort);
  console.log(`Application is running on: http://localhost:${serverPort}/api`);
}

bootstrap().catch((err) => {
  console.error('Application failed to start:', err);
  process.exit(1);
});
