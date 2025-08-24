import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ActivityService } from './activity.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ActivityFlushService {
  private readonly logger = new Logger(ActivityFlushService.name);
  constructor(
    private readonly activity: ActivityService,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  @Interval(60_000)
  async flush(): Promise<void> {
    const updates = await this.activity.scanActivities();
    if (!updates.length) return;

    for (const u of updates) {
      try {
        await this.userRepo.update({ id: u.id }, { last_activity_at: u.date });
        await this.activity.deleteKey(u.key);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.debug(`Flush failed for user ${u.id}: ${msg}`);
      }
    }
  }
}
