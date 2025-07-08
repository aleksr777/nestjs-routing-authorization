import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { EnvService } from '../env-service/env.service';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly envService: EnvService) {
    this.transporter = nodemailer.createTransport({
      host: this.envService.getEnv('SMTP_HOST'),
      port: this.envService.getEnv('SMTP_PORT', 'number'),
      secure: this.envService.getEnv('SMTP_SECURE', 'boolean'),
      auth: {
        user: this.envService.getEnv('SMTP_USER'),
        pass: this.envService.getEnv('SMTP_PASS'),
      },
    });
  }

  async sendMail(
    to: string,
    subject: string,
    text: string,
    html?: string,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: `"No Reply" <${this.envService.getEnv('SMTP_FROM')}>`,
      to,
      subject,
      text,
      html,
    });
  }
}
