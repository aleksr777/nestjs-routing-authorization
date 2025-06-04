import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityNotFoundError } from 'typeorm';
import { User } from './entities/user.entity';
import {
  ErrTextUsers,
  INTERNAL_SERVER_ERROR,
} from '../constants/error-messages';
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
  ) {}

  async getCurrentProfile(id: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS],
      });
      return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
  }

  async removeCurrentUser(id: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.findOneOrFail(User, {
        where: { id: id },
      });
      await queryRunner.manager.delete(User, { id: id });
      await queryRunner.commitTransaction();
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
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
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
  }
}
