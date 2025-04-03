import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityNotFoundError } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { ErrTextUsers } from '../constants/error-messages';

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
    } catch (err) {
      if (err?.code === '23505') {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      } else {
        throw new InternalServerErrorException(
          ErrTextUsers.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  async updateUser(userId: number, updateUserDto: UpdateUserDto) {
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      if (err.code === '23505') {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    } finally {
      await queryRunner.release();
    }
  }

  async removeUser(userId: number) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = await queryRunner.manager.findOneOrFail(User, {
        where: { id: userId },
      });
      await queryRunner.manager.delete(User, { id: userId });
      await queryRunner.commitTransaction();
      return user;
    } catch (err) {
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
      const users = await this.usersRepository.find();
      return users;
    } catch (err) {
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async findUserById(userId: number): Promise<User> {
    try {
      return await this.usersRepository.findOneOrFail({
        where: { id: userId },
      });
    } catch (err) {
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
      return await this.usersRepository.findOneOrFail({
        where: { nickname: nickname },
      });
    } catch (err) {
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(
        ErrTextUsers.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
