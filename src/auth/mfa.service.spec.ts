import { UnauthorizedException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SecurityAuditService } from '../audit/security-audit.service';
import { HashService } from '../common/hash-service/hash.service';
import { RedisService } from '../common/redis-service/redis.service';
import { SecurityConfigService } from '../common/security/security-config.service';
import { Role } from '../common/types/role.enum';
import { User } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';

const createService = () => {
  const findOne = jest.fn();
  const updateUser = jest.fn();
  const transactionUpdate = jest.fn().mockResolvedValue({ affected: 1 });
  const transactionManager = { update: transactionUpdate };
  const transaction = jest.fn(
    async (
      callback: (manager: typeof transactionManager) => Promise<unknown>,
    ) => callback(transactionManager),
  );
  const redisGet = jest.fn();
  const redisGetDel = jest.fn();
  const redisSet = jest.fn();
  const redisDel = jest.fn();
  const deleteIfValueMatches = jest.fn();
  const incrWithExpire = jest.fn();
  const verifyUserPassword = jest.fn();
  const loginNewSession = jest.fn();
  const revokeOtherSessions = jest.fn().mockResolvedValue(undefined);
  const getSessionIdFromToken = jest.fn();
  const auditRecord = jest.fn().mockResolvedValue(undefined);
  const users = {
    findOne,
    update: updateUser,
    manager: { transaction },
  } as unknown as Repository<User>;
  const redis = {
    get: redisGet,
    getDel: redisGetDel,
    set: redisSet,
    del: redisDel,
    deleteIfValueMatches,
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
    updateUser,
    transaction,
    transactionUpdate,
    transactionManager,
    redisGet,
    redisGetDel,
    redisSet,
    redisDel,
    deleteIfValueMatches,
    incrWithExpire,
    verifyUserPassword,
    loginNewSession,
    revokeOtherSessions,
    getSessionIdFromToken,
    auditRecord,
  };
};

type MfaTestInternals = {
  encrypt: (value: string) => string;
  hotp: (secret: string, counter: number) => string;
};

const getEncryptedSecretAndCurrentCode = (service: MfaService) => {
  const internals = service as unknown as MfaTestInternals;
  const secret = 'JBSWY3DPEHPK3PXP';
  const encryptedSecret = internals.encrypt(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  const code = internals.hotp(secret, counter);
  return { encryptedSecret, code };
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

  it('does not consume a newer MFA setup when the verified setup was replaced', async () => {
    const {
      service,
      redisGet,
      deleteIfValueMatches,
      updateUser,
      revokeOtherSessions,
    } = createService();
    const { encryptedSecret, code } = getEncryptedSecretAndCurrentCode(service);
    redisGet.mockResolvedValue(encryptedSecret);
    deleteIfValueMatches.mockResolvedValue(false);

    await expect(
      service.enable(7, 'current-password', code, 'session-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(deleteIfValueMatches).toHaveBeenCalledWith(
      'mfa:totp:setup:7',
      encryptedSecret,
    );
    expect(updateUser).not.toHaveBeenCalled();
    expect(revokeOtherSessions).not.toHaveBeenCalled();
  });

  it('enables MFA and revokes other sessions in the same transaction', async () => {
    const {
      service,
      redisGet,
      redisSet,
      deleteIfValueMatches,
      transaction,
      transactionUpdate,
      transactionManager,
      revokeOtherSessions,
    } = createService();
    const { encryptedSecret, code } = getEncryptedSecretAndCurrentCode(service);
    redisGet.mockResolvedValue(encryptedSecret);
    deleteIfValueMatches.mockResolvedValue(true);
    redisSet.mockResolvedValue('OK');

    await expect(
      service.enable(7, 'current-password', code, 'session-id'),
    ).resolves.toEqual({ enabled: true });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionUpdate).toHaveBeenCalledWith(
      User,
      { id: 7, role: Role.ADMIN },
      expect.objectContaining({ mfa_totp_enabled: true }),
    );
    expect(revokeOtherSessions).toHaveBeenCalledWith(
      7,
      'session-id',
      'mfa_enabled',
      transactionManager,
    );
  });

  it('does not report MFA enabled when the administrator state changed concurrently', async () => {
    const {
      service,
      redisGet,
      redisSet,
      deleteIfValueMatches,
      transactionUpdate,
      revokeOtherSessions,
      auditRecord,
    } = createService();
    const { encryptedSecret, code } = getEncryptedSecretAndCurrentCode(service);
    redisGet.mockResolvedValue(encryptedSecret);
    deleteIfValueMatches.mockResolvedValue(true);
    redisSet.mockResolvedValue('OK');
    transactionUpdate.mockResolvedValue({ affected: 0 });

    await expect(
      service.enable(7, 'current-password', code, 'session-id'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(revokeOtherSessions).not.toHaveBeenCalled();
    expect(auditRecord).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'ADMIN_MFA_ENABLED' }),
    );
  });

  it('disables MFA and revokes other sessions in the same transaction', async () => {
    const {
      service,
      findOne,
      redisSet,
      transactionUpdate,
      transactionManager,
      revokeOtherSessions,
    } = createService();
    const { encryptedSecret, code } = getEncryptedSecretAndCurrentCode(service);
    findOne.mockResolvedValue({
      id: 7,
      mfa_totp_secret: encryptedSecret,
      mfa_totp_enabled: true,
    });
    redisSet.mockResolvedValue('OK');

    await expect(
      service.disable(7, 'current-password', code, 'session-id'),
    ).resolves.toEqual({ enabled: false });

    expect(transactionUpdate).toHaveBeenCalledWith(
      User,
      { id: 7, role: Role.ADMIN, mfa_totp_enabled: true },
      { mfa_totp_secret: null, mfa_totp_enabled: false },
    );
    expect(revokeOtherSessions).toHaveBeenCalledWith(
      7,
      'session-id',
      'mfa_disabled',
      transactionManager,
    );
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

  it('rejects a replayed MFA challenge before creating another session', async () => {
    const {
      service,
      findOne,
      redisGet,
      redisGetDel,
      incrWithExpire,
      loginNewSession,
      auditRecord,
    } = createService();
    const { encryptedSecret, code } = getEncryptedSecretAndCurrentCode(service);
    redisGet.mockResolvedValue('7');
    incrWithExpire.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    findOne.mockResolvedValue({
      id: 7,
      mfa_totp_secret: encryptedSecret,
      mfa_totp_enabled: true,
      is_blocked: false,
    });
    redisGetDel.mockResolvedValue(null);

    await expect(
      service.completeLogin('challenge', code, {
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(redisGetDel).toHaveBeenCalledTimes(1);
    expect(loginNewSession).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ADMIN_MFA_LOGIN_REPLAYED',
        success: false,
        userId: 7,
      }),
    );
  });

  it('rejects a TOTP code replayed through a different valid challenge', async () => {
    const {
      service,
      findOne,
      redisGet,
      redisGetDel,
      redisSet,
      incrWithExpire,
      loginNewSession,
      auditRecord,
    } = createService();
    const { encryptedSecret, code } = getEncryptedSecretAndCurrentCode(service);
    redisGet.mockResolvedValue('7');
    redisGetDel.mockResolvedValue('7');
    redisSet.mockResolvedValue(null);
    incrWithExpire.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    findOne.mockResolvedValue({
      id: 7,
      mfa_totp_secret: encryptedSecret,
      mfa_totp_enabled: true,
      is_blocked: false,
    });

    await expect(
      service.completeLogin('different-challenge', code, {
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(redisGetDel).toHaveBeenCalledTimes(1);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^mfa:totp:used:7:/),
      '1',
      { EX: 120, NX: true },
    );
    expect(loginNewSession).not.toHaveBeenCalled();
    expect(auditRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'ADMIN_MFA_TOTP_REPLAYED',
        success: false,
        userId: 7,
      }),
    );
  });

  it('creates a session only after atomically consuming the MFA challenge and TOTP code', async () => {
    const {
      service,
      findOne,
      redisGet,
      redisGetDel,
      redisSet,
      redisDel,
      incrWithExpire,
      loginNewSession,
      getSessionIdFromToken,
    } = createService();
    const { encryptedSecret, code } = getEncryptedSecretAndCurrentCode(service);
    redisGet.mockResolvedValue('7');
    redisGetDel.mockResolvedValue('7');
    redisSet.mockResolvedValue('OK');
    redisDel.mockResolvedValue(1);
    incrWithExpire.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    findOne.mockResolvedValue({
      id: 7,
      mfa_totp_secret: encryptedSecret,
      mfa_totp_enabled: true,
      is_blocked: false,
    });
    loginNewSession.mockResolvedValue({ access_token: 'access-token' });
    getSessionIdFromToken.mockReturnValue('session-id');

    await expect(
      service.completeLogin('challenge', code, {
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
      }),
    ).resolves.toEqual({ access_token: 'access-token' });

    expect(redisGetDel).toHaveBeenCalledTimes(1);
    expect(redisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^mfa:totp:used:7:/),
      '1',
      { EX: 120, NX: true },
    );
    expect(loginNewSession).toHaveBeenCalledWith(7, {
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });
});
