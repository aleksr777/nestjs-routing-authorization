import { Query, Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/types/role.enum';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('find/users')
  getUsers(@Query() q: GetUsersQueryDto) {
    return this.adminService.getUsersByQuery(
      q.limit,
      q.offset,
      q.field,
      q.search,
    );
  }
}
