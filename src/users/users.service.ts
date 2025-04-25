import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { isUniqueError } from '../utils/is-unique-error';
import { Repository, DataSource, EntityNotFoundError } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { ErrTextUsers } from '../constants/error-messages';
import {
  USER_PUBLIC_FIELDS,
  USER_PROFILE_FIELDS,
  USER_AUTH_FIELDS,
} from '../constants/user-select-fields';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      const user = this.usersRepository.create({ ...createUserDto });
      const createdUser = await this.usersRepository.save(user);
      return createdUser;
    } catch (err: unknown) {
      if (isUniqueError(err)) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      } else {
        throw new InternalServerErrorException(
          ErrTextUsers.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async getCurrentProfile(ownId: number): Promise<Partial<User>> {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: ownId },
        select: [...USER_PROFILE_FIELDS],
      });
      return user;
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async updateCurrentUser(ownId: number, updateUserDto: UpdateUserDto) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.findOneOrFail(User, {
        where: { id: ownId },
      });
      if (updateUserDto.password) {
        updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
      }
      const user = this.usersRepository.create({
        id: ownId,
        ...updateUserDto,
      });
      const updatedUser = await queryRunner.manager.save(User, user);
      await queryRunner.commitTransaction();
      const result = {
        id: updatedUser.id,
        nickname: updatedUser.nickname,
        email: user.email,
      };
      return result;
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      if (isUniqueError(err)) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async removeCurrentUser(ownId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.findOneOrFail(User, {
        where: { id: ownId },
      });
      await queryRunner.manager.delete(User, { id: ownId });
      await queryRunner.commitTransaction();
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getUsersQuery(
    limit: number,
    offset: number,
    nickname?: string,
  ): Promise<User[]> {
    try {
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
      return users;
    } catch {
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async checkUserByEmail(email: string): Promise<User> {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { email: email },
        select: [...USER_AUTH_FIELDS],
      });
      return user;
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextUsers.AUTH_FAILED_EMAIL);
      }
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
