import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { ErrorsHandlerService } from '../common/errors-handler-service/errors-handler.service';
import { User } from '../users/entities/user.entity';
import { Brackets } from 'typeorm';
import {
  USER_PROFILE_FIELDS,
  USER_SECRET_FIELDS,
} from '../common/constants/user-select-fields.constants';
import { UserSearchableFieldsType } from '../common/types/search-users-fields.type';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly errorsHandlerService: ErrorsHandlerService,
  ) {}

  async getUsersByQuery(
    limit: number,
    offset: number,
    field?: UserSearchableFieldsType,
    search?: string,
  ) {
    try {
      if (limit <= 0 || offset < 0) {
        throw new BadRequestException('Invalid pagination parameters');
      }
      const qb = this.usersRepository
        .createQueryBuilder('user')
        .select(USER_PROFILE_FIELDS.map((f) => `user.${f}`))
        .take(limit)
        .skip(offset)
        .orderBy('user.id', 'DESC');
      if (search?.trim()) {
        const q = `%${search}%`;
        if (field) {
          qb.where(`user.${field} ILIKE :q`, { q });
        } else {
          qb.where(
            new Brackets((b) => {
              b.where('user.nickname ILIKE :q', { q })
                .orWhere('user.email ILIKE :q', { q })
                .orWhere('user.phone_number ILIKE :q', { q });
            }),
          );
        }
      }
      const users = await qb.getMany();
      return this.authService.removeSensitiveInfo(users, [
        ...USER_SECRET_FIELDS,
      ]);
    } catch (err: unknown) {
      this.errorsHandlerService.default(err);
    }
  }
}
