import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { User } from '../users/entities/user.entity';
import { EMAIL, ID } from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class PasswordResetService {
  config: any;
  private readonly resetExpiresIn: number;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
    private readonly hashService: HashService,
    private readonly errorsService: ErrorsService,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
  ) {
    this.resetExpiresIn =
      this.envService.get('RESET_TOKEN_EXPIRES_IN', 'number') / 60;
  }

  async request(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    this.mailService.validateNotServiceEmail(normalizedEmail);
    try {
      const user = await this.usersRepository.findOne({
        where: { email: normalizedEmail },
        select: [ID],
      });
      if (user) {
        const code = await this.tokensService.getResetCode(user.id);
        await this.tokensService.clearVerificationFailures(
          TokenType.PASSWORD_RESET,
          normalizedEmail,
        );
        const text = `Hi, this is an automated message, please do not reply! You can reset your password by using the code below (within ${this.resetExpiresIn} min): ${code}`;
        const html = `
          <p style="font-weight: bold; font-size: 17px;">Hi, this is an automated message, please do not reply!</p>
          <p style="font-weight: bold; font-size: 17px;">You can reset your password by using the code below (within ${this.resetExpiresIn} min):</p>
          <p style="font-weight: bold; font-size: 30px;">${code}</p>
          <p style="font-weight: bold; font-size: 17px;">If you didn’t request this, you can safely ignore this email.</p>`;
        await this.mailService.send(normalizedEmail, `Password recovery`, text, html);
      }
      return {
        message: 'If the email exists, we’ve sent you a password reset code.',
      };
    } catch (err: unknown) {
      this.errorsService.default(err);
    }
  }

  async confirm(code: string, newPassword: string, email: string) {
    const attemptSubject = email.trim().toLowerCase();
    await this.tokensService.assertVerificationAttemptsAvailable(
      TokenType.PASSWORD_RESET,
      attemptSubject,
    );

    try {
      const userId = await this.tokensService.getIdByResetCode(code);
      if (!userId) {
        await this.tokensService.registerVerificationFailure(
          TokenType.PASSWORD_RESET,
          attemptSubject,
        );
        this.errorsService.invalidToken(null, TokenType.PASSWORD_RESET);
      }

      const user = await this.usersRepository.findOne({
        where: { id: userId },
        select: [ID, EMAIL],
      });
      if (!user || user.email.trim().toLowerCase() !== attemptSubject) {
        await this.tokensService.registerVerificationFailure(
          TokenType.PASSWORD_RESET,
          attemptSubject,
        );
        this.errorsService.invalidToken(null, TokenType.PASSWORD_RESET);
      }

      const hashedPassword = await this.hashService.hash(newPassword);
      const result = await this.usersRepository.update(
        { id: userId },
        { password: hashedPassword },
      );
      if (result.affected === 0) {
        this.errorsService.userNotFound();
      }
      await this.tokensService.deletePassResetCode(code);
      await this.tokensService.clearVerificationFailures(
        TokenType.PASSWORD_RESET,
        attemptSubject,
      );
      return this.authService.login(userId);
    } catch (err: unknown) {
      this.errorsService.resetPassword(err);
    }
  }
}
