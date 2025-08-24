import { HttpException, Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Brackets } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { MailService } from '../common/mail-service/mail.service';
import { RedisService } from '../common/redis-service/redis.service';
import { ErrorsHandlerService } from '../common/errors-handler-service/errors-handler.service';
import { User } from '../users/entities/user.entity';
import {
  USER_PROFILE_FIELDS,
  USER_SECRET_FIELDS,
} from '../common/constants/user-select-fields.constants';
import { LAST_ACTIVITY_KEY_PREFIX } from '../activity/activity.constants';
import { UserSearchableFieldsType } from '../common/types/search-users-fields.type';
import { Role } from '../common/types/role.enum';

@Injectable()
export class AdminService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly authService: AuthService,
    private readonly errorsHandlerService: ErrorsHandlerService,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
  ) {}

  async getUsersByQuery(
    limit: number,
    offset: number,
    field?: UserSearchableFieldsType,
    search?: string,
  ) {
    try {
      if (limit <= 0 || offset < 0)
        throw new BadRequestException('Invalid pagination parameters');
      const qb = this.usersRepository
        .createQueryBuilder('user')
        .select(USER_PROFILE_FIELDS.map((f) => `user.${f}`))
        .take(limit)
        .skip(offset)
        .orderBy('user.id', 'DESC');
      if (search?.trim()) {
        const q = `%${search}%`;
        if (field) qb.where(`user.${field} ILIKE :q`, { q });
        else
          qb.where(
            new Brackets((b) => {
              b.where('user.nickname ILIKE :q', { q })
                .orWhere('user.email ILIKE :q', { q })
                .orWhere('user.phone_number ILIKE :q', { q });
            }),
          );
      }
      const users = await qb.getMany();
      return this.authService.removeSensitiveInfo(users, [
        ...USER_SECRET_FIELDS,
      ]);
    } catch (err: unknown) {
      this.errorsHandlerService.default(err);
    }
  }

  async deleteUserById(userId: number): Promise<void> {
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const user = await qr.manager.findOneOrFail(User, {
        where: { id: userId },
        select: ['id', 'email', 'nickname', 'role'],
      });
      if (user.role === Role.ADMIN) {
        throw new BadRequestException(
          'Administrator account cannot be deleted this way',
        );
      }
      await qr.manager.delete(User, { id: userId });
      await qr.commitTransaction();
      const activityKey = `${LAST_ACTIVITY_KEY_PREFIX}:${userId}`;
      this.redisService.del(activityKey).catch(() => undefined);
      const subject = 'Account deleted by administrator';
      const text =
        `Hello, ${user.nickname}!\n\n` +
        `Your account has been permanently deleted by an administrator.\n\n`;
      const html =
        `<p>Hello, ${user.nickname}!</p>` +
        `<p>Your account has been permanently deleted by an administrator.</p>`;
      await this.mailService.sendMail(user.email, subject, text, html);
    } catch (err: unknown) {
      await qr.rollbackTransaction();
      if (err instanceof HttpException) {
        throw err;
      }
      this.errorsHandlerService.userNotFound(err);
      this.errorsHandlerService.default(err);
    } finally {
      await qr.release();
    }
  }
}
