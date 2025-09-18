import { HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
//import { HashService } from '../common/hash-service/hash.service';
import { TokensService } from '../auth/tokens.service';
import { AuthService } from '../auth/auth.service';
import { ErrorsService } from '../common/errors-service/errors.service';
import { User } from './entities/user.entity';
/* import { UpdateUserDto } from './dto/update-user.dto'; */
import {
  ID,
  ROLE,
  USER_PUBLIC_FIELDS,
  USER_PROFILE_FIELDS,
  USER_SECRET_FIELDS,
  USER_CONFIDENTIAL_FIELDS,
} from '../common/constants/user-select-fields.constants';
import { TokenType } from '../common/types/token-type.type';
import { Role } from '../common/types/role.enum';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly tokensService: TokensService,
    private readonly authService: AuthService,
    //private readonly hashService: HashService,
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
  async removeCurrentUser(userId: number, access_token: string | undefined) {
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

  /* async updateCurrentUser(userId: number, userData: UpdateUserDto) {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      if (userData.password) {
        userData.password = await this.hashService.hash(userData.password);
      }
      const result = await qr.manager
        .createQueryBuilder()
        .update(User)
        .set(userData)
        .where('id = :id', { id: userId })
        .execute();
      if (result.affected === 0) {
        await qr.rollbackTransaction();
        return this.errorsService.userNotFound();
      }
      const user = await qr.manager
        .createQueryBuilder(User, 'user')
        .addSelect([...USER_PROFILE_FIELDS.map((f) => `user.${f}`)])
        .where('user.id = :id', { id: userId })
        .getOneOrFail();
      await qr.commitTransaction();
      return this.authService.removeSensitiveInfo(user, USER_SECRET_FIELDS);
    } catch (err: unknown) {
      await qr.rollbackTransaction();
      this.errorsService.userNotFound(err);
      this.errorsService.userConflict(err);
      this.errorsService.default(err);
    } finally {
      await qr.release();
    }
  } */

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
}
