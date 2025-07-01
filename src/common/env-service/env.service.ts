import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENV_VARIABLES } from './env.constants';

@Injectable()
export class EnvService {
  constructor(private readonly configService: ConfigService) {}
  public getEnv(key: string): string;
  public getEnv(key: string, type: 'string'): string;
  public getEnv(key: string, type: 'number'): number;
  public getEnv(key: string, type: 'boolean'): boolean;

  public getEnv(
    key: string,
    type: 'string' | 'number' | 'boolean' = 'string',
  ): string | number | boolean {
    const raw = this.configService.getOrThrow<string>(key);
    if (raw === undefined) {
      throw new Error(`Env var "${key}" is not set`);
    }
    switch (type) {
      case 'number': {
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) {
          throw new Error(
            `Env var "${key}" value "${raw}" is not a valid number`,
          );
        }
        return parsed;
      }
      case 'boolean': {
        const normalized = raw.toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
        throw new Error(
          `Env var "${key}" value "${raw}" is not a valid boolean`,
        );
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
      console.error(
        `The following required environment variables are missing or empty: ${missing.join(', ')}`,
      );
      process.exit(1);
    }
  }
}
