import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import type { SetOptions } from '@redis/client/dist/lib/commands/SET';
import { EnvService } from '../../common/env-service/env.service';
import { ErrorsService } from '../../common/errors-service/errors.service';

const INCR_WITH_EXPIRE_SCRIPT = `
local value = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return value
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private isShuttingDown = false; // Flag to prevent re-closing

  constructor(
    private readonly envService: EnvService,
    private readonly errorsService: ErrorsService,
  ) {
    const host = envService.get('REDIS_HOST');
    const port = envService.get('REDIS_PORT', 'number');

    this.client = createClient({
      url: `redis://${host}:${port}`,
    });

    // Process termination handling
    const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    shutdownSignals.forEach((signal) => {
      process.on(signal, () => {
        if (this.isShuttingDown) return;
        this.isShuttingDown = true;
        this.client
          .quit()
          .then(() => {
            console.log(`Redis connection closed on ${signal}`);
            process.exit(0);
          })
          .catch(() => {
            console.error('Redis error (shutdownSignals)');
            process.exit(1);
          });
      });
    });
  }

  async onModuleInit(): Promise<void> {
    this.client.on('error', (err: unknown) => {
      this.errorsService.default(err, 'Redis error (onModuleInit).');
    });
    await this.client.connect();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;
    try {
      await this.client.quit();
      console.log('Redis connection closed gracefully');
    } catch (err) {
      this.errorsService.default(err, 'Redis error (onModuleDestroy).');
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  async set(
    key: string,
    value: string,
    options?: SetOptions,
  ): Promise<string | null> {
    try {
      return await this.client.set(key, value, options);
    } catch (err) {
      this.errorsService.default(err, 'Redis error (set).');
    }
  }

  async get(key: string) {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.errorsService.default(err, 'Redis error (get).');
    }
  }

  async del(key: string) {
    try {
      return await this.client.del(key);
    } catch (err) {
      this.errorsService.default(err, 'Redis error (del).');
    }
  }

  async incr(key: string) {
    try {
      return await this.client.incr(key);
    } catch (err) {
      this.errorsService.default(err, 'Redis error (incr).');
    }
  }

  async incrWithExpire(key: string, seconds: number): Promise<number> {
    try {
      const result = await this.client.eval(INCR_WITH_EXPIRE_SCRIPT, {
        keys: [key],
        arguments: [seconds.toString()],
      });
      if (typeof result !== 'number') {
        throw new Error('Unexpected Redis script result.');
      }
      return result;
    } catch (err) {
      this.errorsService.default(err, 'Redis error (incrWithExpire).');
    }
  }

  async expire(key: string, seconds: number) {
    try {
      return await this.client.expire(key, seconds);
    } catch (err) {
      this.errorsService.default(err, 'Redis error (expire).');
    }
  }

  async ttl(key: string) {
    try {
      return await this.client.ttl(key);
    } catch (err) {
      this.errorsService.default(err, 'Redis error (ttl).');
    }
  }
}
