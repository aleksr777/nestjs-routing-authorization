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
import { ID } from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class PasswordResetService {
  config: any;
  private readonly frontendUrl: string;
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
    this.frontendUrl = this.envService.get('FRONTEND_URL');
    this.resetExpiresIn =
      this.envService.get('RESET_TOKEN_EXPIRES_IN', 'number') / 60;
  }

  async request(email: string) {
    this.mailService.validateNotServiceEmail(email);
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
      this.errorsService.default(err);
    }
  }

  async confirm(token: string, newPassword: string) {
    try {
      const userId = await this.tokensService.getUserIdByResetToken(token);
      if (!userId) {
        this.errorsService.invalidToken(null, TokenType.RESET);
        return;
      }
      const hashedPassword = await this.hashService.hash(newPassword);
      const result = await this.usersRepository.update(
        { id: userId },
        { password: hashedPassword },
      );
      if (result.affected === 0) {
        this.errorsService.userNotFound();
      }
      await this.tokensService.deleteResetToken(token);
      return this.authService.login(userId);
    } catch (err: unknown) {
      this.errorsService.resetPassword(err);
    }
  }
}
