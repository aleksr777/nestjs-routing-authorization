import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashService } from './hash/hash.service';
import { RedisService } from './redis/redis.service';
import { ErrorsHandlerService } from './errors-handler/errors-handler.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [HashService, RedisService, ErrorsHandlerService],
  exports: [HashService, RedisService, ErrorsHandlerService],
})
export class CoreModule {}
