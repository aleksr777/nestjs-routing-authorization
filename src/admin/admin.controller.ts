import {
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Req,
  Query,
  Param,
  Controller,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/types/role.enum';
import { GetUsersQueryDto } from './dto/get-users-query.dto';
import { BlockUserDto } from './dto/block-user.dto';
import { TransferInitiateDto } from './dto/transfer-rights-initiate.dto';
import { AdminService } from './admin.service';
import { AdminTransferService } from './transfer-rights.service';
import { Request } from 'express';
import { User } from '../users/entities/user.entity';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly transfer: AdminTransferService,
  ) {}

  @Post('transfer/initiate')
  async initiateTransfer(
    @Body() dto: TransferInitiateDto,
    @Req() req: Request,
  ) {
    const admin = req.user as User;
    const adminId = +admin.id;
    const userId = +dto.id;
    return await this.transfer.initiateTransfer(adminId, userId);
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

  @Delete('users/delete/:id')
  async deleteUser(@Param('id', ParseIntPipe) id: number) {
    await this.adminService.deleteUserById(id);
  }

  @Patch('users/block/:id')
  async blockUser(
    @Body() dto: BlockUserDto,
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const admin = req.user as User;
    const adminId = +admin.id;
    const userId = +id;
    const blocked_reason = dto.blocked_reason ? dto.blocked_reason : '';
    await this.adminService.blockUserById(adminId, userId, blocked_reason);
  }

  @Patch('users/unblock/:id')
  async unblockUser(@Param('id', ParseIntPipe) id: number) {
    const userId = +id;
    await this.adminService.unblockUserById(userId);
  }
}
