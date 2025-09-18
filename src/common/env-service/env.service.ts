import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENV_VARIABLES } from './env.constants';
import { ErrorsService } from '../../common/errors-service/errors.service';

@Injectable()
export class EnvService {
  constructor(
    private readonly configService: ConfigService,
    private readonly errorsService: ErrorsService,
  ) {}
  public get(key: string): string;
  public get(key: string, type: 'string'): string;
  public get(key: string, type: 'number'): number;
  public get(key: string, type: 'boolean'): boolean;

  public get(
    key: string,
    type: 'string' | 'number' | 'boolean' = 'string',
  ): string | number | boolean {
    const raw = this.configService.getOrThrow<string>(key);
    if (raw === undefined) {
      const msg = `Env var "${key}" is not set`;
      this.errorsService.default(null, msg);
    }
    switch (type) {
      case 'number': {
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) {
          const msg = `Env var "${key}" value "${raw}" is not a valid number`;
          this.errorsService.default(null, msg);
        }
        return parsed;
      }
      case 'boolean': {
        const normalized = raw.toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
        const msg = `Env var "${key}" value "${raw}" is not a valid boolean`;
        this.errorsService.default(null, msg);
        return false;
      }
      case 'string':
      default:
        return raw;
    }
  }

  public validateVariables(): void {
    const missing = ENV_VARIABLES.filter((key) => {
      const val = process.env[key];
      return val === undefined || val.trim() === '';
    });
    if (missing.length) {
      const msg = `The following required environment variables are missing or empty: ${missing.join(', ')}`;
      this.errorsService.default(null, msg);
      process.exit(1);
    }
    const smtpFrom = this.get('SMTP_FROM');
    const adminEmail = this.get('ADMIN_EMAIL');
    if (smtpFrom === adminEmail) {
      const msg =
        'Env validation error: SMTP_FROM and ADMIN_EMAIL must not be the same.';
      this.errorsService.default(null, msg);
      process.exit(1);
    }
  }
}
