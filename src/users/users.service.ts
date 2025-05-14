import {
  Inject,
  forwardRef,
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUniqueError } from '../utils/is-unique-error.util';
import { Repository, DataSource, EntityNotFoundError } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { ErrTextUsers, textServerError } from '../constants/error-messages';
import {
  USER_PUBLIC_FIELDS,
  USER_PROFILE_FIELDS,
} from '../constants/user-select-fields';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      const user = this.usersRepository.create({ ...createUserDto });
      const createdUser = await this.usersRepository.save(user);
      return createdUser;
      //removeSensitiveInfo(userData, ['password', 'refresh_token']);
    } catch (err: unknown) {
      if (isUniqueError(err)) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      } else {
        throw new InternalServerErrorException(textServerError);
      }
    }
  }

  async getCurrentProfile(ownId: number): Promise<Partial<User>> {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id: ownId },
        select: [...USER_PROFILE_FIELDS],
      });
      //removeSensitiveInfo(userData, ['password', 'refresh_token']);
      return user;
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(textServerError);
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
        updateUserDto.password = await this.authService.hashPassword(
          updateUserDto.password,
        );
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
      //removeSensitiveInfo(userData, ['password', 'refresh_token']);
      return result;
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      if (isUniqueError(err)) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(textServerError);
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
      throw new InternalServerErrorException(textServerError);
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
      //removeSensitiveInfo(userData, ['password', 'refresh_token']);
      return users;
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }
}
