import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
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

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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
      accessToken,
      refreshToken,
      accessTokenExpires: this.getTokenExpiration(accessToken),
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
      await this.usersService.saveRefreshToken(user.id, tokens.refreshToken);
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
      await this.usersService.saveRefreshToken(user.id, tokens.refreshToken);
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

  async refreshTokens(authHeader: string): Promise<TokenPayloadDto> {
    // Забираем "Bearer <token>"
    const refreshToken = authHeader?.replace(/^Bearer\s+/i, '');
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
      await this.usersService.saveRefreshToken(user.id, tokens.refreshToken);
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
