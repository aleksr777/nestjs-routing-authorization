import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { EnvService } from '../../common/env-service/env.service';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor(private readonly envService: EnvService) {
    const host = envService.getEnv('REDIS_HOST');
    const port = envService.getEnv('REDIS_PORT', 'number');

    this.client = createClient({
      url: `redis://${host}:${port}`,
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
    await this.client.quit();
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
