import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../types/role.enum';
import { ErrMessages } from '../types/error-messages.type';

interface AuthUser {
  id: number;
  role: Role;
}
type RequestWithUser = Request & { user?: AuthUser };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const role = req.user?.role;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException(ErrMessages.INSUFFICIENT_ACCESS_RIGHTS);
    }
    return true;
  }
}
