import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { HashPasswordService } from '../auth/hash-password.service';
import { TokensModule } from '../tokens/tokens.module';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User]), TokensModule],
  controllers: [UsersController],
  providers: [UsersService, HashPasswordService],
  exports: [UsersService],
})
export class UsersModule {}
