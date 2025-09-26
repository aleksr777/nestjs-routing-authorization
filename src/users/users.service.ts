import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { TokensService } from '../auth/tokens.service';
import { AuthService } from '../auth/auth.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { User } from './entities/user.entity';
import { UpdatePartialUserDataDto } from './dto/update-partial-user-data.dto';
import {
  ID,
  ROLE,
  USER_PUBLIC_FIELDS,
  USER_PROFILE_FIELDS,
  USER_SECRET_FIELDS,
  USER_CONFIDENTIAL_FIELDS,
  SPECIAL_UPDATE_FIELDS,
  USER_UNIQUE_FIELDS,
} from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';
import { specialUpdateFields } from '../common/types/special-update-fields.type';
import { userUniqueFields } from '../common/types/user-unique-fields.type';
import { Role } from '../common/types/role.enum';
import { ErrMsg } from 'src/common/errors-service/error-messages.type';
import { PublicUser } from 'src/common/types/user-secret-key.type';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly tokensService: TokensService,
    private readonly authService: AuthService,
    private readonly errorsService: ErrorsService,
  ) {}

  async getCurrentProfile(userId: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: userId },
        select: [...USER_PROFILE_FIELDS],
      });
      return this.authService.removeSensitiveInfo(user, [
        ...USER_SECRET_FIELDS,
      ]);
    } catch (err: unknown) {
      this.errorsService.userNotFound(err);
      this.errorsService.default(err);
    }
  }
  async deleteCurrentUser(userId: number, access_token: string | undefined) {
    if (!access_token) {
      this.errorsService.tokenNotDefined(TokenType.ACCESS);
    } else {
      const qr = this.dataSource.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        const user = await qr.manager.findOneOrFail(User, {
          where: { id: userId },
          select: [ID, ROLE],
        });
        if (user.role === Role.ADMIN) {
          this.errorsService.badRequest(
            'Administrator account cannot be deleted.',
          );
        }
        await qr.manager.delete(User, { id: userId });
        await this.tokensService.addJwtTokenToBlacklist(
          access_token,
          TokenType.ACCESS,
        );
        await qr.commitTransaction();
      } catch (err: unknown) {
        await qr.rollbackTransaction();
        if (err instanceof HttpException) {
          throw err;
        }
        this.errorsService.userNotFound(err);
        this.errorsService.default(err);
      } finally {
        await qr.release();
      }
    }
  }

  async getUsersQuery(limit: number, offset: number, nickname?: string) {
    try {
      if (limit <= 0 || offset < 0) {
        this.errorsService.badRequest('Invalid pagination parameters');
      }
      const query = this.usersRepository
        .createQueryBuilder('user')
        .select(USER_PUBLIC_FIELDS.map((f) => `user.${f}`))
        .take(limit)
        .skip(offset);
      if (nickname) {
        query.where('user.nickname ILIKE :nickname', {
          nickname: `%${nickname}%`,
        });
      }
      const users = await query.getMany();
      return this.authService.removeSensitiveInfo(users, [
        ...USER_SECRET_FIELDS,
        ...USER_CONFIDENTIAL_FIELDS,
      ]);
    } catch (err: unknown) {
      this.errorsService.default(err);
    }
  }

  async updatePartialUserData(
    userId: number,
    userData: UpdatePartialUserDataDto,
  ) {
    const specialFields: string[] = [];
    const emptyFields: string[] = [];
    const conflictsFields: string[] = [];
    const patch = userData as Record<string, unknown>;
    if (!userData || Object.keys(userData).length === 0) {
      this.errorsService.badRequest(ErrMsg.NO_FIELDS_FOR_UPDATE);
    }
    for (const key of Object.keys(userData)) {
      const v = patch[key];
      if (!v) {
        emptyFields.push(key);
      }
      if (SPECIAL_UPDATE_FIELDS.includes(key as specialUpdateFields)) {
        specialFields.push(key);
      }
    }
    if (specialFields.length > 0) {
      this.errorsService.badRequest(
        ErrMsg.FIELDS_CANNOT_BE_UPDATED,
        specialFields,
      );
    }
    if (emptyFields.length > 0) {
      this.errorsService.badRequest(ErrMsg.FIELDS_CANNOT_BE_EMPTY, emptyFields);
    }
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      for (const key of Object.keys(userData)) {
        if (USER_UNIQUE_FIELDS.includes(key as userUniqueFields)) {
          const v = patch[key];
          const exists = await qr.manager.getRepository(User).exists({
            where: { [key]: v, id: Not(userId) },
          });
          if (exists) conflictsFields.push(key);
        }
      }
      const result = await qr.manager
        .createQueryBuilder()
        .update(User)
        .set(userData)
        .where('id = :id', { id: userId })
        .execute();
      if (result.affected === 0) {
        await qr.rollbackTransaction();
        this.errorsService.userNotFound();
      }
      const user: User = await qr.manager
        .createQueryBuilder(User, 'user')
        .addSelect(USER_PROFILE_FIELDS.map((f) => `user.${f}`))
        .where('user.id = :id', { id: userId })
        .getOneOrFail();
      await qr.commitTransaction();
      return this.authService.removeSensitiveInfo(
        user,
        USER_SECRET_FIELDS,
      ) as PublicUser;
    } catch (err) {
      await qr.rollbackTransaction();
      if (err instanceof HttpException) throw err;
      this.errorsService.userNotFound(err);
      this.errorsService.userConflict(err, conflictsFields);
      this.errorsService.default(err);
    } finally {
      await qr.release();
    }
  }
}
