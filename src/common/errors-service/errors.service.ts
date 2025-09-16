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
import { ErrMessages } from './error-messages.type';
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
        return ErrMessages.INVALID_ACCESS_TOKEN;
      case TokenType.REFRESH:
        return ErrMessages.INVALID_REFRESH_TOKEN;
      case TokenType.RESET:
        return ErrMessages.INVALID_RESET_TOKEN;
      case TokenType.REGISTRATION:
        return ErrMessages.INVALID_REGISTRATION_TOKEN;
      case TokenType.ADMIN_TRANSFER:
        return ErrMessages.INVALID_ADMIN_TRANSFER_TOKEN;
      default:
        return ErrMessages.INVALID_TOKEN;
    }
  }

  private getTokenNotDefinedMessage(tokenType?: TokenType): string {
    switch (tokenType) {
      case TokenType.ACCESS:
        return ErrMessages.ACCESS_TOKEN_NOT_DEFINED;
      case TokenType.REFRESH:
        return ErrMessages.REFRESH_TOKEN_NOT_DEFINED;
      case TokenType.RESET:
        return ErrMessages.RESET_TOKEN_NOT_DEFINED;
      case TokenType.REGISTRATION:
        return ErrMessages.REGISTRATION_TOKEN_NOT_DEFINED;
      case TokenType.ADMIN_TRANSFER:
        return ErrMessages.ADMIN_TRANSFER_TOKEN_NOT_DEFINED;
      default:
        return ErrMessages.TOKEN_NOT_DEFINED;
    }
  }

  default(err?: unknown, message?: string) {
    const msg = message ?? ErrMessages.INTERNAL_SERVER_ERROR;
    if (err) console.error(msg, err);
    throw new InternalServerErrorException(msg);
  }

  badRequest(message?: string) {
    const msg = message ?? 'Bad Request';
    console.error(msg);
    throw new BadRequestException(msg);
  }

  forbidden(message?: string) {
    const msg = message ?? 'Forbidden';
    console.error(msg);
    throw new ForbiddenException(msg);
  }

  tokenNotDefined(tokenType?: TokenType) {
    const errMessage = this.getTokenNotDefinedMessage(tokenType);
    console.error(errMessage);
    throw new UnauthorizedException(errMessage);
  }

  invalidToken(err: unknown, tokenType?: TokenType) {
    const errMessage = this.getInvalidTokenMessage(tokenType);
    if (!err) {
      throw new UnauthorizedException(errMessage);
    }
    if (err instanceof Error) {
      console.error(errMessage, err);
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
    if (err) console.error(ErrMessages.CONFLICT_USER_EXISTS, err);
    if (this.isUniqueError(err)) {
      throw new ConflictException(ErrMessages.CONFLICT_USER_EXISTS);
    }
  }

  userNotFound(err?: unknown, message?: string) {
    if (err) console.error(`Error:`, err);
    if (err instanceof EntityNotFoundError || !err) {
      throw new NotFoundException(message ?? ErrMessages.USER_NOT_FOUND);
    }
  }

  invalidEmailOrPassword(err: unknown, isPasswordValid?: boolean) {
    if (err) console.error(`Error:`, err);
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
    console.error(ErrMessages.ACCESS_TOKEN_IS_BLACKLISTED);
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
    console.error(err, ErrMessages.ACCOUNT_BLOCKED);
    if (err) console.error(`Error:`, err);
    if (
      err instanceof BadRequestException ||
      err instanceof UnauthorizedException
    ) {
      throw err;
    }
    this.default(err);
  }

  accountBlocked(reason: string | null | undefined) {
    console.error(ErrMessages.ACCOUNT_BLOCKED);
    const message = reason
      ? `${ErrMessages.ACCOUNT_BLOCKED} Reason: ${reason}`
      : ErrMessages.ACCOUNT_BLOCKED;
    throw new UnauthorizedException(message);
  }

  throwIfServiceEmail() {
    console.error(ErrMessages.SERVICE_EMAIL_MATCH_USER_EMAIL);
    throw new BadRequestException(ErrMessages.SERVICE_EMAIL_MATCH_USER_EMAIL);
  }
}
