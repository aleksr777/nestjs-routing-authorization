import { DataSource, Repository } from 'typeorm';
import { AdminService } from './admin.service';
import { ActivityService } from '../activity/activity.service';
import { AuthService } from '../auth/auth.service';
import { AuthSession } from '../auth/entities/auth-session.entity';
import { ErrorsService } from '../common/errors-service/errors.service';
import { HashService } from '../common/hash-service/hash.service';
import { MailService } from '../common/mail-service/mail.service';
import { Role } from '../common/types/role.enum';
import { User } from '../users/entities/user.entity';

describe('administrator account actions', () => {
  let service: AdminService;
  let compare: jest.Mock;
  let manager: {
    findOneOrFail: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  beforeEach(() => {
    compare = jest.fn(() => true);
    manager = {
      findOneOrFail: jest.fn(
        (_entity: unknown, options: { where: { id: number } }) =>
          options.where.id === 1
            ? { id: 1, role: Role.ADMIN, password: 'hash' }
            : {
                id: 2,
                email: 'user@example.test',
                nickname: 'User',
                role: Role.USER,
                is_blocked: false,
              },
      ),
      update: jest.fn(),
      delete: jest.fn(),
    };
    const qr = {
      manager,
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
    };
    service = new AdminService(
      { createQueryRunner: () => qr } as unknown as DataSource,
      {} as Repository<User>,
      {} as AuthService,
      { compare } as unknown as HashService,
      new ErrorsService(),
      { send: jest.fn() } as unknown as MailService,
      {
        deleteUserActivities: jest.fn(() => Promise.resolve()),
      } as unknown as ActivityService,
    );
  });
  it('blocks without a password and revokes the affected user sessions', async () => {
    await service.blockUserById(1, 2, ' Test reason ');
    expect(compare).not.toHaveBeenCalled();
    expect(manager.update).toHaveBeenCalledWith(
      User,
      { id: 2 },
      expect.objectContaining({
        is_blocked: true,
        blocked_reason: 'Test reason',
        blocked_by: 1,
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      AuthSession,
      expect.objectContaining({ user_id: 2 }),
      expect.objectContaining({ revoked_reason: 'account_blocked' }),
    );
  });
  it('still rejects deleting a user with an incorrect administrator password', async () => {
    compare.mockResolvedValue(false);
    await expect(
      service.deleteUserById(1, 2, 'incorrect'),
    ).rejects.toMatchObject({ status: 400 });
    expect(manager.delete).not.toHaveBeenCalled();
  });
  it('requires the administrator password before deleting', async () => {
    await service.deleteUserById(1, 2, 'valid-password');
    expect(compare).toHaveBeenCalledWith('valid-password', 'hash');
    expect(manager.delete).toHaveBeenCalledWith(User, { id: 2 });
  });
  it('preserves the prohibition on blocking the administrator', async () => {
    await expect(service.blockUserById(1, 1, '')).rejects.toMatchObject({
      status: 400,
    });
    expect(manager.update).not.toHaveBeenCalled();
  });
});
