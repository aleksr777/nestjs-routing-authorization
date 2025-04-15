import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUniqueError } from '../utils/is-unique-error';
import { Repository, DataSource, EntityNotFoundError } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { ErrTextUsers } from '../constants/error-messages';
import { verifyOwner } from '../utils/verify-owner';

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

  async updateUser(
    userId: number,
    ownId: number,
    updateUserDto: UpdateUserDto,
  ) {
    verifyOwner(userId, ownId, ErrTextUsers.ACCESS_DENIED);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.findOneOrFail(User, {
        where: { id: userId },
      });
      const user = this.usersRepository.create({
        id: userId,
        ...updateUserDto,
      });
      const updatedUser = await queryRunner.manager.save(User, user);
      await queryRunner.commitTransaction();
      return updatedUser;
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

  async removeUser(userId: number, ownId: number) {
    verifyOwner(userId, ownId, ErrTextUsers.ACCESS_DENIED);
    if (userId !== ownId) {
      throw new ForbiddenException('You can only update your own profile');
    }
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await queryRunner.manager.findOneOrFail(User, {
        where: { id: userId },
      });
      await queryRunner.manager.delete(User, { id: userId });
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

  async findAllUsers(): Promise<User[]> {
    try {
      const users = await this.usersRepository.find({
        select: ['id', 'nickname'],
      });
      return users;
    } catch {
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findUserById(userId: number): Promise<User> {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: userId },
        select: ['id', 'nickname'],
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

  async findUserByNickname(nickname: string): Promise<User> {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { nickname: nickname },
        select: ['id', 'nickname'],
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

  async findUserByEmail(email: string): Promise<User> {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { email: email },
        select: ['id', 'email', 'password', 'nickname'],
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
}
