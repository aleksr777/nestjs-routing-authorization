import { Injectable } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsHandlerService } from '../common/errors-handler-service/errors-handler.service';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  USER_PROFILE_FIELDS,
  USER_PASSWORD,
  USER_SECRET_FIELDS,
} from '../config/user-select-fields.constants';

@Injectable()
export class AuthService {
  config: any;
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly tokensService: TokensService,
    private readonly hashService: HashService,
    private readonly errorsHandlerService: ErrorsHandlerService,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
  ) {}

  removeSensitiveInfo<T extends object, K extends keyof T>(
    source: T | T[],
    keysToRemove: readonly K[],
  ): Omit<T, K> | Omit<T, K>[] {
    const remove = (item: T): Omit<T, K> => {
      const result = { ...item } as Partial<T>;
      for (const key of keysToRemove) {
        delete result[key];
      }
      return result as Omit<T, K>;
    };
    if (Array.isArray(source)) {
      return source.map(remove);
    } else {
      return remove(source);
    }
  }

  async validateUserByEmailAndPassword(email: string, password: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, USER_PASSWORD],
      });
      const isPasswordValid = await this.hashService.compare(
        password,
        user.password,
      );
      this.errorsHandlerService.handleInvalidEmailOrPassword(
        null,
        isPasswordValid,
      );
      return this.removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
    } catch (err: unknown) {
      this.errorsHandlerService.handleInvalidEmailOrPassword(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async validateUserById(id: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: ['id'],
      });
      return this.removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
    } catch (err: unknown) {
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleDefaultError();
      throw err;
    }
  }

  async validateUserByRefreshToken(id: number, refresh_token: string) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS, 'refresh_token'],
      });
      const isTokensMatch = refresh_token === user.refresh_token;
      if (!isTokensMatch) {
        return this.errorsHandlerService.handleInvalidToken();
      }
      return this.removeSensitiveInfo(user, [USER_PASSWORD]);
    } catch (err: unknown) {
      this.errorsHandlerService.handleInvalidToken(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async register(dto: CreateUserDto) {
    const hashedPassword = await this.hashService.hash(dto.password);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = queryRunner.manager.create(User, {
        ...dto,
        password: hashedPassword,
      });
      const savedUser = await queryRunner.manager.save(user);
      const tokens = this.tokensService.generateTokens(savedUser.id);
      await queryRunner.manager.update(User, savedUser.id, {
        refresh_token: tokens.refresh_token,
      });
      await queryRunner.commitTransaction();
      return tokens;
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      this.errorsHandlerService.handleUserConflict(err);
      this.errorsHandlerService.handleDefaultError();
    } finally {
      await queryRunner.release();
    }
  }

  async login(userId: number) {
    try {
      const tokens = this.tokensService.generateTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch {
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async logout(userId: number, access_token: string | undefined) {
    if (!access_token) {
      return this.errorsHandlerService.handleTokenNotDefined();
    }
    try {
      await this.tokensService.removeRefreshToken(userId);
      await this.tokensService.addToBlacklist(access_token);
    } catch (err: unknown) {
      this.errorsHandlerService.handleInvalidToken(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async refreshTokens(userId: number) {
    try {
      const tokens = this.tokensService.generateTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch (err: unknown) {
      this.errorsHandlerService.handleInvalidToken(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async requestPasswordReset(email: string) {
    try {
      const user = await this.usersRepository.findOne({
        where: { email },
        select: ['id'],
      });
      if (user) {
        const token = this.tokensService.generateResetToken();
        await this.tokensService.saveResetToken(user.id, token);
        const resetUrl = `${this.envService.getEnv('FRONTEND_URL')}/reset-password?token=${token}`;
        const text = `This is an automated message, please do not reply! Follow this link to reset your password: ${resetUrl}`;
        const html = `
          <p style="font-weight: bold; font-size: 17px;">This is an automated message, please do not reply! Follow this link to reset your password:</p>
          <p style="font-weight: bold; font-size: 17px;">
            <a href="${resetUrl}" style="font-weight: bold;">${token}</a>
          </p>`;
        await this.mailService.sendMail(email, `Password recovery`, text, html);
      }
      return {
        message: 'If the email exists, we’ve sent you a password reset link.',
      };
    } catch {
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const userId = await this.tokensService.getUserIdByResetToken(token);
      if (!userId) {
        this.errorsHandlerService.handleExpiredOrInvalidResetToken();
        return;
      }
      const hashedPassword = await this.hashService.hash(newPassword);
      const result = await this.usersRepository.update(
        { id: userId },
        { password: hashedPassword },
      );
      if (result.affected === 0) {
        this.errorsHandlerService.handleUserNotFound();
      }
      await this.tokensService.deleteResetToken(token);
      return { message: 'Password successfully reset!' };
    } catch (err: unknown) {
      this.errorsHandlerService.handleResetPassword(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }
}
