import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CoreModule } from './common/core.module';
import { AdminModule } from './admin/admin.module';
import { EnvService } from './common/env-service/env.service';
import { User } from './users/entities/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [CoreModule],
      inject: [EnvService],
      useFactory: (envService: EnvService) => ({
        type: 'postgres',
        host: envService.getEnv('DB_HOST'),
        port: envService.getEnv('DB_PORT', 'number'),
        database: envService.getEnv('DB_NAME'),
        username: envService.getEnv('DB_USERNAME'),
        password: envService.getEnv('DB_PASSWORD'),
        entities: [User],
        synchronize: envService.getEnv('DB_TYPEORM_SYNC', 'boolean'),
      }),
    }),
    AuthModule,
    UsersModule,
    CoreModule,
    AdminModule,
  ],
})
export class AppModule {}
