import { randomUUID } from 'node:crypto';
import {
  Injectable,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { SessionTokenService } from './session-token.service';
import { HashService } from '../common/hash-service/hash.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { User } from '../users/entities/user.entity';
import { AuthSession } from './entities/auth-session.entity';
import {
  ID,
  ROLE,
  EMAIL,
  IS_BLOCKED,
  USER_PROFILE_FIELDS,
  PASSWORD,
  BLOCKED_REASON,
} from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';
import { Role } from '../common/types/role.enum';
import { JwtTokens } from '../common/types/jwt-tokens.type';

export type SessionContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuthService {
  config: any;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(AuthSession)
    private sessionsRepository: Repository<AuthSession>,
    private readonly dataSource: DataSource,
    private readonly tokensService: TokensService,
    private readonly sessionTokenService: SessionTokenService,
    private readonly hashService: HashService,
    private readonly errorsService: ErrorsService,
  ) {}

  removeSensitiveInfo<T extends object, K extends keyof T>(
    source: T | T[],
    keysToRemove: readonly K[],
  ): Omit<T, K> | Omit<T, K>[] {
    const remove = (item: T): Omit<T, K> => {
      const result = { ...item } as Partial<T>;
      for (const key of keysToRemove) {
        delete result[key];
      }
      return result as Omit<T, K>;
    };
    if (Array.isArray(source)) {
      return source.map(remove);
    } else {
      return remove(source);
    }
  }

  isUserBlocked(user: User) {
    if (user.is_blocked) {
      this.errorsService.accountBlocked(user.blocked_reason);
    }
  }

  async validateUserByEmailAndPassword(email: string, password: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, PASSWORD, IS_BLOCKED, BLOCKED_REASON],
      });
      const isPasswordValid = await this.hashService.compare(
        password,
        user.password,
      );
      this.errorsService.invalidEmailOrPassword(null, isPasswordValid);
      return user;
    } catch (err: unknown) {
      this.errorsService.invalidEmailOrPassword(err);
      this.errorsService.default(err);
    }
  }

  async getAdministratorEmail() {
    try {
      const administrator = await this.usersRepository.findOneOrFail({
        where: { role: Role.ADMIN },
        select: [EMAIL],
      });
      return administrator.email;
    } catch (err: unknown) {
      this.errorsService.userNotFound(err, 'Administrator not found');
      this.errorsService.default(err);
    }
  }

  async validateUserById(id: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [ID, ROLE, IS_BLOCKED, BLOCKED_REASON],
      });
      return user;
    } catch (err: unknown) {
      this.errorsService.userNotFound(err);
      this.errorsService.default(err);
    }
  }

  private getRefreshExpiration(tokens: JwtTokens): Date {
    if (typeof tokens.refresh_token_expires !== 'number') {
      this.errorsService.invalidToken(null, TokenType.REFRESH);
    }
    return new Date(tokens.refresh_token_expires * 1000);
  }

  private async createSession(
    userId: number,
    context: SessionContext = {},
  ): Promise<JwtTokens> {
    const sessionId = randomUUID();
    const tokens = this.sessionTokenService.generate(userId, sessionId);
    const now = new Date();
    const session = this.sessionsRepository.create({
      id: sessionId,
      user_id: userId,
      refresh_token_hash: this.hashService.hashToken(tokens.refresh_token),
      ip_address: context.ipAddress ?? null,
      user_agent: context.userAgent?.slice(0, 512) ?? null,
      last_used_at: now,
      expires_at: this.getRefreshExpiration(tokens),
      revoked_at: null,
      revoked_reason: null,
    });
    await this.sessionsRepository.save(session);
    return tokens;
  }

  async login(userId: number, context: SessionContext = {}) {
    try {
      await this.revokeAllSessions(userId, 'security_context_changed');
      return await this.createSession(userId, context);
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      this.errorsService.default(err);
    }
  }

  async loginNewSession(userId: number, context: SessionContext = {}) {
    try {
      return await this.createSession(userId, context);
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      this.errorsService.default(err);
    }
  }

  getSessionIdFromToken(token: string | undefined | null): string | null {
    return this.sessionTokenService.getSessionId(token);
  }

  async validateSession(
    userId: number,
    sessionId: string | undefined,
    tokenType: TokenType,
  ): Promise<AuthSession> {
    if (!sessionId) {
      this.errorsService.invalidToken(null, tokenType);
    }

    const session = await this.sessionsRepository.findOne({
      where: { id: sessionId, user_id: userId },
    });

    if (
      !session ||
      session.revoked_at !== null ||
      session.expires_at.getTime() <= Date.now()
    ) {
      this.errorsService.invalidToken(null, tokenType);
    }

    return session;
  }

  async logout(userId: number, access_token: string | undefined) {
    if (!access_token) {
      this.errorsService.tokenNotDefined(TokenType.ACCESS);
    }
    try {
      const sessionId = this.getSessionIdFromToken(access_token);
      if (!sessionId) {
        this.errorsService.invalidToken(null, TokenType.ACCESS);
      }
      await this.revokeSession(userId, sessionId, 'logout');
      await this.tokensService.addJwtTokenToBlacklist(
        access_token,
        TokenType.ACCESS,
      );
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) {
        this.errorsService.invalidToken(err, TokenType.ACCESS);
      }
      if (err instanceof HttpException) throw err;
      this.errorsService.default(err);
    }
  }

  async logoutAll(userId: number, access_token: string | undefined) {
    if (!access_token) {
      this.errorsService.tokenNotDefined(TokenType.ACCESS);
    }
    await this.revokeAllSessions(userId, 'logout_all');
    await this.tokensService.addJwtTokenToBlacklist(
      access_token,
      TokenType.ACCESS,
    );
  }

  async revokeAllSessions(userId: number, reason = 'revoked') {
    await this.sessionsRepository.update(
      { user_id: userId },
      { revoked_at: new Date(), revoked_reason: reason },
    );
  }

  async revokeSession(userId: number, sessionId: string, reason = 'revoked') {
    const result = await this.sessionsRepository.update(
      { id: sessionId, user_id: userId },
      { revoked_at: new Date(), revoked_reason: reason },
    );
    return (result.affected ?? 0) > 0;
  }

  async getSessions(userId: number, currentSessionId: string | null) {
    const sessions = await this.sessionsRepository.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });

    return sessions
      .filter(
        (session) =>
          session.revoked_at === null &&
          session.expires_at.getTime() > Date.now(),
      )
      .map((session) => ({
        id: session.id,
        ip_address: session.ip_address,
        user_agent: session.user_agent,
        created_at: session.created_at,
        last_used_at: session.last_used_at,
        expires_at: session.expires_at,
        current: session.id === currentSessionId,
      }));
  }

  async refreshJwtTokens(userId: number, currentRefreshToken: string | null) {
    if (!currentRefreshToken) {
      this.errorsService.tokenNotDefined(TokenType.REFRESH);
    }

    const sessionId = this.getSessionIdFromToken(currentRefreshToken);
    if (!sessionId) {
      this.errorsService.invalidToken(null, TokenType.REFRESH);
    }

    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const session = await qr.manager.findOne(AuthSession, {
        where: { id: sessionId, user_id: userId },
        select: [
          'id',
          'user_id',
          'refresh_token_hash',
          'expires_at',
          'revoked_at',
        ],
        lock: { mode: 'pessimistic_write' },
      });

      if (
        !session ||
        session.revoked_at !== null ||
        session.expires_at.getTime() <= Date.now()
      ) {
        this.errorsService.invalidToken(null, TokenType.REFRESH);
      }

      const isCurrentRefreshToken = this.hashService.compareToken(
        currentRefreshToken,
        session.refresh_token_hash,
      );

      if (!isCurrentRefreshToken) {
        await qr.manager.update(
          AuthSession,
          { id: sessionId, user_id: userId },
          { revoked_at: new Date(), revoked_reason: 'refresh_reuse' },
        );
        await qr.commitTransaction();
        this.errorsService.invalidToken(null, TokenType.REFRESH);
      }

      const tokens = this.sessionTokenService.generate(userId, sessionId);
      await qr.manager.update(
        AuthSession,
        { id: sessionId, user_id: userId },
        {
          refresh_token_hash: this.hashService.hashToken(tokens.refresh_token),
          last_used_at: new Date(),
          expires_at: this.getRefreshExpiration(tokens),
        },
      );
      await qr.commitTransaction();

      return tokens;
    } catch (err: unknown) {
      if (qr.isTransactionActive) {
        await qr.rollbackTransaction();
      }
      if (err instanceof HttpException) {
        throw err;
      }
      this.errorsService.invalidToken(err, TokenType.REFRESH);
    } finally {
      await qr.release();
    }
  }
}
