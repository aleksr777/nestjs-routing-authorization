import { Injectable } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { AuthService } from './auth.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { MailService } from '../common/mail-service/mail.service';
import { EnvService } from '../common/env-service/env.service';
import { NicknameGeneratorService } from '../common/nickname-generator-service/nickname-generator.service';
import { User } from '../users/entities/user.entity';
import { ID } from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';

@Injectable()
export class RegistrationService {
  config: any;
  private readonly frontendUrl: string;
  private readonly registrationExpiresIn: number;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
    private readonly tokensService: TokensService,
    private readonly hashService: HashService,
    private readonly errorsService: ErrorsService,
    private readonly mailService: MailService,
    private readonly envService: EnvService,
    private readonly nicknameGeneratorService: NicknameGeneratorService,
  ) {
    this.frontendUrl = this.envService.get('FRONTEND_URL');
    this.registrationExpiresIn =
      this.envService.get('REGISTRATION_TOKEN_EXPIRES_IN', 'number') / 60;
  }

  async request(email: string, password: string) {
    this.mailService.validateNotServiceEmail(email);
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
      this.errorsService.default(err);
    }
  }

  async confirm(token: string) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const data = await this.tokensService.getDataByRegistrationToken(token);
      if (!data) {
        this.errorsService.invalidToken(null, TokenType.REGISTRATION);
        return;
      }
      this.mailService.validateNotServiceEmail(data.email);
      let nickname: string;
      let attempts = 0;
      const maxAttempts = 100;
      do {
        if (attempts >= maxAttempts) {
          this.errorsService.default(
            null,
            `Unable to generate unique nickname after ${maxAttempts} attempts`,
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
      return this.authService.login(newUser.id);
    } catch (err: unknown) {
      await qr.rollbackTransaction();
      this.errorsService.confirmRegistration(err);
    } finally {
      await qr.release();
    }
  }
}
