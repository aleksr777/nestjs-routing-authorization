import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { ErrMsg } from './error-messages.type';
import { TokenType } from '../types/token-type.type';

@Injectable()
export class ErrorsService {
  private isUniqueError(
    err: unknown,
  ): err is QueryFailedError & { code: string } {
    return (
      err instanceof QueryFailedError &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    );
  }

  private getInvalidTokenMessage(tokenType?: TokenType): string {
    switch (tokenType) {
      case TokenType.ACCESS:
        return ErrMsg.INVALID_ACCESS_TOKEN;
      case TokenType.REFRESH:
        return ErrMsg.INVALID_REFRESH_TOKEN;
      case TokenType.RESET:
        return ErrMsg.INVALID_RESET_TOKEN;
      case TokenType.REGISTRATION:
        return ErrMsg.INVALID_REGISTRATION_TOKEN;
      case TokenType.ADMIN_TRANSFER:
        return ErrMsg.INVALID_ADMIN_TRANSFER_TOKEN;
      case TokenType.EMAIL_CHANGE:
        return ErrMsg.INVALID_EMAIL_CHANGE_TOKEN;
      case TokenType.PASSWORD_CHANGE:
        return ErrMsg.INVALID_PASSWORD_CHANGE_TOKEN;
      default:
        return ErrMsg.INVALID_TOKEN;
    }
  }

  private getTokenNotDefinedMessage(tokenType?: TokenType): string {
    switch (tokenType) {
      case TokenType.ACCESS:
        return ErrMsg.ACCESS_TOKEN_NOT_DEFINED;
      case TokenType.REFRESH:
        return ErrMsg.REFRESH_TOKEN_NOT_DEFINED;
      case TokenType.ADMIN_TRANSFER:
        return ErrMsg.ADMIN_TRANSFER_TOKEN_NOT_DEFINED;
      case TokenType.RESET:
        return ErrMsg.RESET_TOKEN_NOT_DEFINED;
      case TokenType.REGISTRATION:
        return ErrMsg.REGISTRATION_TOKEN_NOT_DEFINED;
      case TokenType.EMAIL_CHANGE:
        return ErrMsg.EMAIL_CHANGE_TOKEN_NOT_DEFINED;
      case TokenType.PASSWORD_CHANGE:
        return ErrMsg.PASSWORD_CHANGE_TOKEN_NOT_DEFINED;
      default:
        return ErrMsg.TOKEN_NOT_DEFINED;
    }
  }

  default(err?: unknown, message?: string) {
    const msg = message ?? ErrMsg.INTERNAL_SERVER_ERROR;
    if (err) console.error(msg, err);
    throw new InternalServerErrorException(msg);
  }

  badRequest(message?: string) {
    const msg = message ?? 'Bad Request';
    throw new BadRequestException(msg);
  }

  forbidden(message?: string) {
    const msg = message ?? 'Forbidden';
    throw new ForbiddenException(msg);
  }

  tokenNotDefined(tokenType?: TokenType) {
    const errMessage = this.getTokenNotDefinedMessage(tokenType);
    throw new UnauthorizedException(errMessage);
  }

  invalidToken(err: unknown, tokenType?: TokenType) {
    const errMessage = this.getInvalidTokenMessage(tokenType);
    if (!err) {
      throw new UnauthorizedException(errMessage);
    }
    if (err instanceof Error) {
      if (
        err.name === 'TokenExpiredError' ||
        err.name === 'JsonWebTokenError' ||
        err.name === 'NotBeforeError'
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
      throw new ConflictException(ErrMsg.CONFLICT_USER_EXISTS);
    }
  }

  userNotFound(err?: unknown, message?: string) {
    if (err instanceof EntityNotFoundError || !err) {
      throw new NotFoundException(message ?? ErrMsg.USER_NOT_FOUND);
    }
  }

  invalidEmailOrPassword(err: unknown, isPasswordValid?: boolean) {
    if (
      err instanceof EntityNotFoundError ||
      err instanceof UnauthorizedException
    ) {
      throw new UnauthorizedException(ErrMsg.INVALID_EMAIL_OR_PASSWORD);
    }
    if (!isPasswordValid) {
      throw new UnauthorizedException(ErrMsg.INVALID_EMAIL_OR_PASSWORD);
    }
  }

  jwtTokenBlacklisted() {
    throw new UnauthorizedException(ErrMsg.ACCESS_TOKEN_IS_BLACKLISTED);
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

  accountBlocked(reason: string | null | undefined) {
    const message = reason
      ? `${ErrMsg.ACCOUNT_BLOCKED} Reason: ${reason}`
      : ErrMsg.ACCOUNT_BLOCKED;
    throw new UnauthorizedException(message);
  }

  throwIfServiceEmail() {
    throw new BadRequestException(ErrMsg.SERVICE_EMAIL_MATCH_USER_EMAIL);
  }
}
