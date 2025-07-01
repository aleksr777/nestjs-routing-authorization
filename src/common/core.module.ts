import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashService } from './hash-service/hash.service';
import { RedisService } from './redis-service/redis.service';
import { ErrorsHandlerService } from './errors-handler-service/errors-handler.service';
import { EnvService } from './env-service/env.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [HashService, RedisService, ErrorsHandlerService, EnvService],
  exports: [HashService, RedisService, ErrorsHandlerService, EnvService],
})
export class CoreModule {}
