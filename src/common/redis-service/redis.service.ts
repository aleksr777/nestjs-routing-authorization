import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { EnvService } from '../../common/env-service/env.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private isShuttingDown = false; // Flag to prevent re-closing

  constructor(private readonly envService: EnvService) {
    const host = envService.getEnv('REDIS_HOST');
    const port = envService.getEnv('REDIS_PORT', 'number');

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
            console.error(`Error closing Redis on ${signal}:`, err);
            process.exit(1);
          });
      });
    });
  }

  async onModuleInit(): Promise<void> {
    this.client.on('error', (err: unknown) => {
      console.error(
        'Redis Client Error',
        err instanceof Error ? err.message : err,
      );
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
      console.error('Error closing Redis during onModuleDestroy:', err);
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }

  async set(key: string, value: string, options?: Record<string, any>) {
    try {
      await this.client.set(key, value, options);
    } catch (err) {
      console.error(`Redis error (set):`, err);
      throw new Error('RedisUnavailableException');
    }
  }

  async get(key: string) {
    try {
      return await this.client.get(key);
    } catch (err) {
      console.error(`Redis error (get):`, err);
      throw new Error('RedisUnavailableException');
    }
  }

  async del(key: string) {
    try {
      await this.client.del(key);
    } catch (err) {
      console.error(`Redis error (del):`, err);
      throw new Error('RedisUnavailableException');
    }
  }
}
