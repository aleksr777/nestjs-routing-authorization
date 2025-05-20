import {
  Inject,
  forwardRef,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { Repository, EntityNotFoundError } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  ErrTextAuth,
  ErrTextUsers,
  textServerError,
} from '../constants/error-messages';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../types/jwt-payload.type';
import { removeSensitiveInfo } from '../utils/remove-sensitive-info.util';
import {
  USER_PROFILE_FIELDS,
  USER_PASSWORD,
  USER_SECRET_FIELDS,
} from '../constants/user-select-fields';

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;
  config: any;
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

  private async saveRefreshToken(userId: number, refresh_token: string) {
    try {
      await this.usersRepository.update(userId, { refresh_token });
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }

  private async removeRefreshToken(userId: number) {
    try {
      await this.usersRepository.update(userId, {
        refresh_token: null as unknown as string,
      });
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
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
      throw new InternalServerErrorException(
        ErrTextAuth.INVALID_TOKEN_MISSING_EXP,
      );
    }
    return decoded.exp;
  }

  private generateTokens(user: User) {
    const payload = {
      sub: user.id,
      email: user.email,
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

  async validateByEmailAndPassword(email: string, password: string) {
    let userData: User;
    try {
      userData = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, USER_PASSWORD],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_EMAIL_OR_PASSWORD);
      }
      throw new InternalServerErrorException(textServerError);
    }
    const isPasswordValid = await this.comparePasswords(
      password,
      userData.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_EMAIL_OR_PASSWORD);
    }
    return removeSensitiveInfo(userData, [...USER_SECRET_FIELDS]);
  }

  async validateByAccessToken(id: number) {
    let userData: User;
    try {
      userData = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_TOKEN);
      }
      throw new InternalServerErrorException(textServerError);
    }
    return removeSensitiveInfo(userData, [...USER_SECRET_FIELDS]);
  }

  async validateByRefreshToken(id: number, refreshToken: string) {
    let userData: User;
    try {
      userData = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS, 'refresh_token'],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_REFRESH_TOKEN);
      }
      throw new InternalServerErrorException(textServerError);
    }
    if (refreshToken !== userData.refresh_token) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_REFRESH_TOKEN);
    }
    return removeSensitiveInfo(userData, [USER_PASSWORD]);
  }

  async login(user: User) {
    try {
      const tokens = this.generateTokens(user);
      await this.saveRefreshToken(user.id, tokens.refresh_token);
      return tokens;
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }

  async register(createUserDto: CreateUserDto) {
    try {
      const hashedPassword = await this.hashPassword(createUserDto.password);
      const user = await this.usersService.create({
        ...createUserDto,
        password: hashedPassword,
      });
      const tokens = this.generateTokens(user);
      await this.saveRefreshToken(user.id, tokens.refresh_token);
      return tokens;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(textServerError);
    }
  }

  async logout(user: User) {
    try {
      await this.removeRefreshToken(user.id);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrTextAuth.REFRESH_TOKEN_MISMATCH);
      }
      throw new InternalServerErrorException(textServerError);
    }
  }

  async refreshTokens(user: User) {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_REFRESH_TOKEN);
    }
    try {
      this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
      const tokens = this.generateTokens(user);
      await this.saveRefreshToken(user.id, tokens.refresh_token);
      return tokens;
    } catch (error) {
      if (error instanceof Error) {
        if (
          error.name === 'TokenExpiredError' ||
          error.name === 'JsonWebTokenError'
        ) {
          throw new UnauthorizedException(ErrTextAuth.INVALID_REFRESH_TOKEN);
        }
      }
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrTextAuth.REFRESH_TOKEN_MISMATCH);
      }
      throw new InternalServerErrorException(textServerError);
    }
  }
}
