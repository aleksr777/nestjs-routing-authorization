import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HashPasswordService } from './hash-password/hash-password.service';
import { RedisService } from './redis/redis.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [HashPasswordService, RedisService],
  exports: [HashPasswordService, RedisService],
})
export class CoreModule {}
