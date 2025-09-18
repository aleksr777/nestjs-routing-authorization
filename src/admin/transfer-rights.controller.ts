import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { AdminTransferService } from './transfer-rights.service';
import { TransferConfirmDto } from './dto/transfer-rights-confirm.dto';
import { User } from '../users/entities/user.entity';

@Controller('admin/transfer')
@UseGuards(JwtAuthGuard)
export class AdminTransferSecureController {
  constructor(private readonly transfer: AdminTransferService) {}

  @Post('confirm')
  async confirmTransfer(@Body() dto: TransferConfirmDto, @Req() req: Request) {
    const user = req.user as User;
    return await this.transfer.confirmTransfer(dto.token, +user.id);
  }
}
