import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TokensService } from './tokens.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [JwtModule.register({}), ConfigModule, RedisModule],
  providers: [TokensService],
  exports: [TokensService],
})
export class TokensModule {}
