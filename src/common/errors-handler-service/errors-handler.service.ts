import {
  Injectable,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { QueryFailedError, EntityNotFoundError } from 'typeorm';
import { ErrMessages } from './error-messages.constants';

@Injectable()
export class ErrorsHandlerService {
  handleDefaultError() {
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

  handleUserConflict(err: unknown) {
    if (this.isUniqueError(err)) {
      throw new ConflictException(ErrMessages.CONFLICT_USER_EXISTS);
    }
  }

  handleUserNotFound(err?: unknown) {
    if (!err) {
      throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
    }
    if (err instanceof EntityNotFoundError) {
      throw new NotFoundException(ErrMessages.USER_NOT_FOUND);
    }
  }

  handleInvalidEmailOrPassword(err: unknown, isPasswordValid?: boolean) {
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

  handleInvalidToken(err?: unknown) {
    if (!err) {
      throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
    }
    if (err instanceof Error) {
      if (
        err.name === 'TokenExpiredError' ||
        err.name === 'JsonWebTokenError'
      ) {
        throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
      }
    }
    if (
      err instanceof UnauthorizedException ||
      err instanceof EntityNotFoundError
    ) {
      throw new UnauthorizedException(ErrMessages.INVALID_TOKEN);
    }
  }

  handleTokenNotDefined() {
    throw new UnauthorizedException(ErrMessages.TOKEN_NOT_DEFINED);
  }

  handleTokenisJwtTokenBlacklisted() {
    throw new UnauthorizedException(ErrMessages.TOKEN_IS_BLACKLISTED);
  }

  handleExpiredOrInvalidResetToken() {
    throw new BadRequestException(ErrMessages.INVALID_RESET_TOKEN);
  }

  handleResetPassword(err: unknown) {
    if (
      err instanceof BadRequestException ||
      err instanceof UnauthorizedException ||
      err instanceof NotFoundException
    ) {
      throw err; // пробросить ошибку клиенту
    }
  }
}
