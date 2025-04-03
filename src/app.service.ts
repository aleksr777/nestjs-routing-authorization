import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello! Welcome to the project "nestjs-routing-authorization"!';
  }
}
