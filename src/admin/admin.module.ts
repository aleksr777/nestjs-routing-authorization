import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminTransferService } from './admin-transfer.service';
import { AdminController } from './admin.controller';
import { AdminTransferSecureController } from './admin-transfer.secure.controller';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [AdminController, AdminTransferSecureController],
  providers: [AdminService, AdminTransferService],
})
export class AdminModule {}
