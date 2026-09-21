import { HttpException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AdminLoginService } from './admin-login.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { HashService } from '../common/hash-service/hash.service';
import { MailService } from '../common/mail-service/mail.service';
import { RedisService } from '../common/redis-service/redis.service';
import { Role } from '../common/types/role.enum';
import { User } from '../users/entities/user.entity';

describe('administrator email confirmation', () => {
  let service: AdminLoginService;
  let user: User;
  let now: number;
  let values: Map<string, { value: string; expires: number }>;
  let sentCode: string;
  let send: jest.Mock;
  let findOne: jest.Mock;
  const read = (key: string) => {
    const entry = values.get(key);
    if (!entry || entry.expires <= now) {
      values.delete(key);
      return null;
    }
    return entry.value;
  };
  beforeEach(() => {
    now = 0;
    values = new Map();
    user = {
      id: 1,
      role: Role.ADMIN,
      email: 'admin@example.test',
      password: 'hashed-credential',
      is_blocked: false,
    } as User;
    findOne = jest.fn(() => user);
    send = jest.fn((_email: string, _subject: string, body: string) => {
      sentCode = body.match(/\b\d{6}\b/)![0];
    });
    const redis = {
      get: jest.fn((key: string) => read(key)),
      set: jest.fn(
        (key: string, value: string, options: { EX: number; NX?: boolean }) => {
          if (options.NX && read(key)) return null;
          values.set(key, { value, expires: now + options.EX });
          return 'OK';
        },
      ),
      del: jest.fn((key: string) =>
        Promise.resolve(Number(values.delete(key))),
      ),
      ttl: jest.fn((key: string) =>
        read(key) ? values.get(key)!.expires - now : -2,
      ),
      incrWithExpire: jest.fn((key: string, seconds: number) => {
        const entry = read(key);
        const count = Number(entry ?? 0) + 1;
        values.set(key, {
          value: String(count),
          expires: entry ? values.get(key)!.expires : now + seconds,
        });
        return count;
      }),
      consumeActiveToken: jest.fn(
        (active: string, expected: string, token: string) => {
          const payload = read(token);
          if (read(active) !== expected || !payload)
            return Promise.resolve(null);
          values.delete(active);
          values.delete(token);
          return Promise.resolve(payload);
        },
      ),
    };
    service = new AdminLoginService(
      { findOne } as unknown as Repository<User>,
      redis as unknown as RedisService,
      new HashService(),
      { send } as unknown as MailService,
      new ErrorsService(),
    );
  });

  const wrongCode = () => (sentCode === '000000' ? '111111' : '000000');
  const rejectsWith = async (promise: Promise<unknown>, status: number) => {
    await expect(promise).rejects.toMatchObject({ status });
  };

  it('sends a six-digit code only to the validated administrator and stores only hashes', async () => {
    const challenge = await service.request(user);
    expect(challenge).toMatchObject({
      admin_confirmation_required: true,
      expires_in: 300,
      retry_after: 60,
      max_attempts: 5,
    });
    expect(challenge.challenge_id).toMatch(/^[a-f0-9]{64}$/);
    expect(challenge).not.toHaveProperty('access_token');
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(send).toHaveBeenCalledWith(
      user.email,
      expect.any(String),
      expect.stringContaining(sentCode),
      expect.stringContaining(sentCode),
    );
    const stored = read(`admin-login:challenge:${challenge.challenge_id}`)!;
    expect(stored).not.toContain(`:${sentCode}`);
    expect(JSON.parse(stored)).not.toHaveProperty('code');
    expect(stored).not.toContain(user.password);
    expect((await service.confirm(challenge.challenge_id, sentCode)).id).toBe(
      user.id,
    );
    await rejectsWith(service.confirm(challenge.challenge_id, sentCode), 401);
  });

  it('does not issue challenges for ordinary or blocked accounts', async () => {
    await rejectsWith(
      service.request({ ...user, role: Role.USER } as User),
      401,
    );
    await rejectsWith(
      service.request({ ...user, is_blocked: true } as User),
      401,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('rejects wrong codes without consuming the valid code', async () => {
    const challenge = await service.request(user);
    await expect(
      service.confirm(challenge.challenge_id, wrongCode()),
    ).rejects.toMatchObject({ response: { attempts_remaining: 4 } });
    expect((await service.confirm(challenge.challenge_id, sentCode)).id).toBe(
      1,
    );
  });

  it('expires the challenge and refuses resends without a pending password-authenticated login', async () => {
    await rejectsWith(service.resend('a'.repeat(64)), 401);
    const challenge = await service.request(user);
    now = 301;
    await rejectsWith(service.confirm(challenge.challenge_id, sentCode), 401);
    await rejectsWith(service.resend(challenge.challenge_id), 401);
  });

  it('limits resends and invalidates the previous challenge', async () => {
    const first = await service.request(user);
    const firstCode = sentCode;
    await rejectsWith(service.resend(first.challenge_id), 429);
    now = 61;
    const next = await service.resend(first.challenge_id);
    await rejectsWith(service.confirm(first.challenge_id, firstCode), 401);
    expect((await service.confirm(next.challenge_id, sentCode)).id).toBe(1);
  });

  it('retains the attempt budget across resends and new password logins', async () => {
    const first = await service.request(user);
    for (let i = 0; i < 4; i++)
      await rejectsWith(service.confirm(first.challenge_id, wrongCode()), 401);
    now = 61;
    const next = await service.resend(first.challenge_id);
    await expect(
      service.confirm(next.challenge_id, wrongCode()),
    ).rejects.toMatchObject({
      response: { attempts_remaining: 0, locked: true },
    });
    await rejectsWith(service.confirm(next.challenge_id, sentCode), 429);
    now = 122;
    await rejectsWith(service.request(user), 429);
    now = 901;
    const afterLock = await service.request(user);
    expect((await service.confirm(afterLock.challenge_id, sentCode)).id).toBe(
      1,
    );
  });

  it('consumes a correct code only once under simultaneous submissions', async () => {
    const challenge = await service.request(user);
    const results = await Promise.allSettled([
      service.confirm(challenge.challenge_id, sentCode),
      service.confirm(challenge.challenge_id, sentCode),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('enforces the five-attempt budget under parallel guesses', async () => {
    const challenge = await service.request(user);
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        service.confirm(challenge.challenge_id, wrongCode()),
      ),
    );
    expect(results.every((r) => r.status === 'rejected')).toBe(true);
    expect(
      results.filter(
        (r) =>
          r.status === 'rejected' &&
          (r.reason as HttpException).getStatus() === 429,
      ),
    ).toHaveLength(7);
    await rejectsWith(service.confirm(challenge.challenge_id, sentCode), 429);
  });

  it.each(['password', 'email', 'role', 'blocked', 'deleted'])(
    'rejects a challenge after the account is %s changed',
    async (change) => {
      const challenge = await service.request(user);
      if (change === 'password') user.password = 'changed-hash';
      if (change === 'email') user.email = 'other@example.test';
      if (change === 'role') user.role = Role.USER;
      if (change === 'blocked') user.is_blocked = true;
      if (change === 'deleted') findOne.mockResolvedValue(null);
      await rejectsWith(service.confirm(challenge.challenge_id, sentCode), 401);
    },
  );

  it('invalidates an undelivered code and permits retry after an SMTP failure', async () => {
    send.mockRejectedValueOnce(new Error('SMTP failed'));
    await rejectsWith(service.request(user), 503);
    expect(
      [...values.keys()].filter(
        (k) => k.includes('active:') || k.includes('challenge:'),
      ),
    ).toHaveLength(0);
    await expect(service.request(user)).resolves.toHaveProperty('challenge_id');
  });
});
