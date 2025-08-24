import { Injectable } from '@nestjs/common';
import { RedisService } from '../common/redis-service/redis.service';
import {
  LAST_ACTIVITY_KEY_PREFIX,
  LAST_ACTIVITY_TTL_SECONDS,
} from './activity.constants';

@Injectable()
export class ActivityService {
  constructor(private readonly redis: RedisService) {}

  private key(userId: number | string) {
    return `${LAST_ACTIVITY_KEY_PREFIX}:${userId}`;
  }

  async setLastActivity(
    userId: number | string,
    date: Date = new Date(),
  ): Promise<void> {
    const key = this.key(userId);
    await this.redis.set(key, date.toISOString(), {
      EX: LAST_ACTIVITY_TTL_SECONDS,
    });
  }

  // Исправлено под node-redis v4
  async scanActivities(): Promise<
    Array<{ id: number; date: Date; key: string }>
  > {
    const client = this.redis.getClient();
    const pattern = `${LAST_ACTIVITY_KEY_PREFIX}:*`;

    let cursor = 0;
    const out: Array<{ id: number; date: Date; key: string }> = [];

    do {
      const { cursor: nextCursor, keys } = await client.scan(cursor, {
        MATCH: pattern,
        COUNT: 200,
      });
      cursor = nextCursor;

      if (keys.length > 0) {
        const values = await client.mGet(keys);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const iso = values[i];
          if (!iso) continue;

          const idStr = key.substring(key.lastIndexOf(':') + 1);
          const id = Number(idStr);
          const date = new Date(iso);
          if (Number.isFinite(id) && !Number.isNaN(date.getTime())) {
            out.push({ id, date, key });
          }
        }
      }
    } while (cursor !== 0);

    return out;
  }

  async deleteKey(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
