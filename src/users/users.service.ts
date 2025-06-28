import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { HashPasswordService } from '../common/hash-password/hash-password.service';
import { TokensService } from '../auth/tokens.service';
import { ErrorsHandlerService } from '../common/errors-handler/errors-handler.service';
import { User } from './entities/user.entity';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import {
  USER_PUBLIC_FIELDS,
  USER_PROFILE_FIELDS,
  USER_SECRET_FIELDS,
  USER_CONFIDENTIAL_FIELDS,
} from '../constants/user-select-fields';
import { removeSensitiveInfo } from '../utils/remove-sensitive-info.util';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly tokensService: TokensService,
    private readonly hashPasswordService: HashPasswordService,
    private readonly errorsHandlerService: ErrorsHandlerService,
  ) {}

  async getCurrentProfile(userId: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: userId },
        select: [...USER_PROFILE_FIELDS],
      });
      return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
    } catch (err: unknown) {
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleDefaultError();
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
      await this.tokensService.addToBlacklist(access_token);
      await queryRunner.commitTransaction();
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleDefaultError();
    } finally {
      await queryRunner.release();
    }
  }

  async updateCurrentUser(userId: number, updateUserDto: UpdateUserDto) {
    const dto = { ...updateUserDto };
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (dto.password) {
        dto.password = await this.hashPasswordService.hashPassword(
          dto.password,
        );
      }
      const result = await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set(dto)
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
      return removeSensitiveInfo(user, USER_SECRET_FIELDS);
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      this.errorsHandlerService.handleUserNotFound(err);
      this.errorsHandlerService.handleUserConflict(err);
      this.errorsHandlerService.handleDefaultError();
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
      return removeSensitiveInfo(users, [
        ...USER_SECRET_FIELDS,
        ...USER_CONFIDENTIAL_FIELDS,
      ]);
    } catch {
      this.errorsHandlerService.handleDefaultError();
    }
  }
}
