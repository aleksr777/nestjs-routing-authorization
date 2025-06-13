import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Repository, EntityNotFoundError, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  ErrTextAuth,
  ErrTextUsers,
  INTERNAL_SERVER_ERROR,
} from '../constants/error-messages';
import { JwtPayload } from '../types/jwt-payload.type';
import { removeSensitiveInfo } from '../utils/remove-sensitive-info.util';
import {
  USER_PROFILE_FIELDS,
  USER_PASSWORD,
  USER_SECRET_FIELDS,
} from '../constants/user-select-fields';
import { isUniqueError } from '../utils/is-unique-error.util';
import { UpdateUserDto } from '../users/dto/update-user.dto';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  config: any;
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {
    this.accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessExpiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_EXPIRES_IN',
    );
    this.refreshExpiresIn = this.configService.getOrThrow<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );
  }

  async hashPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }

  private async comparePasswords(
    plain: string,
    hashed: string,
  ): Promise<boolean> {
    return await bcrypt.compare(plain, hashed);
  }

  private getTokenExpiration(token: string) {
    const decoded = this.jwtService.decode<JwtPayload>(token);
    if (!decoded?.exp) {
      throw new InternalServerErrorException(ErrTextAuth.INVALID_TOKEN);
    }
    return decoded.exp;
  }

  private generateTokens(userId: number) {
    const payload = {
      sub: userId,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessExpiresIn,
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshExpiresIn,
    });
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expires: this.getTokenExpiration(accessToken),
      refresh_token_expires: this.getTokenExpiration(refreshToken),
    };
  }

  private async saveRefreshToken(userId: number, refresh_token: string) {
    try {
      const result = await this.usersRepository.update(userId, {
        refresh_token,
      });
      if (result.affected === 0) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
    } catch {
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
  }

  private async removeRefreshToken(userId: number) {
    try {
      const result = await this.usersRepository.update(userId, {
        refresh_token: null as unknown as string,
      });
      if (result.affected === 0) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
    } catch {
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
  }

  private verifyRefreshToken(refreshToken: string) {
    this.jwtService.verify<JwtPayload>(refreshToken, {
      secret: this.refreshSecret,
    });
  }

  async validateByEmailAndPassword(email: string, password: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, USER_PASSWORD],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_EMAIL_OR_PASSWORD);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
    const isPasswordValid = await this.comparePasswords(
      password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_EMAIL_OR_PASSWORD);
    }
    return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
  }

  async validateByAccessToken(id: number) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
    return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
  }

  async validateByRefreshToken(id: number, refreshToken: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS, 'refresh_token'],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
    if (refreshToken !== user.refresh_token) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
    }
    return removeSensitiveInfo(user, [USER_PASSWORD]);
  }

  async register(dto: CreateUserDto) {
    const hashedPassword = await this.hashPassword(dto.password);
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = queryRunner.manager.create(User, {
        ...dto,
        password: hashedPassword,
      });

      const savedUser = await queryRunner.manager.save(user);
      const tokens = this.generateTokens(savedUser.id);

      await queryRunner.manager.update(User, savedUser.id, {
        refresh_token: tokens.refresh_token,
      });

      await queryRunner.commitTransaction();

      return tokens;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (isUniqueError(error)) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }

  async login(id: number) {
    try {
      const tokens = this.generateTokens(id);
      await this.saveRefreshToken(id, tokens.refresh_token);
      return tokens;
    } catch {
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
  }

  async logout(id: number) {
    try {
      await this.removeRefreshToken(id);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
  }

  async refreshTokens(id: number, refresh_token: string | undefined) {
    if (!refresh_token) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
    }
    this.verifyRefreshToken(refresh_token);
    const tokens = this.generateTokens(id);
    try {
      await this.saveRefreshToken(id, tokens.refresh_token);
      return tokens;
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.name === 'TokenExpiredError' ||
          error.name === 'JsonWebTokenError'
        ) {
          throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
        }
      }
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    }
  }

  async updateCurrentUser(ownId: number, updateUserDto: UpdateUserDto) {
    const dto = { ...updateUserDto };
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      if (dto.password) {
        dto.password = await this.hashPassword(dto.password);
      }
      const result = await queryRunner.manager
        .createQueryBuilder()
        .update(User)
        .set(dto)
        .where('id = :id', { id: ownId })
        .execute();
      if (result.affected === 0) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      const user = await queryRunner.manager
        .createQueryBuilder(User, 'user')
        .addSelect([...USER_PROFILE_FIELDS.map((f) => `user.${f}`)])
        .where('user.id = :id', { id: ownId })
        .getOneOrFail();
      await queryRunner.commitTransaction();
      return removeSensitiveInfo(user, USER_SECRET_FIELDS);
    } catch (err: unknown) {
      await queryRunner.rollbackTransaction();
      if (err instanceof EntityNotFoundError) {
        throw new NotFoundException(ErrTextUsers.USER_NOT_FOUND);
      }
      if (isUniqueError(err)) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(INTERNAL_SERVER_ERROR);
    } finally {
      await queryRunner.release();
    }
  }
}
