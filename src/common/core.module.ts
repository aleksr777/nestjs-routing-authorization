import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashService } from './hash-service/hash.service';
import { RedisService } from './redis-service/redis.service';
import { ErrorsHandlerService } from './errors-handler-service/errors-handler.service';
import { EnvService } from './env-service/env.service';
import { MailService } from './mail-service/mail.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    HashService,
    RedisService,
    ErrorsHandlerService,
    EnvService,
    MailService,
  ],
  exports: [
    HashService,
    RedisService,
    ErrorsHandlerService,
    EnvService,
    MailService,
  ],
})
export class CoreModule {}
