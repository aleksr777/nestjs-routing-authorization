import { Injectable } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsHandlerService } from '../common/errors-handler-service/errors-handler.service';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { NicknameGeneratorService } from '../common/nickname-generator-service/nickname-generator.service';
import { User } from '../users/entities/user.entity';
import {
  ID,
  ROLE,
  IS_BLOCKED,
  USER_PROFILE_FIELDS,
  USER_PASSWORD,
  USER_REFRESH_TOKEN,
  BLOCKED_REASON,
} from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class AuthService {
  config: any;
  private readonly frontendUrl: string;
  private readonly registrationExpiresIn: number;
  private readonly resetExpiresIn: number;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly tokensService: TokensService,
    private readonly hashService: HashService,
    private readonly errorsHandlerService: ErrorsHandlerService,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
    private readonly nicknameGeneratorService: NicknameGeneratorService,
  ) {
    this.frontendUrl = this.envService.get('FRONTEND_URL');
    this.registrationExpiresIn =
      this.envService.get('REGISTRATION_TOKEN_EXPIRES_IN', 'number') / 60;
    this.resetExpiresIn =
      this.envService.get('RESET_TOKEN_EXPIRES_IN', 'number') / 60;
  }

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

  isUserBlocked(user: User) {
    if (user.is_blocked) {
      this.errorsHandlerService.accountBlocked(user.blocked_reason);
    }
  }

  async validateUserByEmailAndPassword(email: string, password: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [
          ...USER_PROFILE_FIELDS,
          USER_PASSWORD,
          IS_BLOCKED,
          BLOCKED_REASON,
        ],
      });
      const isPasswordValid = await this.hashService.compare(
        password,
        user.password,
      );
      this.errorsHandlerService.invalidEmailOrPassword(null, isPasswordValid);
      return user;
    } catch (err: unknown) {
      this.errorsHandlerService.invalidEmailOrPassword(err);
      this.errorsHandlerService.default(err);
    }
  }

  async validateUserById(id: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [ID, ROLE, IS_BLOCKED, BLOCKED_REASON],
      });
      return user;
    } catch (err: unknown) {
      this.errorsHandlerService.userNotFound(err);
      this.errorsHandlerService.default(err);
      throw err;
    }
  }

  async validateUserByRefreshToken(id: number, refresh_token: string) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [
          ...USER_PROFILE_FIELDS,
          USER_REFRESH_TOKEN,
          IS_BLOCKED,
          BLOCKED_REASON,
        ],
      });
      const isTokensMatch = refresh_token === user.refresh_token;
      if (!isTokensMatch) {
        return this.errorsHandlerService.invalidToken(null, TokenType.REFRESH);
      }
      return user;
    } catch (err: unknown) {
      this.errorsHandlerService.invalidToken(err, TokenType.REFRESH);
      this.errorsHandlerService.default(err);
    }
  }

  async requestRegistration(email: string, password: string) {
    try {
      const user = await this.usersRepository.findOne({
        where: { email },
        select: [ID],
      });
      if (user) {
        const resetUrl = `${this.frontendUrl}/reset-password?email=${encodeURIComponent(email)}`;
        const text = `Hi, this is an automated message, please do not reply! It looks like there is already an account associated with this email address. If you’ve forgotten your password, you can reset it by clicking the link below: ${resetUrl}`;
        const html = `
          <p style="font-weight: bold; font-size: 17px;">Hi, this is an automated message, please do not reply!</p>
          <p style="font-weight: bold; font-size: 17px;">It looks like there is already an account associated with this email address.</p>
          <p style="font-weight: bold; font-size: 17px;">If you’ve forgotten your password, you can reset it by clicking the link below:</p>
          <p style="font-weight: bold; font-size: 17px;">
              <a href="${resetUrl}" style="font-weight: bold;">${resetUrl}</a>
          </p>
          <p style="font-weight: bold; font-size: 17px;">If you didn’t request this, you can safely ignore this email.</p>
          <p style="font-weight: bold; font-size: 17px;">Best regards,<br>Your App Team</p>
        `;
        await this.mailService.send(email, `Password recovery`, text, html);
      } else {
        const token = this.tokensService.generateVerificationToken();
        const hashedPassword = await this.hashService.hash(password);
        const redisValue = { email: email, password: hashedPassword };
        await this.tokensService.saveRegistrationToken(token, redisValue);
        const confirmUrl = `${this.frontendUrl}/confirm-registration?token=${token}`;
        const text = `Hi, this is an automated message, please do not reply! You can confirm your registration by clicking the link below (within ${this.registrationExpiresIn} min): ${confirmUrl}`;
        const html = `
          <p style="font-weight: bold; font-size: 17px;">Hi, this is an automated message, please do not reply!</p>
          <p style="font-weight: bold; font-size: 17px;">You can confirm your registration by clicking the link below (within ${this.registrationExpiresIn} min):</p>
          <p style="font-weight: bold; font-size: 17px;">          
            <a href="${confirmUrl}" style="font-weight: bold;">${confirmUrl}</a>
          </p>
          <p style="font-weight: bold; font-size: 17px;">If you didn’t request this, you can safely ignore this email.</p>
          <p style="font-weight: bold; font-size: 17px;">Best regards,<br>Your App Team</p>
        `;
        await this.mailService.send(email, `Confirm registration`, text, html);
      }
      return {
        message: 'If the email exists, we’ve sent you a link.',
      };
    } catch (err: unknown) {
      this.errorsHandlerService.default(err);
    }
  }

  async confirmRegistration(token: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const data = await this.tokensService.getDataByRegistrationToken(token);
      if (!data) {
        this.errorsHandlerService.invalidToken(null, TokenType.REGISTRATION);
        return;
      }
      let nickname: string;
      let attempts = 0;
      const maxAttempts = 50;
      do {
        if (attempts >= maxAttempts) {
          throw new Error(
            'Unable to generate unique nickname after 50 attempts',
          );
        }
        nickname = this.nicknameGeneratorService.get();
        attempts++;
      } while (await qr.manager.findOne(User, { where: { nickname } }));
      const newUser = qr.manager.create(User, {
        email: data.email,
        password: data.password,
        nickname,
      });
      await qr.manager.save(User, newUser);
      await qr.commitTransaction();
      await this.tokensService.deleteRegistrationToken(token);
      return this.login(newUser.id);
    } catch (err: unknown) {
      await qr.rollbackTransaction();
      this.errorsHandlerService.confirmRegistration(err);
    } finally {
      await qr.release();
    }
  }

  async login(userId: number) {
    try {
      const tokens = this.tokensService.generateJwtTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch (err: unknown) {
      this.errorsHandlerService.default(err);
    }
  }

  async logout(userId: number, access_token: string | undefined) {
    if (!access_token) {
      this.errorsHandlerService.tokenNotDefined(TokenType.ACCESS);
    } else {
      try {
        await this.tokensService.removeRefreshToken(userId);
        await this.tokensService.addJwtTokenToBlacklist(
          access_token,
          TokenType.ACCESS,
        );
      } catch (err: unknown) {
        this.errorsHandlerService.invalidToken(err, TokenType.ACCESS);
        this.errorsHandlerService.default(err);
      }
    }
  }

  async refreshJwtTokens(userId: number) {
    try {
      const tokens = this.tokensService.generateJwtTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch (err: unknown) {
      this.errorsHandlerService.invalidToken(err, TokenType.REFRESH);
      this.errorsHandlerService.default(err);
    }
  }

  async requestPasswordReset(email: string) {
    try {
      const user = await this.usersRepository.findOne({
        where: { email },
        select: [ID],
      });
      if (user) {
        const token = this.tokensService.generateVerificationToken();
        await this.tokensService.saveResetToken(user.id, token);
        const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;
        const text = `Hi, this is an automated message, please do not reply! You can reset your password by clicking the link below (within ${this.resetExpiresIn} min): ${resetUrl}`;
        const html = `
          <p style="font-weight: bold; font-size: 17px;">Hi, this is an automated message, please do not reply!</p>
          <p style="font-weight: bold; font-size: 17px;">You can reset your password by clicking the link below (within ${this.resetExpiresIn} min):</p>
          <p style="font-weight: bold; font-size: 17px;">
            <a href="${resetUrl}" style="font-weight: bold;">${resetUrl}</a>
          </p>`;
        await this.mailService.send(email, `Password recovery`, text, html);
      }
      return {
        message: 'If the email exists, we’ve sent you a password reset link.',
      };
    } catch (err: unknown) {
      this.errorsHandlerService.default(err);
    }
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const userId = await this.tokensService.getUserIdByResetToken(token);
      if (!userId) {
        this.errorsHandlerService.invalidToken(null, TokenType.RESET);
        return;
      }
      const hashedPassword = await this.hashService.hash(newPassword);
      const result = await this.usersRepository.update(
        { id: userId },
        { password: hashedPassword },
      );
      if (result.affected === 0) {
        this.errorsHandlerService.userNotFound();
      }
      await this.tokensService.deleteResetToken(token);
      const tokens = await this.refreshJwtTokens(userId);
      return tokens;
    } catch (err: unknown) {
      this.errorsHandlerService.resetPassword(err);
    }
  }
}
