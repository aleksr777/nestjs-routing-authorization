import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { TokenPayloadDto } from './dto/token-payload.dto';
import { ErrTextAuth, textServerError } from '../constants/error-messages';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string) {
    try {
      const user = await this.usersService.checkUserByEmail(email);
      const isPasswordValid = await bcrypt.compare(pass, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException(ErrTextAuth.INVALID_EMAIL_OR_PASSWORD);
      }
      return { id: user.id };
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }

  private generateTokens(user: User): TokenPayloadDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      exp: 0, // Will be overwritten during signing
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(
      { ...payload, refreshTokenId: this.generateTokenId() },
      {
        secret: this.configService.get<string>('JWT_SECRET'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      },
    );
    return {
      accessToken,
      refreshToken,
      accessTokenExpires: this.getTokenExpiration(accessToken),
    };
  }

  private generateTokenId(): string {
    return randomBytes(16).toString('hex');
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
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }

  async logout(userId: number): Promise<void> {
    try {
      await this.usersService.removeRefreshToken(userId);
    } catch {
      throw new InternalServerErrorException(textServerError);
    }
  }

  async refreshTokens(refreshToken: string): Promise<TokenPayloadDto> {
    if (!refreshToken) {
      throw new UnauthorizedException(ErrTextAuth.INVALID_REFRESH_TOKEN);
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      const user = await this.usersService.getUserIfRefreshTokenMatches(
        refreshToken,
        payload.sub,
      );
      const tokens = this.generateTokens(user);
      await this.usersService.saveRefreshToken(user.id, tokens.refreshToken);
      return tokens;
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException) {
        throw new UnauthorizedException(ErrTextAuth.REFRESH_TOKEN_MISMATCH);
      }
      throw new InternalServerErrorException(textServerError);
    }
  }
}
