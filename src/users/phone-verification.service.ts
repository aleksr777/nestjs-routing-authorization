import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis-service/redis.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { EnvService } from '../common/env-service/env.service';

type Payload = { phone: string; attempts: number; exp: number };

const keyData = (userId: number) => `phone:verify:data:${userId}`;
const keyCode = (userId: number) => `phone:verify:code:${userId}`;

@Injectable()
export class PhoneVerificationService {
  constructor(
    private readonly redisService: RedisService,
    private readonly errorsService: ErrorsService,
    private readonly envService: EnvService,
  ) {}

  private genCode(len = 6) {
    let s = '';
    for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 10);
    return s;
  }

  private async setJson(key: string, value: unknown, ttlSec?: number) {
    const json = JSON.stringify(value);
    await this.redisService.set(key, json, ttlSec ? { EX: ttlSec } : undefined);
  }

  private async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redisService.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      this.errorsService.default(err, 'Redis JSON parse error');
      return null;
    }
  }

  async start(userId: number, phone: string) {
    const ttlSec = this.envService.get('PHONE_VERIFICATION_TTL', 'number');
    const codeLen = this.envService.get(
      'PHONE_VERIFICATION_CODE_LENGTH',
      'number',
    );
    const now = Date.now();
    const payload: Payload = { phone, attempts: 0, exp: now + ttlSec * 1000 };
    const code = this.genCode(codeLen);

    await this.setJson(keyData(userId), payload, ttlSec);
    await this.redisService.set(keyCode(userId), code, { EX: ttlSec });

    // TODO: отправка SMS через провайдера
    return { ttl: ttlSec };
  }

  async confirm(userId: number, code: string) {
    const maxAttempts = this.envService.get(
      'PHONE_VERIFICATION_MAX_ATTEMPTS',
      'number',
    );
    const data = await this.getJson<Payload>(keyData(userId));
    const real = await this.redisService.get(keyCode(userId));
    if (!data || !real) {
      return this.errorsService.badRequest(
        'Phone verification not requested or expired.',
      );
    }
    const now = Date.now();
    const ttlLeft = Math.ceil((data.exp - now) / 1000);
    if (ttlLeft <= 0) {
      await this.redisService.del(keyData(userId));
      await this.redisService.del(keyCode(userId));
      return this.errorsService.badRequest(
        'Phone verification not requested or expired.',
      );
    }
    if (data.attempts >= maxAttempts) {
      await this.redisService.del(keyData(userId));
      await this.redisService.del(keyCode(userId));
      return this.errorsService.forbidden(
        'Too many attempts. Start verification again.',
      );
    }
    if (code !== real) {
      data.attempts += 1;
      await this.setJson(keyData(userId), data, ttlLeft);
      return this.errorsService.badRequest('Invalid verification code.');
    }
    const phone = data.phone;
    await this.redisService.del(keyData(userId));
    await this.redisService.del(keyCode(userId));
    return phone;
  }

  async cancel(userId: number) {
    await this.redisService.del(keyData(userId));
    await this.redisService.del(keyCode(userId));
  }
}
