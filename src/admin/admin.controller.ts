import {
  Get,
  Patch,
  Delete,
  Body,
  Req,
  Query,
  Param,
  Controller,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { SecurityAuditService } from '../audit/security-audit.service';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Role } from '../common/types/role.enum';
import { User } from '../users/entities/user.entity';
import { AdminService } from './admin.service';
import { AdminPasswordDto } from './dto/admin-password.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly authService: AuthService,
    private readonly audit: SecurityAuditService,
  ) {}

  private record(req: Request, event: string, targetUserId: number) {
    const admin = req.user as User;
    void this.audit.record({
      event,
      userId: +admin.id,
      ipAddress: req.ip || req.socket.remoteAddress || null,
      userAgent: req.get('user-agent') ?? null,
      details: { target_user_id: targetUserId },
    });
  }

  @Get('users/find')
  getUsers(@Query() q: GetUsersQueryDto) {
    return this.adminService.getUsersByQuery(
      q.limit,
      q.offset,
      q.field,
      q.search,
    );
  }

  @Get('users/:id')
  getUser(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.getUserById(id);
  }

  @Delete('users/delete/:id')
  async deleteUser(
    @Body() dto: AdminPasswordDto,
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const admin = req.user as User;
    await this.adminService.deleteUserById(+admin.id, +id, dto.password);
    this.record(req, 'ADMIN_USER_DELETED', +id);
  }

  @Patch('users/block/:id')
  async blockUser(
    @Body() dto: BlockUserDto,
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const admin = req.user as User;
    const blockedReason = dto.blocked_reason ? dto.blocked_reason : '';
    await this.adminService.blockUserById(
      +admin.id,
      +id,
      blockedReason,
      dto.password,
    );
    this.record(req, 'ADMIN_USER_BLOCKED', +id);
  }

  @Patch('users/unblock/:id')
  async unblockUser(
    @Body() dto: AdminPasswordDto,
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const admin = req.user as User;
    await this.authService.verifyUserPassword(+admin.id, dto.password);
    await this.adminService.unblockUserById(+id);
    this.record(req, 'ADMIN_USER_UNBLOCKED', +id);
  }
}
