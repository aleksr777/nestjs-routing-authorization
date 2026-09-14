import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SecurityAuditService } from '../audit/security-audit.service';
import { HashService } from '../common/hash-service/hash.service';
import { RedisService } from '../common/redis-service/redis.service';
import { SecurityConfigService } from '../common/security/security-config.service';
import { Role } from '../common/types/role.enum';
import { User } from '../users/entities/user.entity';
import { AuthService, SessionContext } from './auth.service';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SETUP_PREFIX = 'mfa:totp:setup:';
const LOGIN_PREFIX = 'mfa:totp:login:';
const LOGIN_ATTEMPTS_PREFIX = 'mfa:totp:attempts:';
const USER_LOGIN_ATTEMPTS_PREFIX = 'mfa:totp:user-attempts:';
const USED_TOTP_PREFIX = 'mfa:totp:used:';
const SETUP_TTL_SECONDS = 600;
const LOGIN_TTL_SECONDS = 300;
const MAX_LOGIN_ATTEMPTS = 5;
const MAX_USER_LOGIN_ATTEMPTS = 10;
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const USED_TOTP_TTL_SECONDS = TOTP_PERIOD_SECONDS * 4;

@Injectable()
export class MfaService {
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly redis: RedisService,
    private readonly securityConfig: SecurityConfigService,
    private readonly hashService: HashService,
    private readonly authService: AuthService,
    private readonly audit: SecurityAuditService,
  ) {
    this.encryptionKey = createHash('sha256')
      .update(this.securityConfig.getMfaEncryptionKey())
      .digest();
  }

  private encodeBase32(input: Buffer): string {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of input) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
  }

  private decodeBase32(input: string): Buffer {
    let bits = 0;
    let value = 0;
    const bytes: number[] = [];
    for (const char of input.replace(/=+$/g, '').toUpperCase()) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index < 0) throw new UnauthorizedException('Invalid MFA secret.');
      value = (value << 5) | index;
      bits += 5;
      if (bits >= 8) {
        bytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(bytes);
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decrypt(value: string): string {
    const [ivText, tagText, encryptedText] = value.split('.');
    if (!ivText || !tagText || !encryptedText) {
      throw new UnauthorizedException('Invalid MFA secret.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivText, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedText, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }

  private hotp(secret: string, counter: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', this.decodeBase32(secret))
      .update(counterBuffer)
      .digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, '0');
  }

  private getValidTotpCounter(secret: string, code: string): number | null {
    if (!/^\d{6}$/.test(code)) return null;
    const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD_SECONDS);
    for (const drift of [-1, 0, 1]) {
      const candidateCounter = counter + drift;
      const expected = Buffer.from(this.hotp(secret, candidateCounter));
      const actual = Buffer.from(code);
      if (
        expected.length === actual.length &&
        timingSafeEqual(expected, actual)
      ) {
        return candidateCounter;
      }
    }
    return null;
  }

  private async reserveTotpUse(
    userId: number,
    secret: string,
    counter: number,
  ): Promise<boolean> {
    const secretFingerprint = this.hashService.hashToken(secret);
    const result = await this.redis.set(
      `${USED_TOTP_PREFIX}${userId}:${secretFingerprint}:${counter}`,
      '1',
      { EX: USED_TOTP_TTL_SECONDS, NX: true },
    );
    return result === 'OK';
  }

  private challengeKey(challenge: string): string {
    return `${LOGIN_PREFIX}${this.hashService.hashToken(challenge)}`;
  }

  private attemptsKey(challenge: string): string {
    return `${LOGIN_ATTEMPTS_PREFIX}${this.hashService.hashToken(challenge)}`;
  }

  private userAttemptsKey(userId: number): string {
    return `${USER_LOGIN_ATTEMPTS_PREFIX}${userId}`;
  }

  async getStatus(userId: number) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'role', 'mfa_totp_enabled'],
    });
    return {
      enabled: user?.role === Role.ADMIN && user.mfa_totp_enabled === true,
    };
  }

  async beginSetup(userId: number) {
    const user = await this.users.findOne({
      where: { id: userId },
      select: ['id', 'email', 'role'],
    });
    if (!user || user.role !== Role.ADMIN) {
      throw new UnauthorizedException('Administrator account required.');
    }

    const secret = this.encodeBase32(randomBytes(20));
    await this.redis.set(`${SETUP_PREFIX}${userId}`, this.encrypt(secret), {
      EX: SETUP_TTL_SECONDS,
    });
    const issuer = 'Routing Authorization';
    const label = `${issuer}:${user.email}`;
    const uri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`;

    void this.audit.record({ event: 'ADMIN_MFA_SETUP_STARTED', userId });
    return { secret, otpauth_uri: uri, expires_in: SETUP_TTL_SECONDS };
  }

  async enable(
    userId: number,
    password: string,
    code: string,
    currentSessionId: string,
  ) {
    await this.authService.verifyUserPassword(userId, password);
    const setupKey = `${SETUP_PREFIX}${userId}`;
    const pending = await this.redis.get(setupKey);
    if (!pending) throw new UnauthorizedException('MFA setup has expired.');
    const secret = this.decrypt(pending);
    const counter = this.getValidTotpCounter(secret, code);
    if (counter === null) {
      throw new UnauthorizedException('Invalid MFA code.');
    }

    const consumed = await this.redis.deleteIfValueMatches(setupKey, pending);
    if (!consumed) {
      throw new UnauthorizedException('MFA setup has expired.');
    }
    if (!(await this.reserveTotpUse(userId, secret, counter))) {
      throw new UnauthorizedException('MFA code has already been used.');
    }

    await this.users.manager.transaction(async (manager) => {
      const result = await manager.update(
        User,
        { id: userId, role: Role.ADMIN },
        { mfa_totp_secret: this.encrypt(secret), mfa_totp_enabled: true },
      );
      if ((result.affected ?? 0) !== 1) {
        throw new UnauthorizedException('Administrator account state changed.');
      }
      await this.authService.revokeOtherSessions(
        userId,
        currentSessionId,
        'mfa_enabled',
        manager,
      );
    });
    void this.audit.record({
      event: 'ADMIN_MFA_ENABLED',
      userId,
      sessionId: currentSessionId,
    });
    return { enabled: true };
  }

  async disable(
    userId: number,
    password: string,
    code: string,
    currentSessionId: string,
  ) {
    await this.authService.verifyUserPassword(userId, password);
    const user = await this.users.findOne({
      where: { id: userId, role: Role.ADMIN },
      select: ['id', 'mfa_totp_secret', 'mfa_totp_enabled'],
    });
    if (!user?.mfa_totp_enabled || !user.mfa_totp_secret) {
      return { enabled: false };
    }
    const secret = this.decrypt(user.mfa_totp_secret);
    const counter = this.getValidTotpCounter(secret, code);
    if (counter === null) {
      throw new UnauthorizedException('Invalid MFA code.');
    }
    if (!(await this.reserveTotpUse(userId, secret, counter))) {
      throw new UnauthorizedException('MFA code has already been used.');
    }

    await this.users.manager.transaction(async (manager) => {
      const result = await manager.update(
        User,
        { id: userId, role: Role.ADMIN, mfa_totp_enabled: true },
        { mfa_totp_secret: null, mfa_totp_enabled: false },
      );
      if ((result.affected ?? 0) !== 1) {
        throw new UnauthorizedException('Administrator account state changed.');
      }
      await this.authService.revokeOtherSessions(
        userId,
        currentSessionId,
        'mfa_disabled',
        manager,
      );
    });
    void this.audit.record({
      event: 'ADMIN_MFA_DISABLED',
      userId,
      sessionId: currentSessionId,
    });
    return { enabled: false };
  }

  async createLoginChallenge(userId: number): Promise<string> {
    const challenge = randomBytes(32).toString('base64url');
    await this.redis.set(this.challengeKey(challenge), userId.toString(), {
      EX: LOGIN_TTL_SECONDS,
      NX: true,
    });
    return challenge;
  }

  async completeLogin(
    challenge: string,
    code: string,
    context: SessionContext,
  ) {
    const key = this.challengeKey(challenge);
    const userIdText = await this.redis.get(key);
    if (!userIdText) {
      throw new UnauthorizedException('MFA challenge has expired.');
    }

    const userId = Number.parseInt(userIdText, 10);
    const [challengeAttempts, userAttempts] = await Promise.all([
      this.redis.incrWithExpire(this.attemptsKey(challenge), LOGIN_TTL_SECONDS),
      this.redis.incrWithExpire(
        this.userAttemptsKey(userId),
        LOGIN_TTL_SECONDS,
      ),
    ]);
    if (
      challengeAttempts > MAX_LOGIN_ATTEMPTS ||
      userAttempts > MAX_USER_LOGIN_ATTEMPTS
    ) {
      await this.redis.del(key);
      void this.audit.record({
        event: 'ADMIN_MFA_LOGIN_RATE_LIMITED',
        success: false,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('MFA challenge has expired.');
    }

    const user = await this.users.findOne({
      where: { id: userId, role: Role.ADMIN },
      select: ['id', 'mfa_totp_secret', 'mfa_totp_enabled', 'is_blocked'],
    });
    if (
      !user ||
      user.is_blocked ||
      !user.mfa_totp_enabled ||
      !user.mfa_totp_secret
    ) {
      await this.redis.del(key);
      throw new UnauthorizedException('MFA challenge is invalid.');
    }

    const secret = this.decrypt(user.mfa_totp_secret);
    const counter = this.getValidTotpCounter(secret, code);
    if (counter === null) {
      void this.audit.record({
        event: 'ADMIN_MFA_LOGIN_FAILED',
        success: false,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('Invalid MFA code.');
    }

    const consumedUserIdText = await this.redis.getDel(key);
    if (consumedUserIdText !== userIdText) {
      void this.audit.record({
        event: 'ADMIN_MFA_LOGIN_REPLAYED',
        success: false,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('MFA challenge has expired.');
    }
    if (!(await this.reserveTotpUse(userId, secret, counter))) {
      void this.audit.record({
        event: 'ADMIN_MFA_TOTP_REPLAYED',
        success: false,
        userId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('MFA code has already been used.');
    }

    await Promise.all([
      this.redis.del(this.attemptsKey(challenge)),
      this.redis.del(this.userAttemptsKey(userId)),
    ]);
    const tokens = await this.authService.loginNewSession(userId, context);
    void this.audit.record({
      event: 'ADMIN_MFA_LOGIN_SUCCESS',
      userId,
      sessionId: this.authService.getSessionIdFromToken(tokens.access_token),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return tokens;
  }
}
