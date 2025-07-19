import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { HashService } from '../common/hash-service/hash.service';
import { TokensService } from '../auth/tokens.service';
import { AuthService } from '../auth/auth.service';
import { ErrorsHandlerService } from '../common/errors-handler-service/errors-handler.service';
import { User } from './entities/user.entity';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import {
  USER_PUBLIC_FIELDS,
  USER_PROFILE_FIELDS,
  USER_SECRET_FIELDS,
  USER_CONFIDENTIAL_FIELDS,
} from '../config/user-select-fields.constants';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly tokensService: TokensService,
    private readonly authService: AuthService,
    private readonly hashService: HashService,
    private readonly errorsHandlerService: ErrorsHandlerService,
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
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleDefaultError(err);
    }
  }

  async removeCurrentUser(userId: number, access_token: string | undefined) {
    if (!access_token) {
      return this.errorsHandlerService.handleTokenNotDefined();
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.findOneOrFail(User, {
        where: { id: userId },
      });
      await queryRunner.manager.delete(User, { id: userId });
      await this.tokensService.addJwtTokenToBlacklist(access_token);
      await queryRunner.commitTransaction();
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleDefaultError(err);
    } finally {
      await queryRunner.release();
    }
  }

  async updateCurrentUser(userId: number, userData: UpdateUserDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (userData.password) {
        userData.password = await this.hashService.hash(userData.password);
      }
      const result = await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set(userData)
        .where('id = :id', { id: userId })
        .execute();
      if (result.affected === 0) {
        await queryRunner.rollbackTransaction();
        return this.errorsHandlerService.handleUserNotFound();
      }
      const user = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .addSelect([...USER_PROFILE_FIELDS.map((f) => `user.${f}`)])
        .where('user.id = :id', { id: userId })
        .getOneOrFail();
      await queryRunner.commitTransaction();
      return this.authService.removeSensitiveInfo(user, USER_SECRET_FIELDS);
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleUserConflict(err);
      this.errorsHandlerService.handleDefaultError(err);
    } finally {
      await queryRunner.release();
    }
  }

  async getUsersQuery(limit: number, offset: number, nickname?: string) {
    try {
      if (limit <= 0 || offset < 0) {
        throw new BadRequestException('Invalid pagination parameters');
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
      this.errorsHandlerService.handleDefaultError(err);
    }
  }
}
