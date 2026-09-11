import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { SecurityConfigService } from '../../common/security-service/security-config.service';

@Injectable()
export class RefreshOriginGuard implements CanActivate {
  constructor(private readonly securityConfigService: SecurityConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    this.securityConfigService.assertAllowedOrigin(request.headers.origin);
    return true;
  }
}
