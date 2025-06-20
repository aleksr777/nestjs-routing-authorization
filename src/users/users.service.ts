import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityNotFoundError } from 'typeorm';
import { HashPasswordService } from '../auth/hash-password.service';
//import { TokensService } from '../auth/tokens.service';
import { User } from './entities/user.entity';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { ErrMessages } from '../constants/error-messages';
import {
  USER_PUBLIC_FIELDS,
  USER_PROFILE_FIELDS,
  USER_SECRET_FIELDS,
  USER_CONFIDENTIAL_FIELDS,
} from '../constants/user-select-fields';
import { removeSensitiveInfo } from '../utils/remove-sensitive-info.util';
import { isUniqueError } from '../utils/is-unique-error.util';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    //private readonly tokensService: TokensService,
    private readonly hashPasswordService: HashPasswordService,
  ) {}

  async getCurrentProfile(userId: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: userId },
        select: [...USER_PROFILE_FIELDS],
      });
      return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
  }

  async removeCurrentUser(
    userId: number /* , access_token: string | undefined */,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.findOneOrFail(User, {
        where: { id: userId },
      });
      await queryRunner.manager.delete(User, { id: userId });
      //await this.tokensService.addToBlacklist(access_token);
      await queryRunner.commitTransaction();
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
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
        throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
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
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
      }
      if (isUniqueError(err)) {
        throw new ConflictException(ErrMessages.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
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
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
  }
}
