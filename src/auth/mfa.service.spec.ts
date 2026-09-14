import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SecurityAuditService } from '../audit/security-audit.service';
import { HashService } from '../common/hash-service/hash.service';
import { RedisService } from '../common/redis-service/redis.service';
import { SecurityConfigService } from '../common/security/security-config.service';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

const createService = () => {
  const users = {
    findOne: jest.fn(),
    update: jest.fn(),
  } as unknown as Repository<User>;
  const redis = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    incrWithExpire: jest.fn(),
  } as unknown as RedisService;
  const securityConfig = {
    getMfaEncryptionKey: jest.fn(() => 'mfa-encryption-key-for-tests-1234567890'),
  } as unknown as SecurityConfigService;
  const authService = {
    verifyUserPassword: jest.fn(),
    loginNewSession: jest.fn(),
    revokeOtherSessions: jest.fn(),
    getSessionIdFromToken: jest.fn(),
  } as unknown as AuthService;
  const audit = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as SecurityAuditService;
  const service = new MfaService(
    users,
    redis,
    securityConfig,
    new HashService(),
    authService,
    audit,
  );

  return { service, users, redis, authService, audit };
};

describe('MfaService security controls', () => {
  it('verifies the current password before enabling MFA', async () => {
    const { service, redis, authService } = createService();
    const verifyUserPassword = authService.verifyUserPassword as jest.Mock;
    const redisGet = redis.get as jest.Mock;
    verifyUserPassword.mockRejectedValueOnce(
      new UnauthorizedException('Invalid password.'),
    );

    await expect(
      service.enable(7, 'wrong-password', '123456', 'session-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyUserPassword).toHaveBeenCalledWith(7, 'wrong-password');
    expect(redisGet).not.toHaveBeenCalled();
  });

  it('limits MFA attempts across newly issued challenges for the same user', async () => {
    const { service, users, redis, audit } = createService();
    const redisGet = redis.get as jest.Mock;
    const incrWithExpire = redis.incrWithExpire as jest.Mock;
    const redisDel = redis.del as jest.Mock;
    const findOne = users.findOne as jest.Mock;
    const auditRecord = audit.record as jest.Mock;
    redisGet.mockResolvedValueOnce('7');
    incrWithExpire.mockResolvedValueOnce(1).mockResolvedValueOnce(11);
    redisDel.mockResolvedValue(1);

    await expect(
      service.completeLogin('challenge', '123456', {
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(findOne).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ADMIN_MFA_LOGIN_RATE_LIMITED',
        success: false,
        userId: 7,
      }),
    );
  });
});
