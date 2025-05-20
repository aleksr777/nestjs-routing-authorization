import {
  Inject,
  forwardRef,
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
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
  USER_SECRET_FIELDS,
  USER_CONFIDENTIAL_FIELDS,
} from '../constants/user-select-fields';
import { AuthService } from '../auth/auth.service';
import { removeSensitiveInfo } from '../utils/remove-sensitive-info.util';

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
      //removeSensitiveInfo(userData, [...USER_SECRET_FIELDS]);
      return createdUser;
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
      //removeSensitiveInfo(userData, [...USER_SECRET_FIELDS]);
      return user;
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      throw new InternalServerErrorException(textServerError);
    }
  }

  async updateCurrentUser(ownId: number, updateUserDto: UpdateUserDto) {
    const dto = { ...updateUserDto };
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (dto.password) {
        dto.password = await this.authService.hashPassword(dto.password);
      }
      const updateResult = await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set(dto)
        .where('id = :id', { id: ownId })
        .execute();
      // если затронуто 0 строк — пользователя нет
      if (updateResult.affected === 0) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      const updatedUserData = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .addSelect([...USER_PROFILE_FIELDS.map((f) => `user.${f}`)])
        .where('user.id = :id', { id: ownId })
        .getOneOrFail();
      await queryRunner.commitTransaction();
      const safeUserData = removeSensitiveInfo(
        updatedUserData,
        USER_SECRET_FIELDS,
      );
      return safeUserData;
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
      const usersData = await query.getMany();
      const safeUsersData = removeSensitiveInfo(usersData, [
        ...USER_SECRET_FIELDS,
        ...USER_CONFIDENTIAL_FIELDS,
      ]);
      return safeUsersData;
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }
}
