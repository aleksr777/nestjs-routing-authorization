import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashService } from './hash-service/hash.service';
import { RedisService } from './redis-service/redis.service';
import { ErrorsService } from './errors-service/errors.service';
import { EnvService } from './env-service/env.service';
import { MailService } from './mail-service/mail.service';
import { NicknameGeneratorService } from './nickname-generator-service/nickname-generator.service';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityModule } from '../activity/activity.module';
import { ActivityInterceptor } from '../activity/activity.interceptor';

@Global()
@Module({
  imports: [ConfigModule, ScheduleModule.forRoot(), ActivityModule],
  providers: [
    HashService,
    RedisService,
    ErrorsService,
    EnvService,
    MailService,
    NicknameGeneratorService,
    { provide: APP_INTERCEPTOR, useClass: ActivityInterceptor },
  ],
  exports: [
    HashService,
    RedisService,
    ErrorsService,
    EnvService,
    MailService,
    NicknameGeneratorService,
  ],
})
export class CoreModule {}
