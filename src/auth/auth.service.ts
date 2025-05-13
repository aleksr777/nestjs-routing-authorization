import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { Repository, EntityNotFoundError } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { TokenPayloadDto } from './dto/token-payload.dto';
import {
  ErrTextAuth,
  ErrTextUsers,
  textServerError,
} from '../constants/error-messages';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../types/jwt-payload.type';
import { removeSensitiveInfo } from '../utils/remove-sensitive-info.util';
import { USER_PROFILE_FIELDS } from '../constants/user-select-fields';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateByEmailAndPassword(
    email: string,
    password: string,
  ): Promise<Omit<User, 'password'>> {
    let userData: User;
    try {
      userData = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, 'password'],
      });
    } catch (err: unknown) {
      if (err instanceof EntityNotFoundError) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_EMAIL_OR_PASSWORD);
      }
      throw new InternalServerErrorException(textServerError);
    }
    const isPasswordValid = await bcrypt.compare(password, userData.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_EMAIL_OR_PASSWORD);
    }
    return removeSensitiveInfo(userData, ['password', 'refresh_token']);
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
    return removeSensitiveInfo(userData, ['password', 'refresh_token']);
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
    return removeSensitiveInfo(userData, ['password']);
  }

  private generateTokens(user: User): TokenPayloadDto {
    const payloadData = {
      sub: user.id,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(
      { ...payloadData },
      {
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
      },
    );
    const refreshToken = this.jwtService.sign(
      {
        ...payloadData,
        refreshTokenId: randomBytes(16).toString('hex'),
      },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      },
    );
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      access_token_expires: this.getTokenExpiration(accessToken),
    };
  }

  private getTokenExpiration(token: string): number {
    const decoded = this.jwtService.decode<JwtPayload>(token);
    if (!decoded?.exp) {
      throw new InternalServerErrorException(
        ErrTextAuth.INVALID_TOKEN_MISSING_EXP,
      );
    }
    return decoded.exp;
  }

  async login(user: User): Promise<TokenPayloadDto> {
    try {
      const tokens = this.generateTokens(user);
      await this.usersService.saveRefreshToken(user.id, tokens.refresh_token);
      return tokens;
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }

  async register(createUserDto: CreateUserDto): Promise<TokenPayloadDto> {
    try {
      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
      const user = await this.usersService.create({
        ...createUserDto,
        password: hashedPassword,
      });
      const tokens = this.generateTokens(user);
      await this.usersService.saveRefreshToken(user.id, tokens.refresh_token);
      return tokens;
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new ConflictException(ErrTextUsers.CONFLICT_USER_EXISTS);
      }
      throw new InternalServerErrorException(textServerError);
    }
  }

  async logout(user: User): Promise<void> {
    try {
      await this.usersService.removeRefreshToken(user.id);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrTextAuth.REFRESH_TOKEN_MISMATCH);
      }
      throw new InternalServerErrorException(textServerError);
    }
  }

  async refreshTokens(user: User): Promise<TokenPayloadDto> {
    const refreshToken = user.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_REFRESH_TOKEN);
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.usersService.getUserIfRefreshTokenMatches(
        refreshToken,
        payload.sub,
      );
      const tokens = this.generateTokens(user);
      await this.usersService.saveRefreshToken(user.id, tokens.refresh_token);
      return tokens;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'TokenExpiredError') {
          throw new UnauthorizedException(ErrTextAuth.INVALID_REFRESH_TOKEN);
        }
        if (error.name === 'JsonWebTokenError') {
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
