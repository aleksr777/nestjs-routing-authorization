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
  const findOne = jest.fn();
  const updateUser = jest.fn();
  const redisGet = jest.fn();
  const redisSet = jest.fn();
  const redisDel = jest.fn();
  const incrWithExpire = jest.fn();
  const verifyUserPassword = jest.fn();
  const loginNewSession = jest.fn();
  const revokeOtherSessions = jest.fn();
  const getSessionIdFromToken = jest.fn();
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const users = { findOne, update: updateUser } as unknown as Repository<User>;
  const redis = {
    get: redisGet,
    set: redisSet,
    del: redisDel,
    incrWithExpire,
  } as unknown as RedisService;
  const securityConfig = {
    getMfaEncryptionKey: jest.fn(
      () => 'mfa-encryption-key-for-tests-1234567890',
    ),
  } as unknown as SecurityConfigService;
  const authService = {
    verifyUserPassword,
    loginNewSession,
    revokeOtherSessions,
    getSessionIdFromToken,
  } as unknown as AuthService;
  const audit = { record: auditRecord } as unknown as SecurityAuditService;
  const service = new MfaService(
    users,
    redis,
    securityConfig,
    new HashService(),
    authService,
    audit,
  );

  return {
    service,
    findOne,
    redisGet,
    redisDel,
    incrWithExpire,
    verifyUserPassword,
    auditRecord,
  };
};

describe('MfaService security controls', () => {
  it('verifies the current password before enabling MFA', async () => {
    const { service, redisGet, verifyUserPassword } = createService();
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
    const {
      service,
      findOne,
      redisGet,
      redisDel,
      incrWithExpire,
      auditRecord,
    } = createService();
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
