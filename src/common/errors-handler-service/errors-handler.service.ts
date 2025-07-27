import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { ErrMessages } from '../../types/error-messages.type';
import { TokenType } from '../../types/token-type.type';

@Injectable()
export class ErrorsHandlerService {
  default(err: unknown) {
    console.log(`Internal server error: ${String(err)}`);
    throw new InternalServerErrorException(ErrMessages.INTERNAL_SERVER_ERROR);
  }

  private isUniqueError(
    err: unknown,
  ): err is QueryFailedError & { code: string } {
    return (
      err instanceof QueryFailedError &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    );
  }

  tokenNotDefined(tokenType?: TokenType) {
    switch (tokenType) {
      case TokenType.ACCESS:
        throw new UnauthorizedException(ErrMessages.ACCESS_TOKEN_NOT_DEFINED);
      case TokenType.REFRESH:
        throw new UnauthorizedException(ErrMessages.REFRESH_TOKEN_NOT_DEFINED);
      case TokenType.RESET:
        throw new UnauthorizedException(ErrMessages.RESET_TOKEN_NOT_DEFINED);
      case TokenType.REGISTRATION:
        throw new UnauthorizedException(
          ErrMessages.REGISTRATION_TOKEN_NOT_DEFINED,
        );
      default:
        throw new UnauthorizedException(ErrMessages.TOKEN_NOT_DEFINED);
    }
  }

  invalidToken(err: unknown, tokenType?: TokenType) {
    let errMessage;
    switch (tokenType) {
      case TokenType.ACCESS:
        errMessage = ErrMessages.INVALID_ACCESS_TOKEN;
        break;
      case TokenType.REFRESH:
        errMessage = ErrMessages.INVALID_REFRESH_TOKEN;
        break;
      case TokenType.RESET:
        errMessage = ErrMessages.INVALID_RESET_TOKEN;
        break;
      case TokenType.REGISTRATION:
        errMessage = ErrMessages.INVALID_REGISTRATION_TOKEN;
        break;
      default:
        errMessage = ErrMessages.INVALID_TOKEN;
    }
    if (!err) {
      throw new UnauthorizedException(errMessage);
    }
    if (err instanceof Error) {
      if (
        err.name === 'TokenExpiredError' ||
        err.name === 'JsonWebTokenError'
      ) {
        throw new UnauthorizedException(errMessage);
      }
    }
    if (
      err instanceof UnauthorizedException ||
      err instanceof EntityNotFoundError
    ) {
      throw new UnauthorizedException(errMessage);
    }
  }

  userConflict(err: unknown) {
    if (this.isUniqueError(err)) {
      throw new ConflictException(ErrMessages.CONFLICT_USER_EXISTS);
    }
  }

  userNotFound(err?: unknown) {
    if (err instanceof EntityNotFoundError) {
      throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
    }
  }

  invalidEmailOrPassword(err: unknown, isPasswordValid?: boolean) {
    if (
      err instanceof EntityNotFoundError ||
      err instanceof UnauthorizedException
    ) {
      throw new UnauthorizedException(ErrMessages.INVALID_EMAIL_OR_PASSWORD);
    }
    if (!isPasswordValid) {
      throw new UnauthorizedException(ErrMessages.INVALID_EMAIL_OR_PASSWORD);
    }
  }

  jwtTokenBlacklisted() {
    throw new UnauthorizedException(ErrMessages.ACCESS_TOKEN_IS_BLACKLISTED);
  }

  resetPassword(err: unknown) {
    if (
      err instanceof BadRequestException ||
      err instanceof UnauthorizedException ||
      err instanceof NotFoundException
    ) {
      throw err;
    }
    this.default(err);
  }

  confirmRegistration(err: unknown) {
    if (
      err instanceof BadRequestException ||
      err instanceof UnauthorizedException
    ) {
      throw err;
    }
    this.default(err);
  }
}
