import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from '../common/core.module';
import { PassportModule } from '@nestjs/passport';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthService } from './auth.service';
import { RegistrationService } from './registration.service';
import { PasswordResetService } from './password-reset.service';
import { TokensService } from './tokens.service';
import { EnvService } from '../common/env-service/env.service';
import { AuthController } from './auth.controller';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [CoreModule],
      inject: [EnvService],
      useFactory: (envService: EnvService) => ({
        secret: envService.get('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: envService.get('JWT_ACCESS_EXPIRES_IN'),
        },
      }),
    }),
  ],
  providers: [
    AuthService,
    RegistrationService,
    PasswordResetService,
    LocalStrategy,
    JwtStrategy,
    JwtRefreshStrategy,
    TokensService,
  ],
  controllers: [AuthController],
  exports: [AuthService, TokensService],
})
export class AuthModule {}
