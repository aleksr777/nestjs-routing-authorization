import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ActivityService } from './activity.service';
import { JwtPayload } from '../common/types/jwt-payload.type';

type ReqUser = Partial<JwtPayload> & { id?: number };

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private readonly activity: ActivityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<{ user?: ReqUser }>();
    const user = req.user;
    const userId =
      typeof user?.id === 'number'
        ? user.id
        : typeof user?.sub === 'number'
          ? user.sub
          : undefined;
    if (typeof userId === 'number') {
      void this.activity.setLastActivity(userId);
    }
    return next.handle();
  }
}
