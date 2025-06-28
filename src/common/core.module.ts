import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashService } from './hash/hash.service';
import { RedisService } from './redis/redis.service';
import { ErrorsHandlerService } from './errors-handler/errors-handler.service';
import { SensitiveInfoService } from './sensitive-info-service/sensitive-info.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    HashService,
    RedisService,
    ErrorsHandlerService,
    SensitiveInfoService,
  ],
  exports: [
    HashService,
    RedisService,
    ErrorsHandlerService,
    SensitiveInfoService,
  ],
})
export class CoreModule {}
