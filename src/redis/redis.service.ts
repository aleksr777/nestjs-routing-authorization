import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;

  constructor(private readonly configService: ConfigService) {
    const host = configService.getOrThrow<string>('REDIS_HOST');
    const port = parseInt(configService.getOrThrow<string>('REDIS_PORT'), 10);

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
