import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashPasswordService } from './hash-password/hash-password.service';
import { RedisService } from './redis/redis.service';
import { ErrorsHandlerService } from './errors-handler/errors-handler.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [HashPasswordService, RedisService, ErrorsHandlerService],
  exports: [HashPasswordService, RedisService, ErrorsHandlerService],
})
export class CoreModule {}
