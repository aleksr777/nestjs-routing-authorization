import { Injectable } from '@nestjs/common';
import { Repository, DataSource } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { TokensService } from './tokens.service';
import { HashPasswordService } from '../common/hash-password/hash-password.service';
import { ErrorsHandlerService } from '../common/errors-handler/errors-handler.service';
import { User } from '../users/entities/user.entity';
import { CreateUserDto } from '../users/dto/create-user.dto';
import {
  USER_PROFILE_FIELDS,
  USER_PASSWORD,
  USER_SECRET_FIELDS,
} from '../constants/user-select-fields';
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
    private readonly errorsHandlerService: ErrorsHandlerService,
  ) {}

  async validateUserByEmailAndPassword(email: string, password: string) {
    let user: User;
    try {
      user = await this.usersRepository.findOneOrFail({
        where: { email },
        select: [...USER_PROFILE_FIELDS, USER_PASSWORD],
      });
      const isPasswordValid = await this.hashPasswordService.comparePasswords(
        password,
        user.password,
      );
      this.errorsHandlerService.handleInvalidEmailOrPassword(
        null,
        isPasswordValid,
      );
      return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
    } catch (err: unknown) {
      this.errorsHandlerService.handleInvalidEmailOrPassword(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async validateUserById(id: number) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: ['id'],
      });
      return removeSensitiveInfo(user, [...USER_SECRET_FIELDS]);
    } catch (err: unknown) {
      this.errorsHandlerService.handleInvalidEmailOrPassword(err);
      this.errorsHandlerService.handleDefaultError();
      throw err;
    }
  }

  async validateUserByRefreshToken(id: number, refresh_token: string) {
    try {
      const user = await this.usersRepository.findOneOrFail({
        where: { id },
        select: [...USER_PROFILE_FIELDS, 'refresh_token'],
      });
      const isTokensMatch = refresh_token === user.refresh_token;
      this.errorsHandlerService.handleInvalidToken(null, isTokensMatch);
      return removeSensitiveInfo(user, [USER_PASSWORD]);
    } catch (err: unknown) {
      this.errorsHandlerService.handleInvalidToken(err);
      this.errorsHandlerService.handleDefaultError();
    }
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
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.errorsHandlerService.handleUserConflict(err);
      this.errorsHandlerService.handleDefaultError();
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
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async logout(userId: number, access_token: string | undefined) {
    if (!access_token) {
      return this.errorsHandlerService.handleTokenNotDefined();
    }
    try {
      await this.tokensService.removeRefreshToken(userId);
      await this.tokensService.addToBlacklist(access_token);
    } catch (err) {
      this.errorsHandlerService.handleInvalidToken(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }

  async refreshTokens(userId: number) {
    try {
      const tokens = this.tokensService.generateTokens(userId);
      await this.tokensService.saveRefreshToken(userId, tokens.refresh_token);
      return tokens;
    } catch (err) {
      this.errorsHandlerService.handleInvalidToken(err);
      this.errorsHandlerService.handleDefaultError();
    }
  }
}
