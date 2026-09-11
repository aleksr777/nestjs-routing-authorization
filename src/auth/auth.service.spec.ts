import { UnauthorizedException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { SessionTokenService } from './session-token.service';
import { TokensService } from './tokens.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { HashService } from '../common/hash-service/hash.service';
import { JwtTokens } from '../common/types/jwt-tokens.type';
import { User } from '../users/entities/user.entity';

const createTokens = (refreshToken: string): JwtTokens => ({
  access_token: 'access-token',
  refresh_token: refreshToken,
  access_token_expires: 1_900_000_000,
  refresh_token_expires: 1_900_000_100,
});

describe('AuthService refresh-token rotation', () => {
  const hashService = new HashService();
  const errorsService = new ErrorsService();

  const createService = (storedRefreshTokenHash: string, nextToken: string) => {
    const queryRunner = {
      isTransactionActive: false,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn(function (this: {
        isTransactionActive: boolean;
      }) {
        this.isTransactionActive = true;
        return Promise.resolve();
      }),
      commitTransaction: jest.fn(function (this: {
        isTransactionActive: boolean;
      }) {
        this.isTransactionActive = false;
        return Promise.resolve();
      }),
      rollbackTransaction: jest.fn(function (this: {
        isTransactionActive: boolean;
      }) {
        this.isTransactionActive = false;
        return Promise.resolve();
      }),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn().mockResolvedValue({
          id: 7,
          refresh_token: storedRefreshTokenHash,
          is_blocked: false,
          blocked_reason: null,
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      },
    };

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    } as unknown as DataSource;
    const usersRepository = {} as Repository<User>;
    const tokensService = {} as TokensService;
    const sessionTokenService = {
      generate: jest.fn(() => createTokens(nextToken)),
    } as unknown as SessionTokenService;

    const service = new AuthService(
      usersRepository,
      dataSource,
      tokensService,
      sessionTokenService,
      hashService,
      errorsService,
    );

    return { service, queryRunner };
  };

  it('rotates a valid refresh token and stores only the new token hash', async () => {
    const currentToken = 'current-refresh-token';
    const nextToken = 'next-refresh-token';
    const { service, queryRunner } = createService(
      hashService.hashToken(currentToken),
      nextToken,
    );

    const result = await service.refreshJwtTokens(7, currentToken);

    expect(result?.refresh_token).toBe(nextToken);
    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      User,
      { id: 7 },
      { refresh_token: hashService.hashToken(nextToken) },
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('invalidates the active refresh session when an old token is replayed', async () => {
    const { service, queryRunner } = createService(
      hashService.hashToken('new-current-token'),
      'unused-next-token',
    );

    await expect(
      service.refreshJwtTokens(7, 'old-replayed-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(queryRunner.manager.update).toHaveBeenCalledWith(
      User,
      { id: 7 },
      { refresh_token: null },
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
