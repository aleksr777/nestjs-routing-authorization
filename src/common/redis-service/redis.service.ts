import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { EnvService } from '../../common/env-service/env.service';
import { ErrorsService } from '../../common/errors-service/errors.service';

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
          .catch((err) => {
            this.errorsService.default(err, 'Redis error (shutdownSignals).');
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

  async set(key: string, value: string, options?: Record<string, any>) {
    try {
      await this.client.set(key, value, options);
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
      await this.client.del(key);
    } catch (err) {
      this.errorsService.default(err, 'Redis error (del).');
    }
  }
}
