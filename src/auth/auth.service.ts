import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { Repository, EntityNotFoundError, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { HashPasswordService } from '../common/hash-password/hash-password.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { ErrMessages } from '../constants/error-messages';
import {
  USER_PROFILE_FIELDS,
  USER_PASSWORD,
  USER_SECRET_FIELDS,
} from '../constants/user-select-fields';
import { isUniqueError } from '../utils/is-unique-error.util';
import { removeSensitiveInfo } from '../utils/remove-sensitive-info.util';

@Injectable()
export class AuthService {
  config: any;
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly tokensService: TokensService,
    private readonly hashPasswordService: HashPasswordService,
  ) {}

  async validateUserByEmailAndPassword(email: string, password: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, USER_PASSWORD],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrMessages.INVALID_EMAIL_OR_PASSWORD);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
    const isPasswordValid = await this.hashPasswordService.comparePasswords(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(ErrMessages.INVALID_EMAIL_OR_PASSWORD);
    }
    return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
  }

  async validateUserById(id: number) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: ['id'],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
    return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
  }

  async validateUserByRefreshToken(id: number, refresh_token: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS, 'refresh_token'],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
    if (refresh_token !== user.refresh_token) {
      throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
    }
    return removeSensitiveInfo(user, [USER_PASSWORD]);
  }

  async register(dto: CreateUserDto) {
    const hashedPassword = await this.hashPasswordService.hashPassword(
      dto.password,
    );
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const user = queryRunner.manager.create(User, {
        ...dto,
        password: hashedPassword,
      });
      const savedUser = await queryRunner.manager.save(user);
      const tokens = this.tokensService.generateTokens(savedUser.id);
      await queryRunner.manager.update(User, savedUser.id, {
        refresh_token: tokens.refresh_token,
      });
      await queryRunner.commitTransaction();
      return tokens;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (isUniqueError(error)) {
        throw new ConflictException(ErrMessages.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  async login(userId: number) {
    try {
      const tokens = this.tokensService.generateTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch {
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
  }

  async logout(userId: number, access_token: string | undefined) {
    if (!access_token) {
      throw new UnauthorizedException(ErrMessages.TOKEN_NOT_DEFINED);
    }
    try {
      await this.tokensService.removeRefreshToken(userId);
      await this.tokensService.addToBlacklist(access_token);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
  }

  async refreshTokens(userId: number) {
    try {
      const tokens = this.tokensService.generateTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.name === 'TokenExpiredError' ||
          error.name === 'JsonWebTokenError'
        ) {
          throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
        }
      }
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
    }
  }
}
