import { IsUUID, IsNotEmpty } from 'class-validator';

export class ConfirmTransferDto {
  @IsUUID()
  @IsNotEmpty()
  token!: string;
}
